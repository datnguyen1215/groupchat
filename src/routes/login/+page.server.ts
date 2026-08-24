import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth } from '$lib/server/auth';
import { safeNext } from '$lib/server/auth-form';
import type { Actions } from './$types';

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const next = safeNext(form.get('next'));

    if (!email || !password) {
      return fail(400, { email, message: 'Enter your email and password.' });
    }

    try {
      await auth.api.signInEmail({ body: { email, password }, headers: request.headers });
    } catch (e) {
      /**
       * One message for a missing account and a wrong password alike. Splitting
       * them turns this form into an oracle for which emails are registered.
       */
      if (e instanceof APIError) {
        return fail(400, { email, message: 'Email or password is incorrect.' });
      }
      throw e;
    }

    redirect(303, next);
  }
};
