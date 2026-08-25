import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APIError } from 'better-auth/api';

const signInEmail = vi.fn();

/** The action reaches Postgres through better-auth; only our branches are under test. */
vi.mock('$lib/server/auth', () => ({
  MIN_PASSWORD_LENGTH: 8,
  auth: { api: { signInEmail: (...args: unknown[]) => signInEmail(...args) } }
}));

const { actions } = await import('../../src/routes/login/+page.server');

/** A form POST reduced to what the action actually reads. */
const submit = (fields: Record<string, string>) => {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.append(k, v);
  const request = new Request('http://localhost/login', { method: 'POST', body });
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

const credentials = { email: 'dat@example.com', password: 'long-enough-1' };

beforeEach(() => {
  signInEmail.mockReset();
  signInEmail.mockResolvedValue({});
});

describe('login action', () => {
  it('signs in with the submitted credentials and redirects', async () => {
    const { thrown } = await run(credentials);

    expect(signInEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { email: credentials.email, password: credentials.password }
      })
    );
    expect(thrown).toMatchObject({ status: 303, location: '/' });
  });

  it.each([
    [{ email: '', password: 'long-enough-1' }, 'a missing email'],
    [{ email: 'dat@example.com', password: '' }, 'a missing password'],
    [{ email: '   ', password: 'long-enough-1' }, 'a whitespace-only email']
  ])('refuses %o — %s', async fields => {
    const { result } = await run(fields);

    expect(result).toMatchObject({
      status: 400,
      data: { message: 'Enter your email and password.' }
    });
    /* Nothing reaches better-auth when the form is incomplete. */
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it('trims the email before signing in', async () => {
    await run({ ...credentials, email: '  dat@example.com  ' });

    expect(signInEmail).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ email: 'dat@example.com' }) })
    );
  });

  it('reports a rejected sign-in without saying which half was wrong', async () => {
    signInEmail.mockRejectedValue(new APIError('UNAUTHORIZED', { message: 'Invalid password' }));

    const { result } = await run(credentials);

    /* The upstream message named the password; ours must not. */
    expect(result).toMatchObject({
      status: 400,
      data: { message: 'Email or password is incorrect.' }
    });
  });

  it('gives an unknown address the identical message', async () => {
    signInEmail.mockRejectedValue(new APIError('UNAUTHORIZED', { message: 'User not found' }));
    const unknown = await run({ ...credentials, email: 'nobody@example.com' });

    signInEmail.mockRejectedValue(new APIError('UNAUTHORIZED', { message: 'Invalid password' }));
    const wrongPassword = await run(credentials);

    /* Any difference here is an oracle for which addresses are registered. */
    expect(unknown.result).toMatchObject({ data: { message: 'Email or password is incorrect.' } });
    expect((unknown.result as { data: { message: string } }).data.message).toBe(
      (wrongPassword.result as { data: { message: string } }).data.message
    );
  });

  it('keeps the email so a failed attempt need not be retyped', async () => {
    signInEmail.mockRejectedValue(new APIError('UNAUTHORIZED', { message: 'nope' }));

    const { result } = await run(credentials);

    expect(result).toMatchObject({ data: { email: credentials.email } });
  });

  it('rethrows anything that is not an auth rejection', async () => {
    signInEmail.mockRejectedValue(new Error('postgres is down'));

    /* A dead database must surface as a 500, not as "password incorrect". */
    await expect(submit(credentials)).rejects.toThrow('postgres is down');
  });

  it('returns to the page that required signing in', async () => {
    const { thrown } = await run({ ...credentials, next: '/chats/abc' });

    expect(thrown).toMatchObject({ status: 303, location: '/chats/abc' });
  });

  it('refuses to redirect off-site', async () => {
    const { thrown } = await run({ ...credentials, next: 'https://evil.example/steal' });

    expect(thrown).toMatchObject({ location: '/' });
  });
});
