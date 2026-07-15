#!/usr/bin/env node
/**
 * Run Expo CLI with AVG TLS cert (corporate network) and verify login.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const avgCaCert = resolve(process.cwd(), 'certs/avg-web-mail-shield-root.pem');
const env = { ...process.env };

if (existsSync(avgCaCert)) {
  env.NODE_EXTRA_CA_CERTS = avgCaCert;
  delete env.NODE_TLS_REJECT_UNAUTHORIZED;
}

const result = spawnSync('npx', ['expo', 'whoami'], {
  stdio: 'inherit',
  shell: true,
  env,
});

process.exit(result.status ?? 1);
