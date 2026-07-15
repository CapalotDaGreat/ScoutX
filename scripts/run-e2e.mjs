#!/usr/bin/env node
/**
 * Runs Playwright E2E tests with a dedicated Expo web server on port 8090.
 */
import { spawn } from 'node:child_process';

const env = {
  ...process.env,
  EXPO_PUBLIC_APP_CHECK_ENABLED: '0',
  PLAYWRIGHT_WEB_PORT: process.env.PLAYWRIGHT_WEB_PORT ?? '8090',
  PLAYWRIGHT_BASE_URL:
    process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_WEB_PORT ?? '8090'}`,
};

delete env.PLAYWRIGHT_SKIP_WEBSERVER;

const child = spawn('npx', ['playwright', 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
