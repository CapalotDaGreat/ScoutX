// Shared helpers for the staging verification drivers (scripts/pilot-staging). Never prints credentials.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const requireFn = createRequire(path.join(root, 'functions/package.json'));

/**
 * Loads the target. `emulator` targets the local emulators (used to check the drivers themselves);
 * `staging` targets the approved staging project and refuses any project id listed in `forbiddenProjects`.
 */
export function loadConfig(file = process.env.STAGING_CONFIG) {
  if (!file) {
    const p = process.env.GCLOUD_PROJECT ?? 'demo-pilot-reh';
    return {
      target: 'emulator', project: p, region: 'europe-west6', bucket: `${p}.appspot.com`, apiKey: 'fake-api-key',
      functionsBase: `http://127.0.0.1:5001/${p}/europe-west6`,
      firestoreBase: `http://127.0.0.1:8080/v1/projects/${p}/databases/(default)/documents`,
      storageBase: `http://127.0.0.1:9199/v0/b/${p}.appspot.com/o`,
      authBase: 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1',
      workerBase: 'http://127.0.0.1:8790', workerAuth: 'none', workerVersion: process.env.FAKE_WORKER_VERSION ?? 'football-cv/0.7.0-reh',
      forbiddenProjects: ['scoutx-230b0'],
    };
  }
  const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const k of ['project', 'region', 'bucket', 'apiKey', 'workerBase', 'workerVersion']) if (!c[k]) throw new Error(`config lacks ${k}`);
  if ((c.forbiddenProjects ?? ['scoutx-230b0']).includes(c.project)) throw new Error(`refusing to run against ${c.project}`);
  return {
    target: 'staging', ...c,
    functionsBase: c.functionsBase ?? `https://${c.region}-${c.project}.cloudfunctions.net`,
    firestoreBase: `https://firestore.googleapis.com/v1/projects/${c.project}/databases/(default)/documents`,
    storageBase: `https://firebasestorage.googleapis.com/v0/b/${c.bucket}/o`,
    authBase: 'https://identitytoolkit.googleapis.com/v1',
  };
}

const SECRETISH = [
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '<jwt>'],
  [/ya29\.[A-Za-z0-9._-]+/g, '<access-token>'],
  [/([?&](token|X-Goog-Signature|X-Goog-Credential|key)=)[^&"\s]+/gi, '$1<redacted>'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(com|net|org|invalid|ch)/g, (m) => (m.endsWith('.gserviceaccount.com') ? `<sa:${m.split('@')[0].slice(0, 12)}â€¦>` : '<email>')],
  [/"(downloadTokens|idToken|refreshToken|access_token|id_token)"\s*:\s*"[^"]*"/g, '"$1":"<redacted>"'],
];
/** Redacts tokens, signatures, keys and e-mail addresses from any evidence before it is written. */
export function redact(value) {
  let s = typeof value === 'string' ? value : JSON.stringify(value);
  for (const [re, rep] of SECRETISH) s = s.replace(re, rep);
  return typeof value === 'string' ? s : JSON.parse(s);
}

/** Operator credentials for Google APIs (ADC) - staging only. */
export async function accessToken() {
  const { GoogleAuth } = requireFn('google-auth-library');
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  return (await auth.getClient().then((c) => c.getAccessToken())).token;
}

const WORKER_AUDIENCE = 'https://stg-fake-worker-315202089837.europe-west6.run.app';
const OPERATOR = 'stg-pilot-operator@pitchproof-stg-pilot2.iam.gserviceaccount.com';

export async function operatorIdentityToken(audience) {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return execFileSync('gcloud', ['auth', 'print-identity-token'], { encoding: 'utf8' }).trim();
  }
  if (audience !== WORKER_AUDIENCE && !/^https:\/\/[a-z0-9-]+-315202089837\.europe-west6\.run\.app$/.test(audience)) {
    throw new Error('Refusing a private invocation token outside staging');
  }
  const credentials = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
  if (credentials.type !== 'external_account' ||
      credentials.audience !== '//iam.googleapis.com/projects/315202089837/locations/global/workloadIdentityPools/scoutx-staging-gh/providers/github') {
    throw new Error('Expected ScoutX staging federation credentials');
  }
  delete credentials.service_account_impersonation_url;
  const { GoogleAuth } = requireFn('google-auth-library');
  const federated = await new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).fromJSON(credentials).getAccessToken();
  if (!federated.token) throw new Error('Federated access token unavailable');
  const endpoint = 'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/' + OPERATOR + ':generateIdToken';
  const reply = await fetch(endpoint, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Authorization: 'Bearer ' + federated.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ audience, includeEmail: true }),
  });
  if (!reply.ok) throw new Error('Staging identity token request failed with HTTP ' + reply.status);
  const result = await reply.json();
  if (!result.token) throw new Error('Staging identity token missing');
  return result.token;
}

export async function callableHeaders(cfg, user, name, identityToken = operatorIdentityToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (user) headers.Authorization = 'Bearer ' + user.token;
  if (cfg.target === 'staging') {
    const endpoint = cfg.callableUrls?.[name];
    if (!endpoint) throw new Error('Missing private endpoint for ' + name);
    headers['X-Serverless-Authorization'] = 'Bearer ' + await identityToken(endpoint);
  }
  return headers;
}

export function evidenceWriter(out, meta) {
  const ev = { ...meta, startedAt: new Date().toISOString(), steps: [], checks: [] };
  return {
    ev,
    step(name, data = {}) { const e = redact({ at: new Date().toISOString(), name, ...data }); ev.steps.push(e); console.log(`- ${name}`, JSON.stringify(e).slice(0, 300)); return e; },
    check(id, ok, detail = {}, status) {
      const st = status ?? (ok ? 'passed' : 'failed');
      ev.checks.push(redact({ id, status: st, ...detail }));
      console.log(`${st.toUpperCase()} ${id}`, JSON.stringify(redact(detail)).slice(0, 300));
      return ok;
    },
    write() {
      ev.finishedAt = new Date().toISOString();
      ev.summary = Object.fromEntries(['passed', 'failed', 'unexecuted'].map((k) => [k, ev.checks.filter((c) => c.status === k).map((c) => c.id)]));
      fs.writeFileSync(out, JSON.stringify(ev, null, 1));
      console.log('SUMMARY', JSON.stringify(Object.fromEntries(Object.entries(ev.summary).map(([k, v]) => [k, v.length]))));
      return ev.summary.failed.length === 0;
    },
  };
}

/**
 * Driver arguments: the output file is the first argument that is neither a flag nor the value of `--only`.
 * @param {string[]} args
 */
export function parseDriverArgs(args) {
  const onlyAt = args.indexOf('--only');
  const only = onlyAt >= 0 ? String(args[onlyAt + 1] ?? '').split(',').filter(Boolean) : [];
  const out = args.find((a, i) => !a.startsWith('--') && !(onlyAt >= 0 && i === onlyAt + 1)) ?? null;
  return { out, only, dryRun: args.includes('--dry-run') };
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function waitFor(fn, ms = 30000, every = 250) {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return null; await sleep(every); }
}
