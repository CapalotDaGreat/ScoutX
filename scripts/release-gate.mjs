#!/usr/bin/env node
// Release gate: static checks that a production iOS release must pass, plus the rules suite.
//
// Every check reports one of:
//   PASS
//   CODE BLOCKER                      something in this repository is wrong; always fails the gate
//   EXTERNAL CONFIGURATION REQUIRED   a console, secret, domain or account step outside the repo
//   LEGAL REVIEW REQUIRED             a decision for counsel / the owner (contacts, retention, wording)
//   NOT VALIDATED                     needs a real device, real email or a human reviewer
//   SKIPPED
//
//   node scripts/release-gate.mjs                  public-release gate: anything but PASS/SKIPPED fails
//   node scripts/release-gate.mjs --allow-external internal / TestFlight gate: only CODE BLOCKERs fail
//   node scripts/release-gate.mjs --skip-tests     skip the emulator rules suite
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GENERATED_PATH, generatedModule, verifyCvApproval } from './lib/cvApproval.mjs';
import { validationStates } from './lib/releaseValidation.mjs';
import { productionBuildProblems } from '../src/config/releaseBuildPolicy.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const skipTests = args.has('--skip-tests');
const allowExternal = args.has('--allow-external');

const PASS = 'PASS';
const FAIL = 'CODE BLOCKER';
const EXTERNAL = 'EXTERNAL CONFIGURATION REQUIRED';
const LEGAL = 'LEGAL REVIEW REQUIRED';
const NOT_VALIDATED = 'NOT VALIDATED';
const SKIPPED = 'SKIPPED';

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
    if (rating.privateModeUntilAge !== LEGAL_CONFIG.privateModeUntilAge) problems.push('privateModeUntilAge differs from LEGAL_CONFIG.privateModeUntilAge');
    if (rating.rating === '4+') {
      // A 4+ rating is only defensible while under-13 accounts stay private and parental consent is enforced server-side.
      const policy = read('src/features/youth-safety/policy.ts');
      const rules = read('firestore.rules');
      if (!/CHILD_SCOPES[^=]*=\s*\[\s*'ai_analysis'\s*\]/.test(policy)) problems.push('under-13 accounts may be granted scopes beyond ai_analysis');
      if (!/function isChild\(/.test(rules)) problems.push('firestore.rules has no under-13 private-mode guard');
      if (LEGAL_CONFIG.privateModeUntilAge !== 13) problems.push('4+ requires private mode for every account under 13');
    }
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

function pngInfo(path) {
  const data = readFileSync(join(root, path));
  if (data.length < 33 || data.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20), colorType: data.readUInt8(25) };
}

// App Review rejects placeholder icons (2.3.8); App Store icons must be 1024x1024 without alpha.
check('App icon and splash are final artwork', () => {
  const expo = readJson('app.json').expo;
  const splash = (expo.plugins ?? []).find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen');
  const problems = [];
  const icon = expo.icon ? pngInfo(expo.icon) : null;
  if (!icon) problems.push('app.json icon is missing or not a PNG');
  else {
    if (icon.width !== 1024 || icon.height !== 1024) problems.push(`icon is ${icon.width}x${icon.height}, needs 1024x1024`);
    if (icon.colorType === 4 || icon.colorType === 6) problems.push('icon has an alpha channel; App Store icons must be opaque');
  }
  const splashImage = splash?.[1]?.image ? pngInfo(splash[1].image) : null;
  if (!splashImage || splashImage.width < 200 || splashImage.height < 200) {
    problems.push(`splash image is ${splashImage ? `${splashImage.width}x${splashImage.height}` : 'missing'}`);
  }
  return problems.length === 0 ? [PASS, '1024x1024 opaque icon, real splash image'] : [FAIL, problems.join('; ')];
});

// The App Store privacy policy, terms and support URLs must open real pages about this app.
check('Website pages for App Store URLs', () => {
  const host = readJson('app.json').expo.extra?.appLinkHost;
  const listing = readJson('store/listing.json').ios ?? {};
  const pages = { privacyPolicyUrl: 'public/privacy/index.html', supportUrl: 'public/support/index.html' };
  const problems = [];
  const contacts = [];
  const review = [];
  for (const [field, page] of Object.entries(pages)) {
    const url = listing[field] ?? '';
    if (!url.startsWith(`https://${host}/`)) problems.push(`${field} ${url || '(missing)'} is not on ${host}`);
    if (!existsSync(join(root, page))) problems.push(`${page} missing (run node scripts/build-legal.mjs)`);
    else {
      if (/(LEGAL|PRIVACY|SECURITY)_CONTACT_REQUIRED/.test(read(page))) contacts.push(page);
      if (/LEGAL_REVIEW_REQUIRED/.test(read(page))) review.push(page);
    }
  }
  if (problems.length) return [FAIL, problems.join('; ')];
  if (contacts.length) return [EXTERNAL, `contact placeholders in ${contacts.join(', ')}`];
  if (review.length) return [LEGAL, `effective date / review placeholders in ${review.join(', ')}`];
  return [PASS, `privacy and support pages on ${host}`];
});

check('Legal documents approved by counsel', () => {
  const pending = trackedFiles().filter(
    (file) => file.startsWith('legal/documents/') && TEXT_FILE.test(file) && /LEGAL_REVIEW_REQUIRED/.test(read(file)),
  );
  if (pending.length > 0) {
    return [LEGAL, `${pending.length} document(s) marked LEGAL_REVIEW_REQUIRED`];
  }
  // Absence of markers is not proof of counsel review (residual-risk / owner process).
  return [NOT_VALIDATED, 'no LEGAL_REVIEW_REQUIRED markers; counsel review not independently verified'];
});

check('Retention periods approved', () => {
  const open = (read('docs/privacy/retention-matrix.md').match(/LEGAL REVIEW REQUIRED/g) ?? []).length;
  return open === 0 ? [PASS, 'retention matrix approved'] : [LEGAL, `${open} retention period(s) awaiting legal review`];
});

// Account deletion: server-only, recent sign-in enforced on the server, no client fallback.
check('Account deletion is server-enforced', () => {
  const problems = [];
  const server = read('functions/src/appleAuth.ts');
  if (!/assertDeletionAuthorized\(db, uid, request\.auth\?\.token\)/.test(server)) {
    problems.push('deleteAuthenticatedAccount does not check recent sign-in');
  }
  if (!/assertDeletionAuthorized/.test(read('functions/src/safety/youthConsent.ts'))) {
    problems.push('setAgeBand under-13 deletion does not check recent sign-in');
  }
  const client = read('src/features/auth/services/accountService.ts');
  if (/\bdeleteUser\b|deleteDoc\(/.test(client)) problems.push('client still deletes the account or data locally');
  return problems.length === 0 ? [PASS, 'recent sign-in checked server-side, no local fallback'] : [FAIL, problems.join('; ')];
});

/** Deployed functions read `functions/.env` and `functions/.env.<project>` (kept out of git). */
function functionsEnv() {
  const project = readJson('.firebaserc').projects?.default;
  return ['functions/.env', `functions/.env.${project}`]
    .filter((file) => existsSync(join(root, file)))
    .map((file) => read(file))
    .join('\n');
}

check('AI footage processing approved', () => {
  const config = read('functions/src/ai/providerConfig.ts');
  const problems = [];
  if (!/export function isFootageProcessingApproved/.test(config)) {
    problems.push('isFootageProcessingApproved missing');
  }
  // Fail closed: only exact "true" (or emulator) authorises footage.
  if (!/AI_FOOTAGE_PROCESSING_APPROVED\?\.trim\(\) === 'true'/.test(config)) {
    problems.push('approval must require exact env value true');
  }
  for (const [file, needle] of [
    ['functions/src/uploads/sessions.ts', 'isFootageProcessingApproved'],
    ['functions/src/analysis/frameAnalysis.ts', 'isFootageProcessingApproved'],
    ['functions/src/analysis/segmentPipeline.ts', 'isFootageProcessingApproved'],
    ['functions/src/analysis/videoConsent.ts', 'isFootageProcessingApproved'],
  ]) {
    if (!new RegExp(needle).test(read(file))) problems.push(`${file} does not enforce the footage gate`);
  }
  if (problems.length) return [FAIL, problems.join('; ')];
  return /^AI_FOOTAGE_PROCESSING_APPROVED=true$/m.test(functionsEnv())
    ? [PASS, 'operator approved the AI provider for footage']
    : [EXTERNAL, 'AI_PRIVACY_CONFIGURATION_REQUIRED: footage analysis stays off until AI_FOOTAGE_PROCESSING_APPROVED=true'];
});

check('Backups configured', () => {
  const doc = read('docs/security/backups.md');
  return /BACKUP_CONFIGURATION_REQUIRED/.test(doc)
    ? [EXTERNAL, 'BACKUP_CONFIGURATION_REQUIRED (Firestore PITR / scheduled exports, Storage)']
    : [PASS, 'backup configuration recorded'];
});

check('Security findings resolved or accepted', () => {
  const rows = read('docs/security/security-findings.md')
    .split('\n')
    .filter((line) => /^\|\s*SEC-\d+/.test(line))
    .map((line) => line.split('|').map((cell) => cell.trim()));
  const open = (severity) => rows.filter((cells) => cells[2] === severity && /^OPEN/.test(cells[3]));
  const blocking = [...open('Critical'), ...open('High')].map((cells) => cells[1]);
  if (blocking.length) return [FAIL, `open Critical/High findings: ${blocking.join(', ')}`];
  const pending = rows.filter((cells) => /OWNER ACCEPTANCE REQUIRED/.test(cells[3])).map((cells) => cells[1]);
  return pending.length === 0 ? [PASS, `${rows.length} findings tracked`] : [NOT_VALIDATED, `owner acceptance pending: ${pending.join(', ')}`];
});

check('Real-device and end-to-end validation', () => {
  const { failed, pending } = validationStates(read('docs/release/validation-matrix.md'));
  if (failed > 0) return [FAIL, `${failed} failed acceptance item(s) in docs/release/validation-matrix.md`];
  return pending === 0 ? [PASS, 'validation matrix complete'] : [NOT_VALIDATED, `${pending} item(s) in docs/release/validation-matrix.md`];
});

check('Production build environment supplied', () => {
  // EAS secrets are remote; a local pass only checks the supplied environment, not its provenance.
  const env = { ...readJson('eas.json').build?.production?.env, ...process.env };
  const plist = env.GOOGLE_SERVICES_PLIST?.trim() || 'GoogleService-Info.plist';
  const problems = productionBuildProblems(env, 'ios', existsSync(resolve(root, plist)));
  const unsafe = problems.filter((problem) => problem.kind === 'unsafe');
  if (unsafe.length) return [FAIL, unsafe.map((problem) => problem.message).join('; ')];
  return problems.length
    ? [EXTERNAL, `not supplied locally (verify EAS production environment): ${problems.map((problem) => problem.field).join(', ')}`]
    : [PASS, 'supplied iOS environment passes build policy; verify EAS values match'];
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
  const moduleUrl = pathToFileURL(join(root, 'src/config/appMode.ts')).href;
  const probe = `const {useMockData}=await import(${JSON.stringify(moduleUrl)});
    globalThis.__DEV__=false; if(useMockData()!==false) process.exit(1);
    delete globalThis.__DEV__; if(useMockData()!==false) process.exit(1);`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
    cwd: root, encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, EXPO_PUBLIC_USE_MOCK_DATA: 'true' },
  });
  const guarded = result.status === 0 && !result.error;
  const eas = readJson('eas.json');
  const prodEnv = eas.build?.production?.env ?? {};
  const problems = [];
  if (!guarded) problems.push('useMockData() is not forced off for release builds');
  if (prodEnv.EXPO_PUBLIC_USE_MOCK_DATA) problems.push('eas.json production sets EXPO_PUBLIC_USE_MOCK_DATA');
  if (prodEnv.EXPO_PUBLIC_MOCK_DEMO_PASSWORD) problems.push('eas.json production sets a demo password');
  return problems.length === 0 ? [PASS, 'forced mock flag stays off in release and unknown runtimes (executed)'] : [FAIL, problems.join('; ')];
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
  if (!/productionBuildProblems\(/.test(read('app.config.ts'))) {
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
  const webhook = scanTracked(/(^|\n)[ \t]*(export[ \t]+)?(REVENUECAT_WEBHOOK_SECRET|GUARDIAN_LINK_SECRET)[ \t]*=[ \t]*\S{8,}/);
  if (webhook.length) problems.push(`secret value in ${webhook.join(', ')}`);
  return problems.length === 0 ? [PASS, 'no key files or secret values tracked'] : [FAIL, problems.join('; ')];
});

check('RevenueCat production key is not a Test Store key', () => {
  const problems = [];
  const prodKey = readJson('eas.json').build?.production?.env?.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
  if (prodKey.startsWith('test_')) problems.push('eas.json production uses a test_ key');
  const tracked = scanTracked(/EXPO_PUBLIC_REVENUECAT_IOS_KEY[ \t]*[=:][ \t]*["']?test_/);
  if (tracked.length) problems.push(`Test Store key in ${tracked.join(', ')}`);
  if (!/productionBuildProblems\(/.test(read('app.config.ts'))) {
    problems.push('production build guard in app.config.ts is missing');
  }
  return problems.length === 0 ? [PASS, 'missing or non-appl_ keys are refused by the production build policy'] : [FAIL, problems.join('; ')];
});

check('Callable CORS closed by default', () => {
  const lib = join(root, 'functions/lib/callableOptions.js');
  if (!existsSync(lib)) execFileSync(npm, ['run', 'build', '--prefix', 'functions'], { cwd: root, stdio: 'ignore', shell: process.platform === 'win32' });
  const { resolveCallableCors } = createRequire(import.meta.url)(lib);
  const cases = [
    [{}, false],
    [{ CALLABLE_ALLOWED_ORIGINS: '*' }, false],
    [{ CALLABLE_ALLOWED_ORIGINS: 'http://insecure.example' }, false],
    [{ CALLABLE_ALLOWED_ORIGINS: 'https://pitchproof.online' }, ['https://pitchproof.online']],
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

const SCRAPING_PACKAGES = [
  'cheerio', 'puppeteer', 'puppeteer-core', 'jsdom', 'node-html-parser', 'htmlparser2', 'parse5', 'crawlee',
  'x-ray', 'osmosis', 'open-graph-scraper', 'metascraper', 'link-preview-js', 'react-native-link-preview',
  'react-native-webview', 'got-scraping', 'unfurl.js',
];
const NETWORK_CALL = /\bfetch\s*\(|XMLHttpRequest|\baxios\b|\bhttps?\.(get|request)\s*\(|\bWebView\b|<iframe|\bonSchedule\b|\btaskQueue\s*\(|\bopenBrowserAsync\b/;

check('External football sources are link-only', async () => {
  const problems = [];
  const clientCore = read('src/features/football-sources/core.ts');
  if (clientCore.replace(/\r\n/g, '\n') !== read('functions/src/footballSources/core.ts').replace(/\r\n/g, '\n')) {
    problems.push('client and server provider registries differ');
  }
  const core = await import(pathToFileURL(join(root, 'src/features/football-sources/core.ts')).href);
  const ids = core.FOOTBALL_SOURCE_PROVIDERS.map((provider) => provider.id);
  const hosts = core.FOOTBALL_SOURCE_PROVIDERS.flatMap((provider) => provider.allowedHosts);
  if (new Set(ids).size !== ids.length) problems.push('duplicate provider id');
  if (new Set(hosts).size !== hosts.length) problems.push('duplicate provider host');
  for (const provider of core.FOOTBALL_SOURCE_PROVIDERS) {
    if (provider.mode !== 'link_only' || provider.linkOnly !== true) problems.push(`${provider.id} is not link-only`);
    if (provider.legalReviewStatus === 'approved_for_api' || provider.legalReviewStatus === 'approved_for_import') {
      problems.push(`${provider.id} claims API/import approval`);
    }
    for (const host of provider.allowedHosts) {
      const parsed = core.parseFootballSourceUrl(`https://${host}/`);
      if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || !parsed.ok || parsed.provider.id !== provider.id) {
        problems.push(`${provider.id} host ${host} is not a plain https hostname`);
      }
    }
  }
  for (const [url, expected] of [
    ['http://www.fvrz.ch/', 'not_https'],
    ['javascript:alert(1)', 'not_https'],
    ['https://fvrz.ch.attacker.com/', 'unsupported_provider'],
    ['https://evilfvrz.ch/', 'unsupported_provider'],
    ['https://example.com/', 'unsupported_provider'],
  ]) {
    const parsed = core.parseFootballSourceUrl(url);
    if (parsed.ok || parsed.error !== expected) problems.push(`${url} is not rejected as ${expected}`);
  }
  if (core.FOOTBALL_SOURCE_PROVENANCE !== 'self_reported_with_link') problems.push('provenance is not self_reported_with_link');
  const sourceType = /export type ExternalFootballSource = \{([\s\S]*?)\n\};/.exec(clientCore)?.[1] ?? '';
  if (!sourceType || /\b(verified|official)\??:/.test(sourceType)) problems.push('source type has a verified/official field or is missing');
  const rulesBlock = /match \/players\/\{userId\}\/footballSources\/\{sourceId\} \{([\s\S]*?)\}/.exec(read('firestore.rules'))?.[1] ?? '';
  if (!/allow write: if false;/.test(rulesBlock)) problems.push('clients can write footballSources');
  const featureFiles = trackedFiles().filter(
    (file) => /\.(ts|tsx)$/.test(file) && (file.startsWith('src/features/football-sources/') || file.startsWith('functions/src/footballSources/')),
  );
  if (featureFiles.length === 0) problems.push('feature files not tracked');
  for (const file of featureFiles) {
    if (NETWORK_CALL.test(read(file))) problems.push(`${file} makes a network call, schedule, task or embed`);
  }
  const deps = { ...readJson('package.json').dependencies, ...readJson('functions/package.json').dependencies };
  const scrapers = SCRAPING_PACKAGES.filter((name) => name in deps);
  if (scrapers.length) problems.push(`scraping/preview packages installed: ${scrapers.join(', ')}`);
  const doc = existsSync(join(root, 'docs/compliance/external-football-sources.md')) ? read('docs/compliance/external-football-sources.md') : '';
  if (!/not\s+legal\s+advice/i.test(doc) || !/not\s+legal\s+approval/i.test(doc)) problems.push('compliance note missing or does not disclaim legal approval');
  return problems.length === 0
    ? [PASS, `${ids.length} link-only providers, https only, no fetch code, docs present`]
    : [FAIL, problems.join('; ')];
});

check('Video analysis mode shared by app and server', () => {
  return read('src/features/match-analysis/services/analysisMode.ts') === read('functions/src/analysis/mode.ts')
    ? [PASS, 'analysisMode.ts and functions/src/analysis/mode.ts are identical']
    : [FAIL, 'mode rules differ between app and server; copy src/features/match-analysis/services/analysisMode.ts'];
});

check('Video consent enforced server-side', () => {
  const problems = [];
  for (const file of ['functions/src/uploads/sessions.ts', 'functions/src/analysis/frameAnalysis.ts', 'functions/src/analysis/segmentPipeline.ts']) {
    if (!/assertVideoConsent\(/.test(read(file))) problems.push(`${file} does not check video consent`);
  }
  if (!/match \/videoProcessingConsents\/\{jobId\} \{[^}]*allow write: if false;/.test(read('firestore.rules'))) {
    problems.push('clients can write videoProcessingConsents');
  }
  const consent = read('functions/src/analysis/videoConsent.ts');
  if (!/retainSource: input\.retainSource === true/.test(consent) || !/evidenceClips: input\.evidenceClips === true/.test(consent)) {
    problems.push('keep-video / evidence-clip options are not opt-in');
  }
  return problems.length === 0 ? [PASS, 'upload, analysis and segment review require an unrevoked per-job consent'] : [FAIL, problems.join('; ')];
});

check('Footage lifecycle: source deleted unless kept, uncited media removed', () => {
  const problems = [];
  const index = read('functions/src/index.ts');
  for (const name of ['onMatchJobMediaLifecycle', 'onMatchJobDeleted', 'mediaLifecycleSweep']) {
    if (!new RegExp(`\\b${name}\\b`).test(index)) problems.push(`${name} not exported`);
  }
  const lifecycle = read('functions/src/analysis/mediaLifecycle.ts');
  if (!/deleteSource: job\.retainSource !== true/.test(lifecycle)) problems.push('source deletion is not the default');
  if (!/if \(!job\.evidenceClipsRequested/.test(lifecycle)) problems.push('evidence clips are not opt-in');
  if (!/job\.get\('retainSource'\) === true/.test(read('functions/src/uploads/quarantine.ts'))) problems.push('temporary footage is filed in the media library');
  if (!/matchFootage\/\{jobId\}\/clips\/\{fileName\} \{[^}]*allow create, update: if false;/.test(read('storage.rules'))) {
    problems.push('clients can write evidence clips');
  }
  return problems.length === 0 ? [PASS, 'cleanup on completion/cancel, retry window on failure, hourly sweep, purge on delete'] : [FAIL, problems.join('; ')];
});

const cvApproval = verifyCvApproval(root);

check('No facial recognition or biometric identity matching', () => {
  const banned = /\b(face[-_]?recognition|face[-_]?api|deepface|insightface|facenet|dlib|arcface|mediapipe|expo-face-detector|face-detector|vision-camera-face|ml-kit[^"]*face|@react-native-ml-kit\/face)/i;
  const manifests = ['package.json', 'functions/package.json', 'workers/football-cv/requirements.txt', 'workers/football-cv/requirements-dev.txt'];
  const hits = manifests.filter((path) => existsSync(join(root, path)) && banned.test(read(path)));
  const contract = read('workers/football-cv/app/contract.py');
  if (!/faceRecognition: Literal\[False\]/.test(contract)) hits.push('worker contract accepts faceRecognition');
  if (!/faceRecognition: false/.test(read('functions/src/analysis/cvContract.ts'))) hits.push('functions request does not pin faceRecognition: false');
  return hits.length === 0
    ? [PASS, 'identity uses jersey number, kit colour and the player\'s own confirmation only']
    : [FAIL, hits.join('; ')];
});

check('Computer-vision worker stays off until approved', () => {
  const config = read('functions/src/analysis/cvConfig.ts');
  if (!/APPROVED_CV_WORKER/.test(config) || !/isApprovedWorkerOutput/.test(read('functions/src/analysis/cvWorker.ts'))) {
    return [FAIL, 'runtime approval check missing from cvConfig.ts / cvWorker.ts'];
  }
  const generated = read(GENERATED_PATH).replace(/\r\n/g, '\n');
  if (generated !== generatedModule(cvApproval.runtime)) {
    return [FAIL, `${GENERATED_PATH} does not match the verified approval record (hand-edited or stale)`];
  }
  const env = functionsEnv();
  const url = /^CV_WORKER_URL=\S+/m.test(env);
  const approved = /^CV_WORKER_APPROVED=true$/m.test(env);
  const events = /^CV_EVENTS_VALIDATED=true$/m.test(env);
  if (cvApproval.state === 'invalid') return [FAIL, `approval record rejected: ${cvApproval.problems.slice(0, 4).join('; ')}`];
  if (!url && !approved && !events) return [PASS, 'worker not configured: every CV stage reports unavailable'];
  if (cvApproval.state !== 'approved') {
    return [FAIL, 'CV_WORKER_* flags set without a verified approval record; the runtime ignores them, remove them'];
  }
  if (events && !cvApproval.runtime.eventsApproved) return [FAIL, 'CV_EVENTS_VALIDATED set but the approval does not cover events'];
  return url && approved ? [PASS, `worker ${cvApproval.runtime.workerVersion} approved and pinned`] : [EXTERNAL, 'CV_WORKER_URL / CV_WORKER_APPROVED partially configured'];
});

check('Video intelligence validated on real footage', () => {
  if (cvApproval.state === 'approved') return [PASS, `real-footage evaluation verified (report ${cvApproval.runtime.reportSha256.slice(0, 12)})`];
  if (cvApproval.state === 'invalid') return [FAIL, cvApproval.problems.slice(0, 4).join('; ')];
  return [NOT_VALIDATED, 'PRODUCTION LIMITED: still-frame review only; no verified real-footage evaluation (docs/video/evaluation/approval.json absent)'];
});

check('Callable abuse rate limits', () => {
  const module = read('functions/src/security/rateLimit.ts');
  const problems = [];
  if (!/assertCallableRateLimit/.test(module)) problems.push('assertCallableRateLimit missing');
  if (!/DISCOVERY_SEARCH_LIMIT/.test(read('functions/src/discoveryProjection.ts'))) {
    problems.push('discovery search is not rate-limited');
  }
  if (!/MEDIA_PLAYBACK_LIMIT/.test(read('functions/src/mediaAccess.ts'))) {
    problems.push('media playback URL minting is not rate-limited');
  }
  if (!/ASK_THIS_MATCH_LIMIT/.test(read('functions/src/askThisMatch.ts'))) {
    problems.push('askThisMatch is not rate-limited');
  }
  if (!/AI_INSIGHT_LIMIT/.test(read('functions/src/aiCoach.ts'))) {
    problems.push('generateAiInsight is not rate-limited');
  }
  if (!/match \/callableRateLimits/.test(read('firestore.rules'))) {
    problems.push('callableRateLimits rules missing');
  }
  return problems.length === 0
    ? [PASS, 'discovery, playback, ask-this-match and AI insight callables are bounded']
    : [FAIL, problems.join('; ')];
});

check('Encryption inventory documented', () => {
  const doc = read('docs/security/encryption-inventory.md');
  const problems = [];
  if (!/Transport \(TLS\)/.test(doc)) problems.push('TLS section missing');
  if (!/Encryption at rest/.test(doc)) problems.push('at-rest section missing');
  if (!/Certificate pinning is \*\*not\*\* implemented/.test(doc)) problems.push('pinning decision missing');
  if (!/Secret Manager/.test(doc)) problems.push('key material section incomplete');
  return problems.length === 0 ? [PASS, 'encryption inventory present'] : [FAIL, problems.join('; ')];
});

check('Entitlement matrix matches server plans', () => {
  const plansSource = read('functions/src/entitlements/plans.ts');
  const matrix = read('docs/release/entitlement-matrix.md');
  const inventory = read('docs/release/feature-inventory.md');
  const problems = [];
  if (!/NEVER_PAYWALLED/.test(plansSource)) problems.push('NEVER_PAYWALLED missing from plans.ts');
  if (!/consumeQuota/.test(read('functions/src/entitlements/quotaService.ts'))) {
    problems.push('quotaService missing consumeQuota');
  }
  if (!/consumeQuota/.test(read('functions/src/uploads/sessions.ts'))) {
    problems.push('upload sessions do not consume full_match quota');
  }
  // Load compiled plans (source of truth) and require the matrix to cite the same numbers.
  const lib = join(root, 'functions/lib/entitlements/plans.js');
  if (!existsSync(lib)) {
    execFileSync(npm, ['run', 'build', '--prefix', 'functions'], { cwd: root, stdio: 'ignore', shell: process.platform === 'win32' });
  }
  const { PLANS, NEVER_PAYWALLED } = createRequire(import.meta.url)(lib);
  const expected = [
    ['frame_analysis', PLANS.free.limits.frame_analysis, PLANS.premium.limits.frame_analysis],
    ['full_match_analysis', PLANS.free.limits.full_match_analysis, PLANS.premium.limits.full_match_analysis],
    ['reel_export', PLANS.free.limits.reel_export, PLANS.premium.limits.reel_export],
  ];
  for (const [feature, freeLimit, premiumLimit] of expected) {
    const row = new RegExp(`${feature}[^\\n]*\\|\\s*${freeLimit}\\s*\\|\\s*${premiumLimit}\\s*\\|`);
    if (!row.test(matrix)) {
      problems.push(`matrix missing ${feature} free=${freeLimit} premium=${premiumLimit} from plans.ts`);
    }
  }
  if (!new RegExp(`Concurrent analysis jobs\\s*\\|\\s*${PLANS.free.maxConcurrentJobs}\\s*\\|\\s*${PLANS.premium.maxConcurrentJobs}\\s*\\|`).test(matrix)) {
    problems.push('matrix concurrent-job limits do not match plans.ts');
  }
  if (!/Never paywalled/i.test(matrix)) {
    problems.push('matrix missing Never paywalled section');
  }
  for (const item of NEVER_PAYWALLED) {
    const prose = item.replace(/_/g, '[_ ]');
    if (!new RegExp(prose, 'i').test(matrix)) {
      problems.push(`never-paywalled item ${item} not reflected in matrix`);
    }
  }
  if (!/Unavailable/.test(inventory) || !/Continuous tracking/.test(inventory)) {
    problems.push('docs/release/feature-inventory.md must list CV as unavailable');
  }
  if (!/presentPaywall/.test(read('src/features/premium/services/purchasesService.ts'))) {
    problems.push('paywall entry point missing');
  }
  if (/request\.data\.isPremium|data\.isPremium/.test(read('functions/src/entitlements/quotaService.ts'))) {
    problems.push('quotaService must not read client isPremium');
  }
  return problems.length === 0
    ? [PASS, `plans.ts limits mirrored in matrix (free frame ${PLANS.free.limits.frame_analysis}, full ${PLANS.free.limits.full_match_analysis})`]
    : [FAIL, problems.join('; ')];
});

check('Controlled evaluation checklist present', () => {
  const doc = read('docs/release/controlled-evaluation-checklist.md');
  const owner = read('docs/release/owner-acceptance.md');
  const problems = [];
  if (!/Sandbox purchases/.test(doc)) problems.push('purchase tests missing from checklist');
  if (!/Pass \/ Fail/.test(doc)) problems.push('pass/fail columns missing');
  if (!/Public release remains blocked/.test(doc)) problems.push('public-release blocker note missing');
  if (!/SEC-10/.test(owner) || !/How to accept/.test(owner)) problems.push('owner-acceptance process incomplete');
  return problems.length === 0
    ? [PASS, 'controlled-evaluation and owner-acceptance docs ready']
    : [FAIL, problems.join('; ')];
});

check('Client ids are not Math.random', () => {
  const secure = read('src/utils/secureId.ts');
  if (!/getRandomValues|getRandomBytes/.test(secure)) {
    return [FAIL, 'secureId.ts does not use a CSPRNG'];
  }
  const hits = scanTracked(/Math\.random\(\)\.toString\(36\)/, {
    exclude: ['tests/', 'docs/', 'scripts/', 'functions/', 'workers/', 'e2e/'],
  }).filter((file) => file.startsWith('src/') && !file.includes('mock'));
  return hits.length === 0
    ? [PASS, 'client-generated ids use secureId']
    : [FAIL, `Math.random id generators remain in ${hits.join(', ')}`];
});

check('App Check enforcement defaults on outside the emulator', () => {
  const options = read('functions/src/callableOptions.ts');
  if (!/ENFORCE_APP_CHECK !== 'false'/.test(options) && !/shouldEnforceAppCheck/.test(options)) {
    return [FAIL, 'callable App Check default is missing'];
  }
  const env = functionsEnv();
  if (/^ENFORCE_APP_CHECK=false$/m.test(env)) {
    return [FAIL, 'functions .env disables App Check; remove ENFORCE_APP_CHECK=false for production'];
  }
  if (readJson('app.json').expo.ios?.entitlements?.['com.apple.developer.devicecheck.appattest-environment'] !== 'production') {
    return [FAIL, 'iOS App Attest production entitlement is missing'];
  }
  return [EXTERNAL, 'App Check code defaults on; App Attest / provider registration still EXTERNAL (SEC-15)'];
});

check('Firestore and Storage rules suite', () => {
  if (skipTests) return [SKIPPED, '--skip-tests'];
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

const counts = Object.fromEntries([PASS, FAIL, EXTERNAL, LEGAL, NOT_VALIDATED, SKIPPED].map((state) => [state, rows.filter((row) => row.state === state).length]));
console.log(`\n${Object.entries(counts).map(([state, count]) => `${state}: ${count}`).join(' | ')}`);
const failed = rows.filter((row) => row.state === FAIL || (!allowExternal && row.state !== PASS && row.state !== SKIPPED));
const mode = allowExternal ? 'internal / TestFlight' : 'public release';
console.log(failed.length === 0 ? `Release gate (${mode}): PASS` : `Release gate (${mode}): BLOCKED (${failed.length} item${failed.length === 1 ? '' : 's'})`);
process.exit(failed.length === 0 ? 0 : 1);
