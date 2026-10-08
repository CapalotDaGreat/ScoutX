#!/usr/bin/env node
// Release gate: static checks that a production iOS release must pass, plus the rules suite.
//
//   node scripts/release-gate.mjs                  full gate, exits 1 on FAIL or missing external config
//   node scripts/release-gate.mjs --skip-tests     skip the emulator rules suite
//   node scripts/release-gate.mjs --allow-external report missing external configuration without failing
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const skipTests = args.has('--skip-tests');
const allowExternal = args.has('--allow-external');

const PASS = 'PASS';
const FAIL = 'FAIL';
const EXTERNAL = 'EXTERNAL CONFIGURATION REQUIRED';

const read = (path) => readFileSync(join(root, path), 'utf8');
const readJson = (path) => JSON.parse(read(path));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
}

const TEXT_FILE = /\.(ts|tsx|js|mjs|cjs|json|md|html|plist|ya?ml|env|example|txt|rules)$|^\.env/i;

function scanTracked(pattern, { exclude = [] } = {}) {
  const hits = [];
  for (const file of trackedFiles()) {
    if (!TEXT_FILE.test(file) || exclude.some((prefix) => file.startsWith(prefix))) continue;
    const full = join(root, file);
    if (!existsSync(full)) continue;
    if (pattern.test(readFileSync(full, 'utf8'))) hits.push(file);
  }
  return hits;
}

async function loadLegalConfig() {
  // Node 22 strips types from this dependency-free module.
  return import(pathToFileURL(join(root, 'src/config/legalConfig.ts')).href);
}

const checks = [];
function check(name, fn) {
  checks.push({ name, fn });
}

check('Legal contacts configured', async () => {
  const { missingRequiredLegalContacts } = await loadLegalConfig();
  const missing = missingRequiredLegalContacts();
  return missing.length === 0
    ? [PASS, 'privacy, security and support contacts set']
    : [EXTERNAL, `LEGAL_CONFIG is missing ${missing.join(', ')}`];
});

check('Legal documents built and current', () => {
  const result = spawnSync(process.execPath, ['scripts/build-legal.mjs', '--check'], { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? [PASS, 'bundled legal content matches legal/documents'] : [FAIL, (result.stdout + result.stderr).trim()];
});

check('Store listing and age rating match the age policy', async () => {
  const { LEGAL_CONFIG } = await loadLegalConfig();
  const listing = readJson('store/listing.json');
  const rating = listing.ios?.ageRating;
  const problems = [];
  if (!rating) problems.push('store/listing.json has no ios.ageRating');
  else {
    if (rating.rating !== `${LEGAL_CONFIG.minimumAge}+`) problems.push(`rating ${rating.rating} != ${LEGAL_CONFIG.minimumAge}+`);
    if (rating.minimumAccountAge !== LEGAL_CONFIG.minimumAge) problems.push('minimumAccountAge differs from LEGAL_CONFIG.minimumAge');
    if (rating.userGeneratedContent !== true) problems.push('userGeneratedContent must be declared');
  }
  const copy = JSON.stringify(listing);
  const banned = [
    [/get discovered/i, '"get discovered" promise'],
    [/\bverified\b/i, '"verified" claim'],
    [/virus|malware[- ]?scan/i, 'scanning claim'],
    [/(?<!not )guarantee(s|d)? (a |your )?(trial|contract|selection)/i, 'outcome guarantee'],
    [/\uFFFD|\u00e2\u20ac/, 'broken characters'],
  ];
  for (const [pattern, label] of banned) if (pattern.test(copy)) problems.push(label);
  return problems.length === 0 ? [PASS, `${rating.rating}, user-generated content declared`] : [FAIL, problems.join('; ')];
});

check('Privacy manifest: no tracking, no location', () => {
  const expo = readJson('app.json').expo;
  const manifest = expo.ios?.privacyManifests ?? {};
  const types = (manifest.NSPrivacyCollectedDataTypes ?? []).map((entry) => entry.NSPrivacyCollectedDataType);
  const problems = [];
  if (manifest.NSPrivacyTracking !== false) problems.push('NSPrivacyTracking must be false');
  if ((manifest.NSPrivacyTrackingDomains ?? []).length > 0) problems.push('tracking domains declared');
  if (types.some((type) => /Location/.test(type))) problems.push('location declared as collected');
  for (const required of ['Name', 'EmailAddress', 'UserID', 'PhotosorVideos', 'CrashData', 'PurchaseHistory', 'Fitness']) {
    if (!types.includes(`NSPrivacyCollectedDataType${required}`)) problems.push(`missing ${required}`);
  }
  const location = (expo.plugins ?? []).find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-location');
  const options = location?.[1] ?? {};
  if (location && (options.isIosBackgroundLocationEnabled !== false || options.locationAlwaysPermission !== false)) {
    problems.push('background location must stay disabled');
  }
  return problems.length === 0 ? [PASS, `${types.length} data types, tracking off, foreground location only`] : [FAIL, problems.join('; ')];
});

check('Mock data cannot run in production', () => {
  const appMode = read('src/config/appMode.ts');
  const guarded = /useMockData\(\): boolean \{\s*if \(typeof __DEV__ !== 'undefined' && !__DEV__\) \{\s*return false;/.test(appMode);
  const eas = readJson('eas.json');
  const prodEnv = eas.build?.production?.env ?? {};
  const problems = [];
  if (!guarded) problems.push('useMockData() is not forced off for release builds');
  if (prodEnv.EXPO_PUBLIC_USE_MOCK_DATA) problems.push('eas.json production sets EXPO_PUBLIC_USE_MOCK_DATA');
  if (prodEnv.EXPO_PUBLIC_MOCK_DEMO_PASSWORD) problems.push('eas.json production sets a demo password');
  return problems.length === 0 ? [PASS, 'useMockData() returns false when __DEV__ is false'] : [FAIL, problems.join('; ')];
});

check('No AI key or AI endpoint in the client', () => {
  const eas = JSON.stringify(readJson('eas.json'));
  const problems = [];
  if (/EXPO_PUBLIC_OPENROUTER_API_KEY/.test(eas)) problems.push('eas.json defines EXPO_PUBLIC_OPENROUTER_API_KEY');
  const keys = scanTracked(/sk-or-v1-[A-Za-z0-9]{16,}/);
  if (keys.length) problems.push(`OpenRouter key in ${keys.join(', ')}`);
  const clientCalls = scanTracked(/openrouter\.ai/i, { exclude: ['functions/', 'docs/', 'legal/', 'tests/', 'scripts/'] })
    .filter((file) => file.startsWith('src/'));
  if (clientCalls.length) problems.push(`client calls OpenRouter: ${clientCalls.join(', ')}`);
  if (!/EXPO_PUBLIC_OPENROUTER_API_KEY must not be set for production builds/.test(read('app.config.ts'))) {
    problems.push('production build guard in app.config.ts is missing');
  }
  return problems.length === 0 ? [PASS, 'AI runs only through Cloud Functions secrets'] : [FAIL, problems.join('; ')];
});

check('No secrets committed', () => {
  const tracked = trackedFiles();
  const problems = [];
  for (const forbidden of ['GoogleService-Info.plist', 'google-services.json', '.env', '.env.local']) {
    if (tracked.includes(forbidden)) problems.push(`${forbidden} is tracked`);
  }
  const privateKeys = scanTracked(/-----BEGIN (RSA |EC |ENCRYPTED )?PRIVATE KEY-----(\\n|\s)*[A-Za-z0-9+/=]{40,}|"private_key_id"\s*:/);
  if (privateKeys.length) problems.push(`private key material in ${privateKeys.join(', ')}`);
  const webhook = scanTracked(/(REVENUECAT_WEBHOOK_SECRET|GUARDIAN_LINK_SECRET)\s*=\s*\S{8,}/);
  if (webhook.length) problems.push(`secret value in ${webhook.join(', ')}`);
  return problems.length === 0 ? [PASS, 'no key files or secret values tracked'] : [FAIL, problems.join('; ')];
});

check('Callable CORS closed by default', () => {
  const lib = join(root, 'functions/lib/callableOptions.js');
  if (!existsSync(lib)) execFileSync(npm, ['run', 'build', '--prefix', 'functions'], { cwd: root, stdio: 'ignore', shell: process.platform === 'win32' });
  const { resolveCallableCors } = createRequire(import.meta.url)(lib);
  const cases = [
    [{}, false],
    [{ CALLABLE_ALLOWED_ORIGINS: '*' }, false],
    [{ CALLABLE_ALLOWED_ORIGINS: 'http://insecure.example' }, false],
    [{ CALLABLE_ALLOWED_ORIGINS: 'https://scoutx.app' }, ['https://scoutx.app']],
  ];
  const wrong = cases.filter(([env, expected]) => JSON.stringify(resolveCallableCors(env)) !== JSON.stringify(expected));
  return wrong.length === 0 ? [PASS, 'no origins unless exact https origins are configured'] : [FAIL, `unexpected CORS for ${JSON.stringify(wrong.map(([env]) => env))}`];
});

check('Universal links file', () => {
  const problems = [];
  for (const path of ['public/.well-known/apple-app-site-association', 'public/apple-app-site-association']) {
    const text = read(path);
    if (/TEAMID/.test(text)) problems.push(`${path} still has the TEAMID placeholder`);
    if (/"\/guardian/.test(text)) problems.push(`${path} maps /guardian (guardian decisions are web-only)`);
    if (!/"\/report\/\*"/.test(text)) problems.push(`${path} does not map /report/*`);
  }
  return problems.length === 0 ? [PASS, 'Team ID set, /report mapped, /guardian web-only'] : [FAIL, problems.join('; ')];
});

check('Firestore and Storage rules suite', () => {
  if (skipTests) return ['SKIPPED', '--skip-tests'];
  const result = spawnSync(npm, ['run', 'test:rules'], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 256 * 1024 * 1024 });
  const output = `${result.stdout}\n${result.stderr}`;
  const pass = /# pass (\d+)/.exec(output)?.[1];
  const fail = /# fail (\d+)/.exec(output)?.[1];
  return result.status === 0 && fail === '0' ? [PASS, `${pass} tests`] : [FAIL, `exit ${result.status}, ${fail ?? '?'} failed`];
});

const rows = [];
for (const { name, fn } of checks) {
  try {
    const [state, detail] = await fn();
    rows.push({ name, state, detail });
  } catch (error) {
    rows.push({ name, state: FAIL, detail: error instanceof Error ? error.message : String(error) });
  }
}

const width = Math.max(...rows.map((row) => row.name.length));
for (const row of rows) console.log(`${row.state.padEnd(32)} ${row.name.padEnd(width)}  ${row.detail}`);

const failed = rows.filter((row) => row.state === FAIL || (row.state === EXTERNAL && !allowExternal));
console.log(failed.length === 0 ? '\nRelease gate: PASS' : `\nRelease gate: BLOCKED (${failed.length} item${failed.length === 1 ? '' : 's'})`);
process.exit(failed.length === 0 ? 0 : 1);
