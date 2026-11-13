#!/usr/bin/env node
// Checks an EAS build profile before a billed build, using the real Expo config evaluation.
//
//   node scripts/eas-preflight.mjs --profile production [--env-file <file from `eas env:pull`>] [--allow-dirty]
//
// It never prints environment values: only variable names, the commit and pass/fail lines. Exit code 1 on any problem.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RELEASE_PROFILES = new Set(['simulator', 'preview', 'production']);
const BUNDLE_ID = 'com.scoutx.app';

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const profile = arg('--profile');
const envFile = arg('--env-file');
const allowDirty = args.includes('--allow-dirty');
const problems = [];
const note = (line) => console.log(`  ${line}`);
const fail = (line) => { problems.push(line); console.log(`  FAIL ${line}`); };

if (!profile || !RELEASE_PROFILES.has(profile)) {
  console.error('usage: node scripts/eas-preflight.mjs --profile simulator|preview|production [--env-file path] [--allow-dirty]');
  process.exit(2);
}

const root = resolve(new URL('..', import.meta.url).pathname);
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
console.log(`EAS preflight: profile ${profile}`);
note(`commit ${git('rev-parse', 'HEAD')} tree ${git('rev-parse', 'HEAD^{tree}')}`);
const dirty = git('status', '--porcelain', '--untracked-files=no');
if (dirty && !allowDirty) fail('tracked files are modified: build only from a clean checkout of the approved SHA');

// eas.json: explicit environment, no automatic submission.
const eas = JSON.parse(readFileSync(resolve(root, 'eas.json'), 'utf8'));
const chain = [];
for (let name = profile; name; name = eas.build[name]?.extends) {
  if (!eas.build[name]) { fail(`eas.json has no build profile "${name}"`); break; }
  chain.unshift(eas.build[name]);
}
const merged = chain.reduce((acc, p) => ({ ...acc, ...p, env: { ...(acc.env ?? {}), ...(p.env ?? {}) }, ios: { ...(acc.ios ?? {}), ...(p.ios ?? {}) } }), {});
if (merged.environment !== 'production') fail(`profile ${profile} must set "environment": "production" explicitly (found ${merged.environment ?? 'none'})`);
else note('environment: production (explicit)');
if (merged.autoSubmit || merged.ios?.autoSubmit) fail('automatic submission is configured in the profile');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
for (const [name, script] of Object.entries(pkg.scripts ?? {})) {
  if (/eas\s+submit|--auto-submit|eas-build-on-success/.test(`${name} ${script}`)) fail(`package.json script "${name}" can submit a build`);
}
if (existsSync(resolve(root, '.github/workflows'))) note('CI workflows exist: check them for eas submit before building');
if (profile === 'simulator' ? merged.ios?.simulator !== true : merged.ios?.simulator === true) fail('ios.simulator does not match the profile');
const debugFlag = merged.env?.EXPO_PUBLIC_APP_CHECK_SIMULATOR_DEBUG;
if (profile === 'simulator' ? debugFlag !== 'simulator' : debugFlag !== undefined) fail('the simulator App Check flag is set where it must not be (or missing for the simulator profile)');

// Environment for the evaluation: the pulled EAS environment (if given), then the profile's env, as on the build runner.
const fileEnv = {};
if (envFile) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) fileEnv[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  note(`environment file: ${Object.keys(fileEnv).length} variables (${Object.keys(fileEnv).sort().join(', ')})`);
} else {
  note('no --env-file: evaluating with this shell\'s environment only (pull the EAS environment for a real check)');
}
const env = { ...process.env, ...fileEnv, ...(merged.env ?? {}), EAS_BUILD_PROFILE: profile, EAS_BUILD_PLATFORM: 'ios' };
for (const key of ['EXPO_PUBLIC_REVENUECAT_IOS_KEY']) {
  if (env[key] && !env[key].startsWith('appl_')) fail(`${key} is not an App Store (appl_) public key`);
}
if (!env.GOOGLE_SERVICES_PLIST && !existsSync(resolve(root, 'GoogleService-Info.plist'))) {
  fail('no native Firebase file: set the EAS file variable GOOGLE_SERVICES_PLIST (or point it at the pulled file)');
}

// Real Expo config evaluation (runs app.config.ts and its build gates). Output is parsed, never printed.
const run = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['expo', 'config', '--json', '--type', 'public'], { cwd: root, env, encoding: 'utf8' });
if (run.status !== 0) {
  const reason = (run.stderr || '').split('\n').filter((l) => /blocked|required|must|cannot/i.test(l)).slice(0, 12);
  fail(`expo config refused the ${profile} configuration`);
  for (const line of reason) note(`    ${line.replace(/=.*$/, '')}`);
} else {
  const config = JSON.parse(run.stdout);
  if (config.ios?.bundleIdentifier !== BUNDLE_ID) fail(`bundle identifier is not ${BUNDLE_ID}`);
  else note(`bundle ${BUNDLE_ID}`);
  if (config.ios?.entitlements?.['com.apple.developer.devicecheck.appattest-environment'] !== 'production') fail('App Attest entitlement is not "production"');
  else note('App Attest entitlement: production');
  if (!config.ios?.googleServicesFile) fail('ios.googleServicesFile is not set');
  note(`version ${config.version}; build number managed remotely (appVersionSource: ${eas.cli?.appVersionSource}); autoIncrement ${merged.autoIncrement ?? false}`);
}

console.log(problems.length ? `PREFLIGHT FAILED (${problems.length})` : 'PREFLIGHT PASSED');
process.exit(problems.length ? 1 : 0);
