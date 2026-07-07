#!/usr/bin/env node
/**
 * Starts Expo with LAN hosting for Expo Go.
 *
 * Node's fetch to api.expo.dev can fail on some Windows setups (TLS/proxy),
 * which crashes plain `expo start`. Setting EXPO_OFFLINE=1 makes Expo CLI use
 * the local SDK module map for dependency checks only — Metro, LAN, and the
 * app's own internet access (Firebase, etc.) are unaffected.
 */
import { spawn } from 'node:child_process';

const env = {
  ...process.env,
  EXPO_OFFLINE: '1',
};

const child = spawn('npx', ['expo', 'start', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
