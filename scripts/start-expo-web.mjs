#!/usr/bin/env node
/**
 * Starts Expo web for Playwright E2E tests.
 */
import { spawn } from 'node:child_process';

const env = {
  ...process.env,
  EXPO_OFFLINE: '1',
  EXPO_PUBLIC_APP_CHECK_ENABLED: '0',
  EXPO_UNSAFE_DOTENV_KEYS: 'NODE_TLS_REJECT_UNAUTHORIZED',
  CI: '1',
};

const port = process.env.PLAYWRIGHT_WEB_PORT ?? '8090';

const child = spawn(
  'npx',
  ['expo', 'start', '--web', '--port', port, ...(process.env.EXPO_E2E_CLEAR === '1' ? ['--clear'] : [])],
  {
    stdio: 'inherit',
    shell: true,
    env,
  },
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
