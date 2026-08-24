import { json, error } from '@sveltejs/kit';

/**
 * Field-level validation errors, collected rather than thrown one at a time so a
 * client fixing a form sees every problem in one round trip.
 */
export type Invalid = { field: string; message: string };

export const fail = (status: number, message: string, invalid?: Invalid[]) =>
  error(status, { message, ...(invalid?.length ? { invalid } : {}) } as App.Error);

export const ok = <T>(data: T, status = 200) => json(data, { status });

export const readJson = async (request: Request): Promise<Record<string, unknown>> => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    fail(400, 'Body must be valid JSON');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    fail(400, 'Body must be a JSON object');
  return body as Record<string, unknown>;
};

/**
 * A tiny field reader. Each call records a problem instead of throwing, so the
 * caller can `check()` once at the end and report everything at once.
 */
export class Fields {
  private readonly problems: Invalid[] = [];

  constructor(private readonly body: Record<string, unknown>) {}

  has = (field: string) => this.body[field] !== undefined;

  private reject = (field: string, message: string) => {
    this.problems.push({ field, message });
    return undefined;
  };

  string = (
    field: string,
    opts: { required?: boolean; max?: number; allowEmpty?: boolean } = {}
  ): string | undefined => {
    const value = this.body[field];
    if (value === undefined) {
      if (opts.required) this.reject(field, 'is required');
      return undefined;
    }
    if (typeof value !== 'string') return this.reject(field, 'must be a string');
    const trimmed = value.trim();
    if (!trimmed && !opts.allowEmpty) return this.reject(field, 'must not be empty');
    if (opts.max && trimmed.length > opts.max)
      return this.reject(field, `must be at most ${opts.max} characters`);
    return trimmed;
  };

  enum = <T extends string>(
    field: string,
    allowed: readonly T[],
    opts: { required?: boolean } = {}
  ): T | undefined => {
    const value = this.body[field];
    if (value === undefined) {
      if (opts.required) this.reject(field, 'is required');
      return undefined;
    }
    if (typeof value !== 'string' || !allowed.includes(value as T))
      return this.reject(field, `must be one of: ${allowed.join(', ')}`);
    return value as T;
  };

  int = (
    field: string,
    opts: { required?: boolean; min?: number; max?: number } = {}
  ): number | undefined => {
    const value = this.body[field];
    if (value === undefined) {
      if (opts.required) this.reject(field, 'is required');
      return undefined;
    }
    if (typeof value !== 'number' || !Number.isInteger(value))
      return this.reject(field, 'must be an integer');
    if (opts.min !== undefined && value < opts.min)
      return this.reject(field, `must be at least ${opts.min}`);
    if (opts.max !== undefined && value > opts.max)
      return this.reject(field, `must be at most ${opts.max}`);
    return value;
  };

  stringArray = (field: string, opts: { required?: boolean } = {}): string[] | undefined => {
    const value = this.body[field];
    if (value === undefined) {
      if (opts.required) this.reject(field, 'is required');
      return undefined;
    }
    if (!Array.isArray(value) || value.some(v => typeof v !== 'string'))
      return this.reject(field, 'must be an array of strings');
    return [...new Set((value as string[]).map(v => v.trim()).filter(Boolean))];
  };

  /** Throws 422 with every problem found, or returns cleanly. */
  check = () => {
    if (this.problems.length) fail(422, 'Validation failed', this.problems);
  };
}

/** URL-safe id derived from a name, uniquified by the caller against the table. */
export const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'item';

/**
 * The frontend renders `'just now'`, `'Yesterday'`, `'Mon'`, `'14:32'` — the DB
 * stores a real timestamp. Formatting here keeps that presentation concern out
 * of every component while preserving the fixture vocabulary exactly.
 */
export const relativeTime = (at: Date, now = new Date()) => {
  const seconds = Math.max(0, (now.getTime() - at.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;

  const sameDay = at.toDateString() === now.toDateString();
  if (sameDay) return `${at.getHours()}:${at.getMinutes().toString().padStart(2, '0')}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (at.toDateString() === yesterday.toDateString()) return 'Yesterday';

  if (seconds < 7 * 86400) return at.toLocaleDateString('en-US', { weekday: 'short' });
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/** `size: '3.2 KB'` was a fixture literal; it is derived from the body now. */
export const byteSize = (body: string) => {
  const bytes = new TextEncoder().encode(body).length;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
};
