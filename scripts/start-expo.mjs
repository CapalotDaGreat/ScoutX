#!/usr/bin/env node
/**
 * Starts Expo for Expo Go on a physical device (SDK 54).
 *
 * Mirrors the working Trading_App / Expo-go-Test pattern:
 *   NODE_EXTRA_CA_CERTS (AVG TLS) + --host lan + port 8081
 *
 * Always use: npm start
 * Do NOT use plain "npx expo start" on a phone — it often advertises 127.0.0.1.
 *
 * Development builds / Google Sign-In:
 *   npm run start:dev-client
 *   npm run android / npm run ios
 * Those modes must NOT set EXPO_PUBLIC_EXPO_GO (native Google module must resolve).
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const DEFAULT_EXPO_PORT = process.env.EXPO_DEV_SERVER_PORT ?? '8081';
const AVG_CA_CERT = resolve(process.cwd(), 'certs/avg-web-mail-shield-root.pem');

const args = process.argv.slice(2);
const online = args.includes('--online');
const tunnel = args.includes('--tunnel');
const localhost = args.includes('--localhost');
const wantsDevClient =
  args.includes('--dev-client') || args.includes('--android') || args.includes('--ios');
/** Expo Go stubs Metro for native-only modules (Google Sign-In, RN Firebase, Sentry). */
const expoGoSession = args.includes('--expo-go') || !wantsDevClient;
const expoArgs = args.filter(
  (arg) =>
    arg !== '--online' &&
    arg !== '--expo-go' &&
    arg !== '--tunnel' &&
    arg !== '--localhost' &&
    arg !== '--dev-client',
);

// Avoid Expo interactively hopping to 8082/8083 when a stale Metro is left running.
spawnSync('npx', ['--yes', 'kill-port', '8081', '8082', '8083'], {
  cwd: process.cwd(),
  stdio: 'ignore',
  shell: true,
});

spawnSync('node', ['scripts/sync-dev-env.mjs'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: true,
});

const env = { ...process.env };

// EXPO_TOKEN enables robot mode and breaks ngrok tunnel — only clear for tunnel.
if (!process.env.CI && tunnel) {
  env.EXPO_TOKEN = '';
}

if (existsSync(AVG_CA_CERT)) {
  env.NODE_EXTRA_CA_CERTS = AVG_CA_CERT;
  delete env.NODE_TLS_REJECT_UNAUTHORIZED;
} else {
  console.warn('[expo] AVG CA cert missing — run: npm run export-ca');
}

if (expoGoSession) {
  // Metro stubs + app.config plugin stripping for Expo Go.
  env.EXPO_PUBLIC_EXPO_GO = '1';
  env.EXPO_PUBLIC_APP_CHECK_ENABLED = 'false';
} else {
  delete env.EXPO_PUBLIC_EXPO_GO;
  console.log('[expo] Development-client mode — native Google Sign-In / App Check enabled');
}

if (online || tunnel || expoGoSession) {
  delete env.EXPO_OFFLINE;
} else {
  env.EXPO_OFFLINE = '1';
}

if (tunnel) {
  expoArgs.unshift('--tunnel');
} else if (localhost) {
  expoArgs.unshift('--localhost');
} else {
  // Same as Trading_App: advertise LAN so physical phones can connect.
  expoArgs.unshift('--host', 'lan');
}

if (
  wantsDevClient &&
  !expoArgs.includes('--dev-client') &&
  !args.includes('--android') &&
  !args.includes('--ios')
) {
  expoArgs.unshift('--dev-client');
}

if (!expoArgs.some((arg) => arg === '--port' || arg.startsWith('--port='))) {
  expoArgs.push('--port', tunnel ? '8081' : DEFAULT_EXPO_PORT);
}

const ipResult = spawnSync('node', ['scripts/get-lan-ip.mjs'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  shell: true,
});

const lanIp = ipResult.stdout?.trim();
const port = tunnel ? '8081' : DEFAULT_EXPO_PORT;

if (!localhost && !tunnel && lanIp) {
  env.REACT_NATIVE_PACKAGER_HOSTNAME = lanIp;
  console.log('');
  console.log('══════════════════════════════════════════════════');
  if (expoGoSession) {
    console.log('  Expo Go (iOS/Android) — scan QR or enter URL:');
    console.log(`  exp://${lanIp}:${port}`);
    console.log('  Do NOT use 127.0.0.1 on a physical phone.');
  } else {
    console.log('  Development build — open your ScoutX dev client:');
    console.log(`  Metro: http://${lanIp}:${port}`);
  }
  console.log('══════════════════════════════════════════════════');
  console.log(`  Local web: http://localhost:${port}`);
  console.log('');
} else if (localhost) {
  console.log(`[expo] Local only: http://localhost:${port}`);
}

const child = spawn('npx', ['expo', 'start', ...expoArgs], {
  stdio: 'inherit',
  shell: true,
  env,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
