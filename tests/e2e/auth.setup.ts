import { expect, request, test as setup } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { STORAGE_STATE, TEST_USER } from '../support/auth';

/**
 * Signs the shared test account in once and saves the cookie. Every other
 * project loads it as `storageState`, so the specs never see the login page.
 * The account is created here rather than seeded so the password stays hashed
 * by better-auth itself.
 */
setup('authenticate', async ({ baseURL }) => {
  const ctx = await request.newContext({ baseURL });

  const res = await ctx.post('/api/auth/sign-up/email', {
    data: { email: TEST_USER.email, password: TEST_USER.password, name: 'tester' },
    failOnStatusCode: false
  });

  /* A rerun against a surviving schema finds the account already there. */
  if (!res.ok()) {
    const signIn = await ctx.post('/api/auth/sign-in/email', {
      data: { email: TEST_USER.email, password: TEST_USER.password }
    });
    expect(signIn.ok()).toBeTruthy();
  }

  mkdirSync(dirname(STORAGE_STATE), { recursive: true });
  await ctx.storageState({ path: STORAGE_STATE });
  await ctx.dispose();
});
