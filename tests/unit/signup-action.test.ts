import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APIError } from 'better-auth/api';

const signUpEmail = vi.fn();

/** The action reaches Postgres through better-auth; only our branches are under test. */
vi.mock('$lib/server/auth', () => ({
  MIN_PASSWORD_LENGTH: 8,
  auth: { api: { signUpEmail: (...args: unknown[]) => signUpEmail(...args) } }
}));

const { actions } = await import('../../src/routes/signup/+page.server');

const submit = (fields: Record<string, string>) => {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.append(k, v);
  const request = new Request('http://localhost/signup', { method: 'POST', body });
  return actions.default({ request } as never);
};

/** `redirect()` throws; this unwraps it into something assertable. */
const run = async (fields: Record<string, string>) => {
  try {
    return { result: await submit(fields) };
  } catch (thrown) {
    return { thrown: thrown as { status: number; location: string } };
  }
};

const valid = {
  email: 'dat@example.com',
  password: 'long-enough-1',
  confirm: 'long-enough-1'
};

beforeEach(() => {
  signUpEmail.mockReset();
  signUpEmail.mockResolvedValue({});
});

describe('signup action', () => {
  it('creates the account and redirects into the app', async () => {
    const { thrown } = await run(valid);

    expect(signUpEmail).toHaveBeenCalledOnce();
    expect(thrown).toMatchObject({ status: 303, location: '/' });
  });

  it('derives the name from the address, since the form has no name field', async () => {
    await run(valid);

    expect(signUpEmail).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ name: 'dat' }) })
    );
  });

  it.each([
    [{ ...valid, email: '' }, 'a missing email'],
    [{ ...valid, password: '', confirm: '' }, 'a missing password']
  ])('refuses %o — %s', async fields => {
    const { result } = await run(fields);

    expect(result).toMatchObject({
      status: 400,
      data: { message: 'Enter your email and password.' }
    });
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it('refuses a password under the minimum length', async () => {
    const { result } = await run({ email: valid.email, password: 'short', confirm: 'short' });

    expect(result).toMatchObject({
      status: 400,
      data: { field: 'password', message: 'Password must be at least 8 characters.' }
    });
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it('refuses a confirmation that does not match', async () => {
    const { result } = await run({ ...valid, confirm: 'something-else-2' });

    expect(result).toMatchObject({
      status: 400,
      data: { field: 'confirm', message: "Passwords don't match." }
    });
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it('reports a short password before a mismatch, so the fix is the useful one', async () => {
    /* Both rules are broken; the length is the one the user must act on first. */
    const { result } = await run({ email: valid.email, password: 'abc', confirm: 'xyz' });

    expect(result).toMatchObject({ data: { field: 'password' } });
  });

  it('marks the field that failed so the form can highlight it', async () => {
    const short = await run({ email: valid.email, password: 'abc', confirm: 'abc' });
    const mismatch = await run({ ...valid, confirm: 'nope' });

    expect(short.result).toMatchObject({ data: { field: 'password' } });
    expect(mismatch.result).toMatchObject({ data: { field: 'confirm' } });
  });

  it('trims the email before creating the account', async () => {
    await run({ ...valid, email: '  dat@example.com  ' });

    expect(signUpEmail).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ email: 'dat@example.com' }) })
    );
  });

  it('reports an address that is already taken', async () => {
    signUpEmail.mockRejectedValue(
      new APIError('UNPROCESSABLE_ENTITY', { message: 'User already exists' })
    );

    const { result } = await run(valid);

    expect(result).toMatchObject({
      status: 400,
      data: { field: 'email', message: 'An account with that email already exists.' }
    });
  });

  it('keeps the email so a failed attempt need not be retyped', async () => {
    const { result } = await run({ ...valid, confirm: 'nope' });

    expect(result).toMatchObject({ data: { email: valid.email } });
  });

  it('never echoes the password back to the form', async () => {
    const { result } = await run({ ...valid, confirm: 'nope' });

    /* A re-rendered password is a password in the HTML source. */
    expect(JSON.stringify(result)).not.toContain(valid.password);
  });

  it('rethrows anything that is not an auth rejection', async () => {
    signUpEmail.mockRejectedValue(new Error('postgres is down'));

    await expect(submit(valid)).rejects.toThrow('postgres is down');
  });
});
