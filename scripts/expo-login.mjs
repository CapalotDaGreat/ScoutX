#!/usr/bin/env node
/**
 * Interactive Expo login with AVG TLS cert for corporate/school networks.
 * Run in your own terminal: npm run expo:login
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const avgCaCert = resolve(process.cwd(), 'certs/avg-web-mail-shield-root.pem');
const env = { ...process.env };

if (existsSync(avgCaCert)) {
  env.NODE_EXTRA_CA_CERTS = avgCaCert;
  delete env.NODE_TLS_REJECT_UNAUTHORIZED;
} else {
  console.warn('[expo:login] AVG CA cert missing — run: npm run export-ca');
}

console.log('Logging in to Expo (account: boddibossis-team / project: scoutx)');
console.log('Use your Expo username/email and password.\n');

const child = spawn('npx', ['expo', 'login'], {
  stdio: 'inherit',
  shell: true,
  env,
});

child.on('exit', (code) => {
  if (code === 0) {
    console.log('\nSuccess. Verify with: npm run expo:whoami');
  }
  process.exit(code ?? 0);
});
