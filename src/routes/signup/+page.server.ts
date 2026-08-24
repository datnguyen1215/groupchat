import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { MIN_PASSWORD_LENGTH, auth } from '$lib/server/auth';
import { nameFromEmail } from '$lib/server/auth-form';
import type { Actions } from './$types';

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const confirm = String(form.get('confirm') ?? '');

    if (!email || !password) {
      return fail(400, { email, field: 'email', message: 'Enter your email and password.' });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return fail(400, {
        email,
        field: 'password',
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
      });
    }
    if (password !== confirm) {
      return fail(400, { email, field: 'confirm', message: "Passwords don't match." });
    }

    try {
      await auth.api.signUpEmail({
        body: { email, password, name: nameFromEmail(email) },
        headers: request.headers
      });
    } catch (e) {
      if (e instanceof APIError) {
        return fail(400, {
          email,
          field: 'email',
          message: 'An account with that email already exists.'
        });
      }
      throw e;
    }

    redirect(303, '/');
  }
};
