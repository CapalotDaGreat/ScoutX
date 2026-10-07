#!/usr/bin/env node
/**
 * Authenticated E2E: boots Auth/Firestore/Storage/Functions emulators, seeds them, and runs
 * the Playwright flow specs against an Expo web server wired to the emulators.
 *
 *   npm run test:e2e:emulators            # all flows
 *   npm run test:e2e:emulators -- guest   # filter by spec name
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const accounts = JSON.parse(fs.readFileSync(new URL('../e2e/fixtures/accounts.json', import.meta.url), 'utf8'));
const port = process.env.PLAYWRIGHT_WEB_PORT ?? '8091';

const env = {
  ...process.env,
  E2E_EMULATORS: '1',
  EXPO_E2E_CLEAR: '1',
  EXPO_PUBLIC_USE_FIREBASE_EMULATORS: '1',
  EXPO_PUBLIC_APP_CHECK_ENABLED: 'false',
  EXPO_PUBLIC_EXPO_GO: '0',
  EXPO_PUBLIC_FORCE_FIREBASE_AUTH: 'true',
  EXPO_PUBLIC_FIREBASE_API_KEY: 'demo-api-key',
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: `${accounts.projectId}.firebaseapp.com`,
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: accounts.projectId,
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: `${accounts.projectId}.appspot.com`,
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  EXPO_PUBLIC_FIREBASE_APP_ID: '1:000000000000:web:e2e',
  EXPO_PUBLIC_USE_CLOUD_AI: '1',
  EXPO_PUBLIC_OPENROUTER_API_KEY: '',
  PLAYWRIGHT_WEB_PORT: port,
  PLAYWRIGHT_BASE_URL: `http://localhost:${port}`,
  CI: '1',
};
delete env.PLAYWRIGHT_SKIP_WEBSERVER;

// Playwright ORs positional filters, so pass only the requested specs when filtering.
const filters = process.argv.slice(2);
const targets = filters.length ? filters.map((name) => `e2e/flows/${name}`).join(' ') : 'e2e/flows';
const inner = [
  'node scripts/seed-emulators.mjs',
  `npx playwright test ${targets} --project=web-desktop`,
].join(' && ');

const child = spawn(
  'npx',
  [
    'firebase',
    'emulators:exec',
    '--only',
    'auth,firestore,storage,functions',
    '--project',
    accounts.projectId,
    `"${inner}"`,
  ],
  { stdio: 'inherit', shell: true, env },
);

child.on('exit', (code) => process.exit(code ?? 1));
