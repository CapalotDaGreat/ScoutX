#!/usr/bin/env node
/**
 * Review-image access and URL revocation around withholding, through the app's real mechanism (Firebase Storage
 * download tokens minted for an authorised client), the URL issuance endpoint (getMediaPlaybackUrl), report reads
 * and the account export. Runs against the emulators (no STAGING_CONFIG; used to check this driver) or the approved
 * staging project (STAGING_CONFIG=<file>, operator ADC; refuses production).
 *
 *   STAGING_CONFIG=staging.json node scripts/pilot-staging/image-revocation.mjs out.json
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { evidenceWriter, loadConfig, operatorIdentityToken, redact, requireFn, root, sleep, waitFor } from './lib.mjs';
import { driverGuard } from './limits.mjs';

const cfg = loadConfig();
const OUT = process.argv[2] ?? process.env.REHEARSAL_OUT ?? 'image-revocation-evidence.json';
const RUN = `ir${Date.now().toString(36)}`;
const { initializeApp } = requireFn('firebase-admin/app');
const { getFirestore } = requireFn('firebase-admin/firestore');
const { getStorage } = requireFn('firebase-admin/storage');
initializeApp({ projectId: cfg.project, storageBucket: cfg.bucket });
const db = getFirestore();
const bucket = getStorage().bucket();
const { VIDEO_CONSENT_VERSION } = requireFn(path.join(root, 'functions/lib/analysis/videoConsent.js'));
const E = evidenceWriter(OUT, { target: cfg.target, project: cfg.project, commit: process.env.REHEARSAL_COMMIT ?? null, run: RUN });

const doc = async (p) => { const s = await db.doc(p).get(); return s.exists ? s.data() : null; };
async function signUp(label) {
  const r = await fetch(`${cfg.authBase}/accounts:signUp?key=${cfg.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${RUN}-${label}@pitchproof-staging.invalid`, password: `stg-${RUN}-pw-1`, returnSecureToken: true }) });
  const j = await r.json();
  if (!j.localId) throw new Error(`signUp failed for ${label}: ${r.status}`);
  return { label, uid: j.localId, token: j.idToken };
}
async function callable(name, data, user) {
  const r = await fetch(`${cfg.functionsBase}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json',
    ...(user ? { Authorization: `Bearer ${user.token}` } : {}) }, body: JSON.stringify({ data }) });
  let j = null; try { j = await r.json(); } catch { /* none */ }
  return { http: r.status, result: j?.result ?? null, error: j?.error ? { status: j.error.status } : null };
}
const freshGet = (url, headers = {}) => fetch(url, { headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache', Connection: 'close', ...headers } });
const objUrl = (p) => `${cfg.storageBase}/${encodeURIComponent(p)}`;
async function read(p, user) { return (await freshGet(`${objUrl(p)}?alt=media`, user ? { Authorization: `Firebase ${user.token}` } : {})).status; }
async function tokenUrl(p, user) {
  const r = await freshGet(objUrl(p), { Authorization: `Firebase ${user.token}` });
  if (!r.ok) return null;
  const t = String((await r.json()).downloadTokens ?? '').split(',')[0];
  return t ? `${objUrl(p)}?alt=media&token=${t}` : null;
}
function ops(...args) {
  const extra = cfg.target === 'staging' ? ['--project', cfg.project, '--production-authorized', '--bucket', cfg.bucket] : [];
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/tracking-pilot-ops.mjs'), ...args, ...extra], { env: process.env, encoding: 'utf8' });
  const out = { args, exit: r.status, ms: Date.now() - t0, stdout: r.stdout.trim().slice(0, 2000), stderr: r.stderr.trim().slice(0, 500) };
  E.step('ops', out);
  return out;
}
const workerHeaders = () => (cfg.workerAuth === 'operator' ? { Authorization: `Bearer ${operatorIdentityToken()}` } : {});
const ctl = async (p, b) => (await fetch(`${cfg.workerBase}/_ctl/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...workerHeaders() },
  body: JSON.stringify(b) })).json();
const waiting = async (jobId, route) => (await (await fetch(`${cfg.workerBase}/_ctl/waiting?jobId=${jobId}&route=${route}`, { headers: workerHeaders() })).json()).waiting;
const objects = async (u, j) => (await bucket.getFiles({ prefix: `profiles/${u.uid}/matchFootage/${j}/` }))[0].map((f) => f.name.split(`/${j}/`)[1]).sort();
const imagesIn = (d) => [...new Set([...JSON.stringify(d?.report ?? d?.moments ?? {}).matchAll(/"(profiles\/[^"]+\/tracking\/[^"]+\.jpg)"/g)].map((m) => m[1]))];
/** Owner-visible review + discovery images of a job. */
const ownerImages = async (j) => [...imagesIn(await doc(`matchAnalysisJobs/${j}/tracking/current`)), ...imagesIn(await doc(`matchAnalysisJobs/${j}/tracking/discovery`))];
/** Every way a client could obtain a link for `p`: download-token metadata read and the playback-URL callable. */
async function issuance(p, user) {
  const meta = (await freshGet(objUrl(p), user ? { Authorization: `Firebase ${user.token}` } : {})).status;
  const call = await callable('getMediaPlaybackUrl', { storagePath: p }, user);
  return { meta, callable: call.result?.url ? 'url_issued' : (call.error?.status ?? call.http) };
}
const issuedNothing = (r) => r.meta !== 200 && r.callable !== 'url_issued';
async function seedJob(jobId, owner, targeting = { kitPrimaryColor: 'orange' }) {
  const prefix = `profiles/${owner.uid}/matchFootage/${jobId}/`;
  await bucket.file(`${prefix}video.mp4`).save(Buffer.from(`synthetic video ${jobId}`), { contentType: 'video/mp4', resumable: false });
  await db.doc(`matchAnalysisJobs/${jobId}`).set({ playerId: owner.uid, targeting, videoStoragePath: `${prefix}video.mp4`,
    measuredDurationSec: 60, durationSec: 60, status: 'failed', pipelineState: 'failed', errorCode: 'ai_privacy_configuration_required',
    syntheticRun: RUN, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  await db.doc(`videoProcessingConsents/${jobId}`).set({ uid: owner.uid, revokedAt: null, policyVersion: VIDEO_CONSENT_VERSION });
}

let guard;
async function main() {
  guard = await driverGuard(cfg, E, ops, spawnSync, operatorIdentityToken);
  await guard.reserve('IR');
  const owner = await signUp('owner');
  const other = await signUp('other');
  E.step('users', { owner: owner.uid, other: other.uid });
  ops('enable', '--allow', owner.uid, '--worker-version', cfg.workerVersion, '--hold', 'true');
  const J = `${RUN}_rel`;
  // Shirt number known: the early discovery pass runs too, so discovery images are covered alongside review images.
  await seedJob(J, owner, { kitPrimaryColor: 'orange', jerseyNumber: '20' });
  E.step('start', await callable('startPlayerAnalysis', { jobId: J }, owner));
  await waitFor(async () => (await doc(`matchAnalysisJobs/${J}/pilotHeld/current`))?.report, 180000, 1000);
  const heldDisc = await waitFor(async () => (await doc(`matchAnalysisJobs/${J}/pilotHeld/discovery`))?.moments?.length, 60000, 1000);

  // Held: reviewer only.
  const heldObjs = await objects(owner, J);
  const twins = heldObjs.filter((o) => o.startsWith('pilotHeld/')).map((o) => `profiles/${owner.uid}/matchFootage/${J}/${o}`);
  const matrix = [];
  for (const t of twins) for (const [who, u] of [['owner', owner], ['other', other], ['anon', null]]) matrix.push([who, await read(t, u), await read(t.replace('/pilotHeld/', '/tracking/'), u)]);
  const issue = await callable('getMediaPlaybackUrl', { storagePath: twins[0] }, owner);
  const reviewer = ops('held-images', J);
  const heldIssuance = [];
  for (const t of twins) for (const [who, u] of [['owner', owner], ['other', other], ['anon', null]]) {
    heldIssuance.push({ who, held: await issuance(t, u), ownerPath: await issuance(t.replace('/pilotHeld/', '/tracking/'), u) });
  }
  E.check('held.reviewer_only', twins.length >= 3 && Boolean(heldDisc) && twins.some((t) => /\/pilotHeld\/d_/.test(t))
    && !heldObjs.some((o) => o.startsWith('tracking/')) && matrix.every(([, a, b]) => a === 403 && b !== 200)
    && issue.error?.status === 'PERMISSION_DENIED' && reviewer.exit === 0 && reviewer.stdout.includes('pilotHeld'),
  { matrix, issue: issue.error, discoveryTwins: twins.filter((t) => /\/pilotHeld\/d_/.test(t)).length });
  E.check('held.no_link_issuance', heldIssuance.every((r) => issuedNothing(r.held) && issuedNothing(r.ownerPath)), { heldIssuance });
  E.check('held.report_unreadable', (await freshGet(`${cfg.firestoreBase}/matchAnalysisJobs/${J}/pilotHeld/current`, { Authorization: `Bearer ${owner.token}` })).status === 403);

  // Released: owner only.
  ops('release', J, '--reviewer', 'staging-reviewer');
  const rel = await ownerImages(J);
  const relM = [];
  for (const p of rel) relM.push([await read(p, owner), await read(p, other), await read(p, null)]);
  const urls = [];
  for (const p of rel) urls.push({ path: p, url: await tokenUrl(p, owner) });
  for (const u of urls) u.before = u.url ? (await freshGet(u.url)).status : null;
  const signedIssue = await callable('getMediaPlaybackUrl', { storagePath: rel[0] }, owner);
  E.check('released.owner_only_and_urls_work', rel.length >= 3 && rel.some((p) => /\/tracking\/d_/.test(p)) && relM.every(([o, x, a]) => o === 200 && x === 403 && a === 403) && urls.every((u) => u.before === 200)
    && signedIssue.error?.status === 'PERMISSION_DENIED', { relM, before: urls.map((u) => u.before), signedIssue: signedIssue.error });

  // Withhold through the recovery operation; poll the exact URLs from fresh connections, caches disabled. In parallel a
  // loop keeps minting new links (metadata read as the owner) and fetching them, to catch issuance racing the withhold.
  let racing = true;
  const raceLog = [];
  const raceLoop = (async () => {
    for (let i = 0; racing; i += 1) {
      const p = rel[i % rel.length];
      const t = Date.now();
      const u = await tokenUrl(p, owner).catch(() => null);
      const st = u ? (await freshGet(u).catch(() => ({ status: 0 }))).status : null;
      raceLog.push({ i, image: p.split('/').pop().replace(/_[a-z0-9]+\.jpg$/, ''), startedAt: t, endedAt: Date.now(), issued: Boolean(u), fetch: st });
    }
  })();
  await sleep(1500);
  const w0 = Date.now();
  const wOut = ops('withhold', J, '--reason', 'staging-revocation-test');
  const w1 = Date.now();
  for (const u of urls) {
    let first = null;
    const end = Date.now() + 60000;
    while (Date.now() < end) { const st = (await freshGet(u.url)).status; if (st !== 200) { first = { status: st, msFromWithholdStart: Date.now() - w0, msFromWithholdEnd: Date.now() - w1 }; break; } await sleep(100); }
    u.revoked = first;
  }
  await sleep(3000);
  racing = false;
  await raceLoop;
  const okFetches = raceLog.filter((r) => r.fetch === 200);
  const lastOk = okFetches.at(-1) ?? null;
  const race = { iterations: raceLog.length, successfulBeforeWithhold: okFetches.filter((r) => r.endedAt < w0).length,
    lastSuccessfulFetchEndMsRelativeToAck: lastOk ? lastOk.endedAt - w1 : null,
    lastSuccessfulFetchStartMsRelativeToAck: lastOk ? lastOk.startedAt - w1 : null,
    issuedAfterAck: raceLog.filter((r) => r.startedAt > w1 && r.issued).length,
    fetchedAfterAck: raceLog.filter((r) => r.startedAt > w1 && r.fetch === 200).length };
  E.step('revocation timing', { withholdCommandMs: w1 - w0, urls: urls.map(({ url, ...r }) => r), race });
  E.check('withheld.no_issuance_or_fetch_after_ack', race.successfulBeforeWithhold > 0 && race.issuedAfterAck === 0 && race.fetchedAfterAck === 0
    && race.lastSuccessfulFetchEndMsRelativeToAck !== null && race.lastSuccessfulFetchStartMsRelativeToAck <= 0, race);
  const ownerCur = await freshGet(`${cfg.firestoreBase}/matchAnalysisJobs/${J}/tracking/current`, { Authorization: `Bearer ${owner.token}` });
  const curFields = ownerCur.ok ? (await ownerCur.json()).fields ?? {} : {};
  const withheldIssuance = [];
  for (const p of rel) for (const [who, u] of [['owner', owner], ['other', other], ['anon', null]]) {
    withheldIssuance.push({ who, ownerPath: await issuance(p, u), heldPath: await issuance(p.replace('/tracking/', '/pilotHeld/'), u) });
  }
  E.check('withheld.no_link_issuance', withheldIssuance.every((r) => issuedNothing(r.ownerPath) && issuedNothing(r.heldPath)), { withheldIssuance });
  E.check('withheld.urls_and_objects_closed', wOut.exit === 0 && urls.every((u) => u.before === 200 && u.revoked && u.revoked.msFromWithholdEnd <= 1000)
    && (await Promise.all(rel.map((p) => read(p, owner)))).every((s) => s !== 200)
    && (await Promise.all(rel.map((p) => read(p.replace('/tracking/', '/pilotHeld/'), owner)))).every((s) => s === 403)
    && !curFields.report?.mapValue, { revoked: urls.map((u) => u.revoked), reportField: Object.keys(curFields.report ?? {}) });

  // Account export while withheld.
  const ex = await callable('requestDataExport', {}, owner);
  const ed = await waitFor(async () => { const d = ex.result?.exportId ? await doc(`dataExports/${ex.result.exportId}`) : null; return d?.status === 'ready' ? d : null; }, 120000, 1000);
  const text = ed?.storagePath ? (await bucket.file(ed.storagePath).download())[0].toString('utf8') : '';
  E.check('export.no_tracking_report_or_images', Boolean(ed) && !/\/(tracking|pilotHeld)\/[A-Za-z0-9_-]+\.jpg/.test(text) && !text.includes('reviewQuestions'),
    { bytes: text.length });

  // Authorised reprocessing and release: old URLs stay dead, new access works.
  ops('reprocess', J);
  await waitFor(async () => { const h = await doc(`matchAnalysisJobs/${J}/pilotHeld/current`); return h?.report && !h?.withheldAt ? h : null; }, 180000, 1000);
  ops('release', J, '--reviewer', 'staging-reviewer');
  const fin = imagesIn(await doc(`matchAnalysisJobs/${J}/tracking/current`));
  const old = await Promise.all(urls.map((u) => freshGet(u.url).then((r) => r.status)));
  const fresh = await Promise.all(fin.map((p) => read(p, owner)));
  const newLinks = [];
  for (const p of fin) { const u = await tokenUrl(p, owner); newLinks.push({ owner: u ? (await freshGet(u)).status : null, other: await read(p, other), anon: await read(p, null) }); }
  // Discovery sightings are not re-run by reprocessing (discovery runs once per generation): after withholding they
  // stay contained; their old links must stay dead as well.
  const discNow = imagesIn(await doc(`matchAnalysisJobs/${J}/tracking/discovery`));
  E.check('reprocessed.old_urls_dead_new_access_works', fin.length >= 2 && fin.every((p) => !rel.includes(p)) && old.every((s) => s !== 200) && fresh.every((s) => s === 200)
    && newLinks.every((l) => l.owner === 200 && l.other === 403 && l.anon === 403),
  { old, fresh, newLinks, renamed: fin.every((p) => !rel.includes(p)), discoveryVisibleAfterReprocess: discNow.length });

  // Discarded: a result returning after the stop leaves no image behind.
  const D = `${RUN}_disc`;
  await seedJob(D, owner);
  await ctl('plan', { jobId: D, route: 'resolve', action: 'hold', times: 1 });
  await callable('startPlayerAnalysis', { jobId: D }, owner);
  await waitFor(async () => (await waiting(D, 'resolve')) === 1, 180000, 1000);
  ops('stop');
  await ctl('release', { jobId: D, route: 'resolve' });
  await waitFor(async () => (await doc(`matchAnalysisJobs/${D}/tracking/progress`))?.resolving === null, 120000, 1000);
  const dObjs = await objects(owner, D);
  const discardedIssuance = [];
  for (const sub of ['tracking', 'pilotHeld']) {
    discardedIssuance.push({ sub, owner: await issuance(`profiles/${owner.uid}/matchFootage/${D}/${sub}/reference_x.jpg`, owner) });
  }
  E.check('discarded.no_link_issuance', discardedIssuance.every((r) => issuedNothing(r.owner)), { discardedIssuance });
  E.check('discarded.no_images', !dObjs.some((o) => o.startsWith('tracking/') || o.startsWith('pilotHeld/'))
    && !(await doc(`matchAnalysisJobs/${D}/pilotHeld/current`))?.report, { dObjs });
  ops('enable', '--allow', owner.uid, '--worker-version', cfg.workerVersion, '--hold', 'true');

  // Legacy layout (held copy whose image sits at the owner path) is contained by prune; repeat is a no-op.
  const L = `${RUN}_legacy`;
  await seedJob(L, owner);
  const lp = `profiles/${owner.uid}/matchFootage/${L}/tracking/q_legacy_r0.jpg`;
  await bucket.file(lp).save(Buffer.from([0xff, 0xd8, 0xff, 1]), { contentType: 'image/jpeg', resumable: false });
  await db.doc(`matchAnalysisJobs/${L}/pilotHeld/current`).set({ report: { reviewQuestions: [{ id: 'q_legacy', imagePath: lp }] }, version: 1, heldAt: 'legacy' });
  const before = await read(lp, owner);
  const p1 = ops('prune-images', L);
  const p2 = ops('prune-images', L);
  E.check('legacy.contained_and_prune_idempotent', before === 200 && (await read(lp, owner)) !== 200 && (await read(lp.replace('/tracking/', '/pilotHeld/'), owner)) === 403
    && p2.stdout.includes('"deleted":[]') && p2.stdout.includes('"contained":[]'), { before, p1: p1.stdout.slice(0, 200) });
  E.step('downloaded copies', { note: 'Bytes a client already downloaded (browser or app image cache, 1 h private max-age) are outside server control; only live object access is revocable.' });

  // Cleanup of this run's synthetic data only (identity-checked project; production refused by loadConfig).
  if (cfg.project === 'scoutx-230b0') throw new Error('refusing cleanup in production');
  const jobs = [J, D, L];
  for (const j of jobs) {
    await bucket.deleteFiles({ prefix: `profiles/${owner.uid}/matchFootage/${j}/` });
    for (const sub of ['tracking/current', 'tracking/discovery', 'tracking/progress', 'tracking/feedback', 'pilotHeld/current', 'pilotHeld/discovery']) {
      await db.doc(`matchAnalysisJobs/${j}/${sub}`).delete();
    }
    await db.doc(`matchAnalysisJobs/${j}`).delete();
    await db.doc(`videoProcessingConsents/${j}`).delete();
  }
  if (ed?.storagePath) await bucket.file(ed.storagePath).delete({ ignoreNotFound: true });
  const left = (await bucket.getFiles({ prefix: `profiles/${owner.uid}/` }))[0].map((f) => f.name);
  const leftDocs = (await Promise.all(jobs.map((j) => doc(`matchAnalysisJobs/${j}`)))).filter(Boolean).length;
  E.check('cleanup.run_data_removed', left.length === 0 && leftDocs === 0, { objectsLeft: left.length, jobDocsLeft: leftDocs });
}

let ok = false;
try { await main(); } catch (e) { E.check('driver.completed', false, { error: redact(String(e?.stack ?? e)).slice(0, 1500) }); } finally {
  if (guard) E.step('limits', guard.summary());
  ok = E.write();
}
process.exit(ok ? 0 : 1);
