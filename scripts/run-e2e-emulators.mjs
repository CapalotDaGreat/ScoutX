#!/usr/bin/env node
/**
 * Authenticated E2E: boots Auth/Firestore/Storage/Functions emulators, seeds them, and runs
 * the Playwright flow specs against an Expo web server wired to the emulators.
 *
 *   npm run test:e2e:emulators            # all flows
 *   npm run test:e2e:emulators -- guest   # filter by spec name
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { buildE2eRunCommands } from './lib/e2eRunPlan.mjs';

const accounts = JSON.parse(fs.readFileSync(new URL('../e2e/fixtures/accounts.json', import.meta.url), 'utf8'));
const port = process.env.PLAYWRIGHT_WEB_PORT ?? '8091';
const commands = buildE2eRunCommands({
  project: process.env.PLAYWRIGHT_PROJECT,
  filters: process.argv.slice(2),
  noRetries: process.env.E2E_NO_RETRIES,
  marketingCapture: process.env.MARKETING_CAPTURE,
});

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

// The Functions emulator reads secrets from functions/.secret.local and otherwise asks the real
// Secret Manager. Write a random throwaway value for this run only; it is gitignored and removed.
const secretFile = new URL('../functions/.secret.local', import.meta.url);
const createdSecretFile = !fs.existsSync(secretFile);
if (createdSecretFile) {
  const throwaway = () => `e2e-${randomBytes(24).toString('hex')}`;
  const secrets = {
    GUARDIAN_LINK_SECRET: throwaway(),
    // Apple revocation only runs for accounts with a stored Apple token; E2E accounts have none.
    APPLE_TEAM_ID: 'e2e-unused',
    APPLE_KEY_ID: 'e2e-unused',
    APPLE_PRIVATE_KEY: 'e2e-unused',
  };
  fs.writeFileSync(secretFile, Object.entries(secrets).map(([key, value]) => `${key}=${value}`).join('\n') + '\n');
}
const removeSecretFile = () => {
  if (createdSecretFile && fs.existsSync(secretFile)) fs.rmSync(secretFile);
};

let exitCode = 0;
try {
  // Restart the emulator process too: resetting documents alone does not drain
  // background triggers left by the preceding browser project's mutations.
  for (const inner of commands) {
    exitCode = await new Promise((resolve, reject) => {
      const child = spawn('npx', ['firebase', 'emulators:exec', '--only',
        'auth,firestore,storage,functions', '--project', accounts.projectId, `"${inner}"`],
      { stdio: 'inherit', shell: true, env });
      child.once('error', reject);
      child.once('exit', (code) => resolve(code ?? 1));
    });
    if (exitCode !== 0) break;
  }
} finally {
  removeSecretFile();
}
process.exitCode = exitCode;
