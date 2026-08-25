/**
 * Signs the agents into a site.
 *
 * Run it, log in by hand in the window that opens, then press Enter here. The
 * cookies are written to the state file that every agent browser context is
 * built from, so from then on the agents are already signed in.
 *
 *   npm run browser:login
 *   npm run browser:login -- https://instagram.com
 *
 * Agents never see a password: the sign-in happens in a browser you are
 * driving, and all they inherit is the cookie it leaves behind.
 *
 * Contexts are in memory, so a session the site refreshes later is not saved
 * back. Run this again when the agents start being asked to log in.
 */

import { createInterface } from 'node:readline/promises';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from 'playwright';
import { STATE_FILE } from '../src/lib/server/browser/server';

const url = process.argv[2] ?? 'https://www.google.com';

const main = async () => {
  mkdirSync(dirname(STATE_FILE), { recursive: true });

  /** Headed on purpose — this is the one browser a person drives. */
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(url);

  console.log(`\nA browser window is open at ${url}.`);
  console.log('Sign in there, then come back here.\n');

  const ask = createInterface({ input: process.stdin, output: process.stdout });
  await ask.question('Press Enter once you are signed in... ');
  ask.close();

  await context.storageState({ path: STATE_FILE });
  await browser.close();

  console.log(`\nSaved to ${STATE_FILE}`);
  console.log('The agents will start signed in. Run this again if they get signed out.\n');
};

main().catch(error => {
  console.error(error);
  process.exit(1);
});
