import { dev } from '$app/environment';

/**
 * The browser logger. Deliberately not a library: the whole job is a level
 * filter and a consistent prefix, and anything bigger (Sentry, an ingest
 * endpoint) is a shipping concern that would sit behind this same interface.
 *
 * The call shape matches pino's — `log.info({ id }, 'message')` — so server and
 * client code read the same way.
 *
 * Levels match the server's meaning: `error` failed, `warn` recovered, `info`
 * is what happened, `debug` is the high-volume detail. `debug` is off unless
 * `localStorage.LOG_LEVEL = 'debug'`, so noisy calls cost nothing by default.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

const RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Read once at load; flip it in devtools and reload. */
const threshold = (): number => {
  const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem('LOG_LEVEL');
  return RANK[(stored as Level) ?? (dev ? 'info' : 'warn')] ?? RANK.info;
};

const min = threshold();

const write = (level: Level, area: string, data: unknown, message?: string) => {
  if (RANK[level] < min) return;
  const text = message ?? (typeof data === 'string' ? data : '');
  const fields = typeof data === 'string' ? undefined : data;
  const method = level === 'debug' ? 'log' : level;
  if (fields) console[method](`[${area}] ${text}`, fields);
  else console[method](`[${area}] ${text}`);
};

export type Logger = Record<Level, (data: unknown | string, message?: string) => void>;

/** A logger tagged with the component or module it came from. */
export const logger = (area: string): Logger => ({
  debug: (data, message) => write('debug', area, data, message),
  info: (data, message) => write('info', area, data, message),
  warn: (data, message) => write('warn', area, data, message),
  error: (data, message) => write('error', area, data, message)
});

/**
 * Mount/unmount tracing for one component. Call at the top level of `<script>`:
 *
 *   const log = trace('Composer');
 *
 * Registers its own `$effect`, so a component gets its lifecycle logged in one
 * line and the pair can never drift apart.
 */
export const trace = (area: string): Logger => {
  const log = logger(area);
  $effect(() => {
    log.info('mount');
    return () => log.info('unmount');
  });
  return log;
};
