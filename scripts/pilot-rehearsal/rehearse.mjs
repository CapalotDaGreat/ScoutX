#!/usr/bin/env node
/**
 * Pilot rollback rehearsal through the real entry points (run by run.sh inside `firebase emulators:exec`).
 *
 * Callables are called over the Functions emulator's HTTP endpoint with Auth-emulator ID tokens; task
 * functions are reached only through real `taskQueue().enqueue()` calls (the server's own, or the operator
 * script's) and Cloud Tasks emulator delivery. Owner visibility is read through the Firestore/Storage emulator
 * REST APIs with the owner's ID token, so security rules apply. The worker is scripts/pilot-rehearsal/fakeWorker.mjs
 * (deterministic barriers); AI-provider traffic would land in providerSink.mjs.
 *
 * Writes a JSON evidence file (REHEARSAL_OUT) with every HTTP outcome, task delivery observed, job transition and
 * visibility read, plus a list of checks. Exit code 0 only if every check passed.
 */
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const require = createRequire(path.join(root, 'functions/package.json'));
const PROJECT = process.env.GCLOUD_PROJECT ?? process.env.REHEARSAL_PROJECT ?? 'demo-pilot-reh';
const REGION = 'europe-west6';
const FN = `http://127.0.0.1:5001/${PROJECT}/${REGION}`;
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const WORKER = 'http://127.0.0.1:8790';
const SINK = 'http://127.0.0.1:8791';
const BUCKET = `${PROJECT}.appspot.com`;
const VERSION = process.env.FAKE_WORKER_VERSION ?? 'football-cv/0.7.0-reh';
const OUT = process.env.REHEARSAL_OUT ?? path.join(root, 'rehearsal-evidence.json');
const PHASES = (process.env.REHEARSAL_PHASES ?? 'gate,rollback,race,r4,r1,r2legacy,legacy,cleanup,r3').split(',');

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { getFunctions } = require('firebase-admin/functions');
initializeApp({ projectId: PROJECT, storageBucket: BUCKET });
const db = getFirestore();
const bucket = getStorage().bucket();
const { VIDEO_CONSENT_VERSION } = require(path.join(root, 'functions/lib/analysis/videoConsent.js'));
const { taskQueueName } = require(path.join(root, 'functions/lib/region.js'));

const evidence = { project: PROJECT, commit: process.env.REHEARSAL_COMMIT ?? null, startedAt: new Date().toISOString(),
  steps: [], checks: [] };
const step = (name, data) => { const e = { at: new Date().toISOString(), name, ...data }; evidence.steps.push(e); console.log(`- ${name}`, JSON.stringify(data).slice(0, 400)); return e; };
const check = (id, ok, detail = {}) => { evidence.checks.push({ id, ok: Boolean(ok), ...detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id}`, JSON.stringify(detail).slice(0, 300)); return ok; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 30000, every = 250) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(every);
  }
}

// ------------------------------------------------------------------ helpers
async function signUp(label) {
  const r = await fetch(`${AUTH}/accounts:signUp?key=fake-api-key`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${label}@rehearsal.invalid`, password: 'rehearsal-only-123', returnSecureToken: true }) });
  const j = await r.json();
  return { label, uid: j.localId, token: j.idToken };
}
async function callable(name, data, user) {
  const r = await fetch(`${FN}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json',
    ...(user ? { Authorization: `Bearer ${user.token}` } : {}) }, body: JSON.stringify({ data }) });
  let j = null; try { j = await r.json(); } catch { /* empty */ }
  const out = { http: r.status, result: j?.result ?? null, error: j?.error ? { status: j.error.status, message: j.error.message, details: j.error.details ?? null } : null };
  step(`callable ${name}`, { user: user?.label ?? 'anonymous', data, ...out });
  return out;
}
async function ownerRead(docPath, user) {
  const r = await fetch(`${FS}/${docPath}`, { headers: { Authorization: `Bearer ${user.token}` } });
  let j = null; try { j = await r.json(); } catch { /* empty */ }
  return { http: r.status, fields: j?.fields ?? null };
}
async function ownerReadObject(objectPath, user) {
  const r = await fetch(`http://127.0.0.1:9199/v0/b/${BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media`,
    { headers: { Authorization: `Firebase ${user.token}` } });
  return r.status;
}
const doc = (p) => db.doc(p).get().then((s) => (s.exists ? s.data() : null));
const STORAGE = `http://127.0.0.1:9199/v0/b/${BUCKET}/o`;
/** Direct object read as a client (owner/other token or anonymous), rules enforced. */
async function clientRead(path, user) {
  const r = await fetch(`${STORAGE}/${encodeURIComponent(path)}?alt=media`, { headers: user ? { Authorization: `Firebase ${user.token}` } : {} });
  return r.status;
}
/** What the app's getDownloadURL does: authorised metadata read, then a token URL that works without auth. */
async function downloadUrlFor(path, user) {
  const r = await fetch(`${STORAGE}/${encodeURIComponent(path)}`, { headers: { Authorization: `Firebase ${user.token}` } });
  if (!r.ok) return { http: r.status, url: null };
  const meta = await r.json();
  const token = String(meta.downloadTokens ?? '').split(',')[0];
  return { http: r.status, url: token ? `${STORAGE}/${encodeURIComponent(path)}?alt=media&token=${token}` : null, token: token || null };
}
const urlStatus = async (url) => (url ? (await fetch(url)).status : null);
const objects = async (prefix) => (await bucket.getFiles({ prefix }))[0].map((f) => f.name).sort();
const jobObjects = async (u, j) => (await objects(`profiles/${u.uid}/matchFootage/${j}/`)).map((n) => n.split(`/${j}/`)[1]);
const ctl = async (p, b) => (await fetch(`${WORKER}/_ctl/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json();
const workerLog = async () => (await fetch(`${WORKER}/_ctl/log`)).json();
const sinkLog = async () => (await fetch(`${SINK}/_sink/log`)).json();
const waiting = async (jobId, route) => (await (await fetch(`${WORKER}/_ctl/waiting?jobId=${jobId}&route=${route}`)).json()).waiting;
const calls = async (jobId, route) => (await workerLog()).filter((e) => e.jobId === jobId && e.route === route).length;
function ops(...args) {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/tracking-pilot-ops.mjs'), ...args], { env: process.env, encoding: 'utf8' });
  const out = { exit: r.status, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
  step(`ops ${args.join(' ')}`, out);
  return out;
}
async function enqueue(queue, payload, opts = {}) {
  await getFunctions().taskQueue(taskQueueName(queue)).enqueue(payload, { dispatchDeadlineSeconds: 900, ...opts });
  step(`enqueue ${queue}`, { payload, opts });
}
const LEGACY_AI_BLOCKED = { status: 'failed', pipelineState: 'failed', errorCode: 'ai_privacy_configuration_required' };
async function seedJob(jobId, owner, extra = {}) {
  const prefix = `profiles/${owner.uid}/matchFootage/${jobId}/`;
  await bucket.file(`${prefix}video.mp4`).save(Buffer.from(`synthetic video ${jobId}`), { contentType: 'video/mp4', resumable: false });
  await bucket.file(`${prefix}frames/frame_0.jpg`).save(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9]), { contentType: 'image/jpeg', resumable: false });
  await bucket.file(`${prefix}frames/frame_1.jpg`).save(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 8]), { contentType: 'image/jpeg', resumable: false });
  await db.doc(`matchAnalysisJobs/${jobId}`).set({ playerId: owner.uid, targeting: { kitPrimaryColor: 'orange' },
    videoStoragePath: `${prefix}video.mp4`, measuredDurationSec: 60, durationSec: 60, status: 'processing', pipelineState: 'analyzing',
    frames: [{ id: 'frame_0', storagePath: `${prefix}frames/frame_0.jpg` }, { id: 'frame_1', storagePath: `${prefix}frames/frame_1.jpg` }],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...extra });
  await db.doc(`videoProcessingConsents/${jobId}`).set({ uid: owner.uid, revokedAt: null, policyVersion: VIDEO_CONSENT_VERSION });
}
async function trackingState(jobId) {
  const base = `matchAnalysisJobs/${jobId}`;
  const [progress, current, held, feedback, discovery, heldDiscovery] = await Promise.all([doc(`${base}/tracking/progress`),
    doc(`${base}/tracking/current`), doc(`${base}/pilotHeld/current`), doc(`${base}/tracking/feedback`), doc(`${base}/tracking/discovery`),
    doc(`${base}/pilotHeld/discovery`)]);
  const seg = progress ? Object.fromEntries(Object.entries(progress.segments ?? {}).map(([k, v]) => [k, `${v.status}/${v.attempts}`])) : null;
  return {
    progress: progress ? { generation: progress.generation, outcome: progress.outcome ?? null, blocked: progress.blocked ?? null,
      pilot: progress.pilot ?? null, resolving: progress.resolving ?? null, held: progress.held ?? null, full: Boolean(progress.full),
      authorizedAt: progress.pilotAuthorizedAt ?? null, segments: seg } : null,
    current: current ? { hasReport: Boolean(current.report), version: current.version ?? null, stale: current.stale ?? null,
      pendingReason: current.pendingReason ?? null, feedbackRevision: current.feedbackRevision ?? null, producedBy: current.producedBy ?? null,
      releasedBy: current.releasedBy ?? null } : null,
    held: held ? { hasReport: Boolean(held.report), version: held.version ?? null, withheldAt: held.withheldAt ?? null,
      heldAt: held.heldAt ?? null, releasedAt: held.releasedAt ?? null, feedbackRevision: held.feedbackRevision ?? null,
      producedBy: held.producedBy ?? null } : null,
    feedback: feedback ? { revision: feedback.revision ?? 0, entries: (feedback.entries ?? []).length } : null,
    discovery: discovery ? { moments: (discovery.moments ?? []).length } : null,
    heldDiscovery: heldDiscovery ? { moments: (heldDiscovery.moments ?? []).length } : null,
  };
}
async function snapshot(label, jobs, owner) {
  const out = {};
  for (const j of jobs) {
    const s = await trackingState(j);
    s.ownerReadCurrent = (await ownerRead(`matchAnalysisJobs/${j}/tracking/current`, owner)).http;
    s.ownerReadHeld = (await ownerRead(`matchAnalysisJobs/${j}/pilotHeld/current`, owner)).http;
    out[j] = s;
  }
  step(`snapshot ${label}`, { state: out });
  return out;
}
async function notifications(uid) {
  const q = await db.collection('activities').where('recipientId', '==', uid).get();
  return q.docs.map((d) => ({ id: d.id, type: d.get('type') }));
}

// ------------------------------------------------------------------ phases
const users = {};
const ALLOW = () => [users.owner.uid, users.owner2.uid, users.owner3.uid].join(',');
async function setup() {
  for (const l of ['owner', 'owner2', 'owner3', 'outsider', 'other']) users[l] = await signUp(l);
  step('users', Object.fromEntries(Object.entries(users).map(([k, u]) => [k, u.uid])));
}

async function phaseGate() {
  const A = users.owner;
  const jobs = ['g_missing', 'g_malformed', 'g_version', 'g_unlisted', 'g_consent', 'g_wrongmodel'];
  // owner3 takes the configuration cases so every user stays inside the unchanged 10 starts/day limit.
  const O3 = users.owner3;
  for (const j of ['g_consent', 'g_wrongmodel']) await seedJob(j, A);
  for (const j of ['g_missing', 'g_malformed', 'g_version']) await seedJob(j, O3);
  await seedJob('g_unlisted', users.outsider);
  await db.doc('videoProcessingConsents/g_consent').delete();

  await db.doc('opsConfig/trackingPilot').delete();
  let r = await callable('startPlayerAnalysis', { jobId: 'g_missing' }, O3);
  check('gate.missing_config.start_blocked', r.result?.status === 'blocked' && (await doc('matchAnalysisJobs/g_missing/tracking/progress'))?.pilot === 'missing_config', r);
  await db.doc('opsConfig/trackingPilot').set({ enabled: 'yes', allowlist: [A.uid, O3.uid], workerVersion: VERSION });
  r = await callable('startPlayerAnalysis', { jobId: 'g_malformed' }, O3);
  check('gate.malformed_config.start_blocked', r.result?.status === 'blocked' && (await doc('matchAnalysisJobs/g_malformed/tracking/progress'))?.pilot === 'missing_config', r);
  ops('enable', '--allow', ALLOW(), '--worker-version', `${VERSION}-other`);
  r = await callable('startPlayerAnalysis', { jobId: 'g_version' }, O3);
  check('gate.version_mismatch.start_blocked', r.result?.status === 'blocked' && (await doc('matchAnalysisJobs/g_version/tracking/progress'))?.pilot === 'version_mismatch', r);
  ops('enable', '--allow', ALLOW(), '--worker-version', VERSION);
  r = await callable('startPlayerAnalysis', { jobId: 'g_unlisted' }, users.outsider);
  check('gate.not_allowlisted.start_blocked', r.result?.status === 'blocked' && (await doc('matchAnalysisJobs/g_unlisted/tracking/progress'))?.pilot === 'not_allowlisted', r);
  r = await callable('startPlayerAnalysis', { jobId: 'g_missing' }, users.other);
  check('gate.non_owner.permission_denied', r.http === 403 && r.error?.status === 'PERMISSION_DENIED', r);
  r = await callable('startPlayerAnalysis', { jobId: 'g_missing' }, null);
  check('gate.anonymous.unauthenticated', r.http === 401, r);
  r = await callable('startPlayerAnalysis', { jobId: 'g_consent' }, A);
  check('gate.consent_missing.blocked', r.result?.status === 'blocked' && r.result?.blocked === 'consent_required', r);
  // Worker answers with a model set the approval does not list: the report must be rejected, nothing published or held.
  await ctl('plan', { jobId: 'g_wrongmodel', route: 'resolve', action: 'wrong_models' });
  r = await callable('startPlayerAnalysis', { jobId: 'g_wrongmodel' }, A);
  await waitFor(async () => (await calls('g_wrongmodel', 'resolve')) >= 1 && (await doc('matchAnalysisJobs/g_wrongmodel/tracking/progress'))?.outcome, 30000);
  const wm = await trackingState('g_wrongmodel');
  check('gate.wrong_models.rejected', !wm.current?.hasReport && !wm.held?.hasReport && wm.progress?.outcome === 'interrupted', wm);
  const noCalls = [];
  for (const j of ['g_missing', 'g_malformed', 'g_version', 'g_unlisted', 'g_consent']) noCalls.push([j, (await workerLog()).filter((e) => e.jobId === j).length]);
  check('gate.blocked_jobs.no_worker_calls', noCalls.every(([, n]) => n === 0), { noCalls });
}

async function phaseRollback() {
  const A = users.owner;
  const A2 = users.owner2;
  const jobs = ['r_released', 'r_publish', 'r_running', 'r_queued', 'r_disc'];
  // Pilot configuration: AI footage processing is not approved, so the legacy frame pipeline has already failed;
  // only the tracking analysis runs (a "tracking-only" job, R1).
  for (const j of jobs) await seedJob(j, A, LEGACY_AI_BLOCKED);
  // Second allowlisted owner for the later starts (the 10 starts/day limit per user stays in force).
  for (const j of ['r_new_after_stop', 'r_new_after_enable']) await seedJob(j, A2, LEGACY_AI_BLOCKED);
  await db.doc('matchAnalysisJobs/r_disc').set({ targeting: { kitPrimaryColor: 'orange', jerseyNumber: '20' } }, { merge: true });
  ops('enable', '--allow', ALLOW(), '--worker-version', VERSION, '--hold', 'true');

  // 1. A report that reaches the owner only through review: run -> held -> released.
  let r = await callable('startPlayerAnalysis', { jobId: 'r_released' }, A);
  await waitFor(async () => (await trackingState('r_released')).held?.hasReport, 40000);
  let s = await trackingState('r_released');
  const readHeld = await ownerRead('matchAnalysisJobs/r_released/pilotHeld/current', A);
  const readCur = await ownerRead('matchAnalysisJobs/r_released/tracking/current', A);
  check('hold.report_not_visible_before_review', s.held?.hasReport && !s.current?.hasReport && readHeld.http === 403
    && (readCur.http === 404 || !readCur.fields?.report?.mapValue), { s, readHeld: readHeld.http, readCur: readCur.http });
  check('hold.no_completion_notice_while_held', !(await notifications(A.uid)).some((n) => n.type === 'analysis_completed'),
    { notifications: await notifications(A.uid) });
  // R1: a full (held) report finishes the tracking-only job; the lifecycle deletes source and uncited frames.
  const jr = await waitFor(async () => { const d = await doc('matchAnalysisJobs/r_released'); return d?.mediaCleanupState === 'done' ? d : null; }, 20000);
  const objsHeld = await jobObjects(A, 'r_released');
  check('r1.tracking_only_completion_cleans_source', jr?.trackingState === 'complete' && !objsHeld.includes('video.mp4')
    && !objsHeld.some((o) => o.startsWith('frames/')), { trackingState: jr?.trackingState, mediaLifecycle: jr?.mediaLifecycle, objsHeld });
  // R2: while held, review images exist only as server-only twins.
  const heldImgs = objsHeld.filter((o) => o.startsWith('pilotHeld/'));
  const ownerPaths = heldImgs.map((o) => `profiles/${A.uid}/matchFootage/r_released/tracking/${o.split('/')[1]}`);
  const heldPaths = heldImgs.map((o) => `profiles/${A.uid}/matchFootage/r_released/${o}`);
  const heldAccess = [];
  for (const hp of heldPaths) for (const [who, u] of [['owner', A], ['other', users.other], ['anon', null]]) heldAccess.push([who, await clientRead(hp, u)]);
  const ownerPathWhileHeld = await Promise.all(ownerPaths.map((op) => clientRead(op, A)));
  const playHeld = await callable('getMediaPlaybackUrl', { storagePath: heldPaths[0] }, A);
  const reviewerList = ops('held-images', 'r_released');
  check('r2.held_images_server_only', heldImgs.length >= 2 && !objsHeld.some((o) => o.startsWith('tracking/'))
    && heldAccess.every(([, st]) => st === 403) && ownerPathWhileHeld.every((st) => st === 404)
    && playHeld.error?.status === 'PERMISSION_DENIED' && reviewerList.stdout.includes('pilotHeld'),
  { heldImgs, heldAccess, ownerPathWhileHeld, playHeld: playHeld.error, reviewer: reviewerList.stdout.slice(0, 200) });
  ops('release', 'r_released', '--reviewer', 'rehearsal-reviewer');
  const objsRel = await jobObjects(A, 'r_released');
  const relReads = await Promise.all(ownerPaths.map((op) => clientRead(op, A)));
  check('r2.release_restores_owner_image_access', relReads.every((st) => st === 200) && !objsRel.some((o) => o.startsWith('pilotHeld/'))
    && (await clientRead(ownerPaths[0], users.other)) === 403 && (await clientRead(ownerPaths[0], null)) === 403, { relReads, objsRel });
  s = await trackingState('r_released');
  check('release.owner_reads_report', s.current?.hasReport && (await ownerRead('matchAnalysisJobs/r_released/tracking/current', A)).http === 200
    && s.current.producedBy?.workerVersion === VERSION, s);
  // Owner correction on the released report -> feedback re-resolve -> held again -> released.
  const cur = await doc('matchAnalysisJobs/r_released/tracking/current');
  const qid = cur.report?.reviewQuestions?.[0]?.id;
  r = await callable('answerTrackingQuestion', { jobId: 'r_released', questionId: qid, answer: 'yes', operationId: 'op_rehearsal_0001' }, A);
  await waitFor(async () => (await trackingState('r_released')).held?.feedbackRevision === 1 && (await trackingState('r_released')).held?.hasReport, 40000);
  ops('release', 'r_released', '--reviewer', 'rehearsal-reviewer');
  const beforeStop = await trackingState('r_released');
  check('correction.applied_and_released', beforeStop.current?.feedbackRevision === 1 && beforeStop.feedback?.entries === 1, beforeStop);

  // 1b. Discovery sightings (shirt number known) must stay under hold too.
  r = await callable('startPlayerAnalysis', { jobId: 'r_disc' }, A);
  await waitFor(async () => (await calls('r_disc', 'discover')) >= 1 && ((await trackingState('r_disc')).discovery || (await trackingState('r_disc')).heldDiscovery), 40000);
  await sleep(1500);
  const disc = await trackingState('r_disc');
  const discOwner = await ownerRead('matchAnalysisJobs/r_disc/tracking/discovery', A);
  check('hold.discovery_sightings_not_visible_before_review', !(discOwner.http === 200 && discOwner.fields?.moments?.arrayValue?.values?.length)
    && !(await notifications(A.uid)).some((n) => n.id.includes('first_moments-r_disc')), { disc, ownerHttp: discOwner.http, notifications: await notifications(A.uid) });
  await waitFor(async () => (await trackingState('r_disc')).held?.hasReport, 40000);
  ops('release', 'r_disc', '--reviewer', 'rehearsal-reviewer');
  const discRel = await ownerRead('matchAnalysisJobs/r_disc/tracking/discovery', A);
  check('release.discovery_and_report_visible_after_review', discRel.http === 200 && (await trackingState('r_disc')).current?.hasReport,
    { http: discRel.http, state: await trackingState('r_disc') });
  // R2: the sighting thumbnail followed the sightings: server-only while held, owner-readable after release.
  const dImg = `profiles/${A.uid}/matchFootage/r_disc/tracking/d_1_g1.jpg`;
  check('r2.discovery_image_follows_release', (await clientRead(dImg, A)) === 200 && !(await jobObjects(A, 'r_disc')).includes('pilotHeld/d_1_g1.jpg'),
    { objects: await jobObjects(A, 'r_disc') });

  // 2. In-flight work at the moment of the stop.
  await ctl('plan', { jobId: 'r_publish', route: 'resolve', action: 'hold', times: 1 });
  await ctl('plan', { jobId: 'r_running', route: 'extract', action: 'hold', times: 1 });
  await ctl('plan', { jobId: 'r_queued', route: 'extract', action: 'fail', times: 1 });
  await callable('startPlayerAnalysis', { jobId: 'r_publish' }, A);
  await callable('startPlayerAnalysis', { jobId: 'r_running' }, A);
  await callable('startPlayerAnalysis', { jobId: 'r_queued' }, A);
  const barriers = await waitFor(async () => (await waiting('r_publish', 'resolve')) === 1 && (await waiting('r_running', 'extract')) === 1
    && (await calls('r_queued', 'extract')) === 1 && (await trackingState('r_queued')).progress?.segments?.['0'] === 'queued/1', 40000);
  check('barriers.reached', barriers, { publish: await waiting('r_publish', 'resolve'), running: await waiting('r_running', 'extract'),
    queued: await trackingState('r_queued') });
  // A delivery scheduled before the stop and delivered after it (old resolve of the released job).
  await enqueue('resolveTrackingTask', { jobId: 'r_released', feedbackRevision: 1, scope: 'full' }, { scheduleDelaySeconds: 8 });
  const before = await snapshot('before_stop', ['r_released', 'r_publish', 'r_running', 'r_queued'], A);

  // 3. Kill switch.
  const stopAt = new Date().toISOString();
  ops('stop');
  r = await callable('startPlayerAnalysis', { jobId: 'r_new_after_stop' }, A2);
  check('stop.new_request_blocked', r.result?.status === 'blocked' && (await doc('matchAnalysisJobs/r_new_after_stop/tracking/progress'))?.pilot === 'pilot_off'
    && (await calls('r_new_after_stop', 'extract')) === 0, r);
  await ctl('release', { jobId: 'r_publish', route: 'resolve' });
  await ctl('release', { jobId: 'r_running', route: 'extract' });
  await waitFor(async () => (await trackingState('r_publish')).progress?.resolving === null, 20000);
  await sleep(4000);
  // Duplicate of the in-flight resolve, delivered after the stop.
  await enqueue('resolveTrackingTask', { jobId: 'r_publish', feedbackRevision: 0, scope: 'full' });
  // Cloud Tasks redelivers r_queued after its 60 s minimum backoff.
  const redelivered = await waitFor(async () => {
    const t = await trackingState('r_queued');
    return t.progress?.blocked === 'worker_unavailable' ? t : null;
  }, 120000, 1000);
  await sleep(10000);
  const after = await snapshot('after_stop', ['r_released', 'r_publish', 'r_running', 'r_queued'], A);
  check('stop.late_resolve_discarded', !after.r_publish.held?.hasReport && !after.r_publish.current?.hasReport, after.r_publish);
  check('stop.running_extract_cannot_publish', !after.r_running.held?.hasReport && !after.r_running.current?.hasReport
    && (await calls('r_running', 'resolve')) === 0, { state: after.r_running, resolveCalls: await calls('r_running', 'resolve') });
  const firstAttemptAt = (await workerLog()).find((e) => e.jobId === 'r_queued' && e.route === 'extract')?.at ?? null;
  const redeliveredAt = (await doc('matchAnalysisJobs/r_queued/tracking/progress'))?.updatedAt ?? null;
  const backoffSec = firstAttemptAt && redeliveredAt ? (Date.parse(redeliveredAt) - Date.parse(firstAttemptAt)) / 1000 : null;
  step('queue redelivery timing', { firstAttemptAt, redeliveredAt, backoffSec, configuredMinBackoffSec: 60 });
  check('stop.queued_redelivery_fails_closed', redelivered && (await calls('r_queued', 'extract')) === 1 && backoffSec >= 59,
    { redelivered, extractCalls: await calls('r_queued', 'extract'), backoffSec });
  const lateReleasedCalls = (await workerLog()).filter((e) => e.jobId === 'r_released' && e.route === 'resolve' && e.at >= stopAt).length;
  check('stop.old_scheduled_delivery_no_effect', after.r_released.current?.version === before.r_released.current?.version
    && lateReleasedCalls === 0, { before: before.r_released, after: after.r_released, lateReleasedCalls });
  check('stop.duplicate_delivery_no_worker_call', (await calls('r_publish', 'resolve')) === 1, { resolveCalls: await calls('r_publish', 'resolve') });
  check('stop.released_report_unchanged_until_withheld', after.r_released.current?.hasReport, after.r_released);
  // R2: results discarded after the stop left no image behind (previously they stayed at owner paths).
  const discarded = { r_publish: await jobObjects(A, 'r_publish'), r_running: await jobObjects(A, 'r_running'), r_queued: await jobObjects(A, 'r_queued') };
  check('r2.discarded_results_leave_no_images', Object.values(discarded).every((l) => !l.some((o) => o.startsWith('tracking/') || o.startsWith('pilotHeld/'))), discarded);
  check('r1.stopped_job_keeps_source_for_retry', Object.values(discarded).every((l) => l.includes('video.mp4'))
    && ['r_publish', 'r_running', 'r_queued'].every(Boolean), { states: await Promise.all(['r_publish', 'r_running', 'r_queued'].map(async (j) => {
      const d = await doc(`matchAnalysisJobs/${j}`); return [j, d?.trackingState, d?.mediaCleanupState, d?.mediaCleanupDueAt]; })) });
  step('notifications after stop', { list: await notifications(A.uid) });

  // 4. Containment of the already released report (recovery procedure: ops withhold).
  // R2: URLs obtained while the images were owner-visible (what the app's getDownloadURL returns).
  const imgNow = (await doc('matchAnalysisJobs/r_released/tracking/current'));
  const curImgs = [...JSON.stringify(imgNow?.report ?? {}).matchAll(/"(profiles\/[^"]+\/tracking\/[^"]+\.jpg)"/g)].map((m) => m[1]);
  const issued = [];
  for (const pth of [...new Set(curImgs)]) issued.push({ path: pth, ...(await downloadUrlFor(pth, A)) });
  for (const u of issued) u.before = await urlStatus(u.url);
  const withholdOut = ops('withhold', 'r_released', '--reason', 'rehearsal-containment');
  const afterWithholdAt = Date.now();
  for (const u of issued) {
    u.after = await urlStatus(u.url);
    u.direct = await clientRead(u.path, A);
    u.heldTwinWithToken = u.token ? await urlStatus(`${STORAGE}/${encodeURIComponent(u.path.replace('/tracking/', '/pilotHeld/'))}?alt=media&token=${u.token}`) : null;
    u.heldTwinOwner = await clientRead(u.path.replace('/tracking/', '/pilotHeld/'), A);
  }
  step('r2.issued urls around withholding', { issued: issued.map(({ url, token, ...rest }) => ({ ...rest, hadToken: Boolean(token) })),
    withholdMs: JSON.parse(withholdOut.stdout || '{}').ms ?? null, checkedMsAfterWithhold: Date.now() - afterWithholdAt });
  check('r2.withhold_closes_images_and_issued_urls', issued.length >= 2 && issued.every((u) => u.before === 200 && u.after !== 200 && u.direct !== 200
    && u.heldTwinWithToken !== 200 && u.heldTwinOwner === 403), { issued: issued.map(({ url, token, ...rest }) => ({ ...rest, hadToken: Boolean(token) })) });
  const w = await trackingState('r_released');
  const ownerCur = await ownerRead('matchAnalysisJobs/r_released/tracking/current', A);
  check('withhold.owner_sees_no_report', !w.current?.hasReport && w.current?.pendingReason === 'withheld_for_review' && w.held?.withheldAt
    && ownerCur.http === 200 && !ownerCur.fields?.report?.mapValue, { w, ownerHttp: ownerCur.http });
  check('withhold.held_copy_unreadable', (await ownerRead('matchAnalysisJobs/r_released/pilotHeld/current', A)).http === 403);
  // Ordinary API paths on the withheld job.
  r = await callable('answerTrackingQuestion', { jobId: 'r_released', questionId: qid, answer: 'not_me', operationId: 'op_rehearsal_0002' }, A);
  check('withhold.answer_refused_without_report', r.http >= 400, r);
  r = await callable('explainTrackingMoment', { jobId: 'r_released', momentId: 'm_1', kind: 'explain' }, A);
  check('withhold.explain_refused', r.http === 200 && r.result?.status === 'unavailable' && r.result?.reason === 'report_not_current', r);
  step('explain on withheld', r);
  r = await callable('undoTrackingAnswer', { jobId: 'r_released' }, A);
  const afterUndo = await trackingState('r_released');
  check('withhold.state_survives_owner_correction', afterUndo.current?.pendingReason === 'withheld_for_review' && !afterUndo.current?.hasReport,
    { r, afterUndo });
  // Export path: the owner's data export must not contain the withheld report.
  r = await callable('requestDataExport', {}, A);
  const exp = await waitFor(async () => { const d = r.result?.exportId ? await doc(`dataExports/${r.result.exportId}`) : null; return d?.status === 'ready' ? d : null; }, 60000, 500);
  let exportText = '';
  if (exp?.storagePath) [exportText] = (await bucket.file(exp.storagePath).download()).map((b) => b.toString('utf8'));
  check('withhold.export_excludes_report', Boolean(exp) && !exportText.includes('rehearsalJob') && !exportText.includes('withheldReason'),
    { exportStatus: exp?.status ?? null, bytes: exportText.length });
  check('r3.export_has_no_tracking_images_or_links', Boolean(exp) && !/\/tracking\/[A-Za-z0-9_-]+\.jpg/.test(exportText) && !exportText.includes('/pilotHeld/')
    && !exportText.includes('reviewQuestions') && !exportText.includes('serverEligibleSec'), { bytes: exportText.length });

  // 5. Re-enable. Work authorised before the stop must not run under the new enable.
  const enableAt = new Date().toISOString();
  ops('enable', '--allow', ALLOW(), '--worker-version', VERSION, '--hold', 'true');
  const resolvesBefore = await calls('r_publish', 'resolve');
  await enqueue('resolveTrackingTask', { jobId: 'r_publish', feedbackRevision: 0, scope: 'full' });
  await enqueue('extractTrackingSegmentTask', { jobId: 'r_running', generation: 1, index: 0 });
  await sleep(8000);
  const old = await snapshot('after_reenable_old_deliveries', ['r_publish', 'r_running', 'r_queued'], A);
  check('reenable.old_delivery_not_authorized', !old.r_publish.held?.hasReport && (await calls('r_publish', 'resolve')) === resolvesBefore
    && !old.r_running.held?.hasReport, { old, resolvesBefore, resolvesAfter: await calls('r_publish', 'resolve'), enableAt });
  // A genuinely new request after the enable runs normally (and lands under hold).
  r = await callable('startPlayerAnalysis', { jobId: 'r_new_after_enable' }, A2);
  await waitFor(async () => (await trackingState('r_new_after_enable')).held?.hasReport, 40000);
  check('reenable.new_request_runs_under_hold', (await trackingState('r_new_after_enable')).held?.hasReport
    && !(await trackingState('r_new_after_enable')).current?.hasReport, await trackingState('r_new_after_enable'));
  // R1: a legitimate retry inside the retry window - the owner resumes the stopped job; its source is still there.
  const beforeResume = await doc('matchAnalysisJobs/r_running');
  const objectsBeforeResume = await jobObjects(A, 'r_running');
  r = await callable('startPlayerAnalysis', { jobId: 'r_running' }, A);
  // Its one segment finished (and was cached on the worker) after the stop, so the resume only re-resolves.
  const resumedCall = await waitFor(async () => (await workerLog()).filter((e) => e.jobId === 'r_running' && e.at > enableAt).pop(), 30000);
  const resumed = await waitFor(async () => { const d = await doc('matchAnalysisJobs/r_running'); return d?.trackingState === 'complete' && d?.mediaCleanupState === 'done' ? d : null; }, 40000);
  check('r1.retry_window_resume_then_completion_cleanup', beforeResume?.mediaCleanupState === 'retry_window' && r.result?.status === 'started'
    && objectsBeforeResume.includes('video.mp4') && resumedCall && resumed && !(await jobObjects(A, 'r_running')).includes('video.mp4'),
  { before: [beforeResume?.trackingState, beforeResume?.mediaCleanupState], objectsBeforeResume, start: r.result, resumedCall, after: resumed?.mediaLifecycle,
    objects: await jobObjects(A, 'r_running') });

  // 6. A contained report cannot simply be released again.
  const relW = ops('release', 'r_released', '--reviewer', 'rehearsal-reviewer');
  check('withhold.release_without_reprocess_refused', relW.stdout.includes('withheld_requires_reprocess')
    && !(await trackingState('r_released')).current?.hasReport, { relW });
  // 7. Authorised reprocessing of the contained job, then release.
  const fbBefore = await doc('matchAnalysisJobs/r_released/tracking/feedback');
  const repro = ops('reprocess', 'r_released');
  await waitFor(async () => { const t = await trackingState('r_released'); return t.held?.hasReport && !t.held?.withheldAt; }, 40000);
  const rp = await trackingState('r_released');
  check('reprocess.held_not_visible', repro.exit === 0 && rp.held?.hasReport && !rp.held?.withheldAt && !rp.current?.hasReport, rp);
  ops('release', 'r_released', '--reviewer', 'rehearsal-reviewer');
  const fin = await trackingState('r_released');
  const fbAfter = await doc('matchAnalysisJobs/r_released/tracking/feedback');
  check('reprocess.release_restores_owner_view', fin.current?.hasReport && (await ownerRead('matchAnalysisJobs/r_released/tracking/current', A)).http === 200
    && fin.current.version > (w.current?.version ?? 0), fin);
  check('reprocess.corrections_preserved', JSON.stringify(fbBefore) === JSON.stringify(fbAfter), { fbBefore, fbAfter });
  check('reprocess.containment_record_kept', Boolean((await doc('matchAnalysisJobs/r_released/tracking/current'))?.previousWithheld?.withheldReason), {});
  check('reprocess.provenance_recorded', fin.current?.producedBy?.workerVersion === VERSION && Object.keys(fin.current?.producedBy?.models ?? {}).length > 0
    && fin.current?.releasedBy === 'rehearsal-reviewer', fin.current);
  // R2: after authorised reprocessing and release the owner reads the images again; URLs issued before withholding stay dead.
  const finDoc = await doc('matchAnalysisJobs/r_released/tracking/current');
  const finImgs = [...new Set([...JSON.stringify(finDoc?.report ?? {}).matchAll(/"(profiles\/[^"]+\/tracking\/[^"]+\.jpg)"/g)].map((m) => m[1]))];
  const finReads = await Promise.all(finImgs.map((pth) => clientRead(pth, A)));
  const oldUrls = await Promise.all(issued.map((u) => urlStatus(u.url)));
  check('r2.reprocessed_release_images_readable_old_urls_dead', finImgs.length >= 2 && finReads.every((st) => st === 200) && oldUrls.every((st) => st !== 200),
    { finImgs: finImgs.map((x) => x.split('/').pop()), finReads, oldUrls });
  // R4 on reprocessing: the worker's overstated 300 s claim is still refused (timeline supports 10 s).
  check('r4.reprocessed_report_gate_enforced', finDoc?.report?.offball?.status === 'insufficient' && finDoc?.report?.offball?.serverEligibleSec === 10,
    { offball: finDoc?.report?.offball });
  // Codec: stored timeline strip and box samples are Firestore-safe and decode to the worker's tuples.
  const strip0 = finDoc?.report?.stateStrip?.[0];
  const ind0 = finDoc?.report?.moments?.[0]?.indicator?.[0];
  check('codec.stored_strip_and_boxes_roundtrip', Array.isArray(strip0?._tuple) && strip0._tuple.length === 3 && Array.isArray(ind0?._tuple)
    && JSON.stringify(ind0._tuple) === JSON.stringify([11, 0.4, 0.3, 0.05, 0.2]), { strip0, ind0 });
  // Pruning twice is safe and changes nothing on a reconciled job.
  const p1 = JSON.parse(ops('prune-images', 'r_released').stdout || '{}').result;
  const p2 = JSON.parse(ops('prune-images', 'r_released').stdout || '{}').result;
  check('r2.prune_twice_safe', p2 && p2.deleted.length === 0 && p2.contained.length === 0 && finImgs.every(Boolean), { p1, p2 });
  step('worker log (all)', { log: await workerLog() });
}

async function phaseRace() {
  // In-process: the real processResolveTask against the Firestore emulator, paused inside its publishing
  // transaction right after the gate read, while the operator flips the switch.
  const lib = (p) => require(path.join(root, 'functions/lib/analysis', p));
  const { setEmulatorCvApproval } = lib('cvConfig.js');
  const { processResolveTask } = lib('trackingCallables.js');
  const pilotGate = lib('pilotGate.js');
  setEmulatorCvApproval({ workerVersion: VERSION, models: { detector: 'yolox-reh', ocr: 'parseq-reh' }, eventsApproved: false });
  const env = { FUNCTIONS_EMULATOR: 'true', FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST, CV_WORKER_URL: WORKER,
    CV_WORKER_APPROVED: 'true', TRACKING_V3_ENABLED: 'true' };
  const A = users.owner;
  const workerResponse = await (await fetch(`${WORKER}/v3/tracking:resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId: 'race' }) })).json();
  const client = async () => structuredClone(workerResponse);
  const noImages = async () => undefined;
  for (const variant of ['stop_during_commit', 'stop_during_commit', 'stop_during_commit', 'no_stop']) {
    const jobId = `race_${variant}_${Math.random().toString(36).slice(2, 7)}`;
    await seedJob(jobId, A);
    ops('enable', '--allow', ALLOW(), '--worker-version', VERSION, '--hold', 'true');
    const enabledAt = (await doc('opsConfig/trackingPilot')).enabledAt;
    await db.doc(`matchAnalysisJobs/${jobId}/tracking/progress`).set({ schema: 'pitchproof.tracking-progress.v1', generation: 1, durationSec: 60,
      plan: [{ index: 0, startSec: 0, endSec: 60 }], segments: { 0: { status: 'done', attempts: 1 } }, startedAt: enabledAt, updatedAt: enabledAt,
      resolving: 'full', preliminary: null, full: null, outcome: null, blocked: null, pilotAuthorizedAt: new Date().toISOString() });
    let release; const gateRead = new Promise((res) => { release = res; });
    let signal; const reached = new Promise((res) => { signal = res; });
    let paused = false;
    const proxy = new Proxy(db, { get(t, p) {
      if (p === 'runTransaction') {
        return (fn, o) => t.runTransaction((tx) => fn(new Proxy(tx, { get(tt, pp) {
          if (pp !== 'get') { const v = tt[pp]; return typeof v === 'function' ? v.bind(tt) : v; }
          return async (ref) => {
            const res = await tt.get(ref);
            if (!paused && ref.path === `${pilotGate.PILOT_COLLECTION}/${pilotGate.PILOT_DOC}`) { paused = true; signal(); await gateRead; }
            return res;
          };
        } })), o);
      }
      const v = t[p]; return typeof v === 'function' ? v.bind(t) : v;
    } });
    const run = processResolveTask(proxy, jobId, 0, client, env, noImages, { scope: 'full' });
    await reached;
    let stopDone = null;
    let stopWriteMs = null;
    const t0 = Date.now();
    if (variant === 'stop_during_commit') {
      stopDone = db.doc('opsConfig/trackingPilot').set({ enabled: false, stoppedAt: new Date().toISOString() }, { merge: true })
        .then((wr) => { stopWriteMs = Date.now() - t0; return { snap: null, writeTime: wr.writeTime }; });
      await sleep(1500);
    }
    const stopCompletedBeforeRelease = stopWriteMs !== null;
    release();
    const outcome = await run;
    const stop = stopDone ? await stopDone : null;
    const heldSnap = await db.doc(`matchAnalysisJobs/${jobId}/pilotHeld/current`).get();
    // Commit times at nanosecond precision (millisecond values can tie).
    const ns = (ts) => BigInt(ts.seconds) * 1000000000n + BigInt(ts.nanoseconds);
    const heldNs = heldSnap.exists ? ns(heldSnap.updateTime) : null;
    const stopNs = stop ? ns(stop.writeTime) : null;
    const order = stop && heldSnap.exists ? (heldNs < stopNs ? 'publish_before_stop' : heldNs === stopNs ? 'same_instant' : 'publish_after_stop') : null;
    step(`race ${variant}`, { jobId, outcome, held: heldSnap.exists, order, heldNs: heldNs?.toString() ?? null, stopNs: stopNs?.toString() ?? null,
      stopWriteMs, stopCompletedBeforeRelease });
    if (variant === 'stop_during_commit') {
      // Either the transaction saw the stop (nothing persisted), or it committed first and the operator's write waited for it.
      check('race.no_persist_after_stop', outcome === 'stopped' ? !heldSnap.exists : order === 'publish_before_stop' && !stopCompletedBeforeRelease,
        { outcome, order, stopCompletedBeforeRelease, stopWriteMs });
    } else {
      check('race.control_publishes_held', outcome === 'held' && heldSnap.exists, { outcome });
    }
  }
}

async function phaseLegacy() {
  const A = users.owner;
  await seedJob('l_frames', A, { status: 'uploaded', pipelineState: 'validating', videoStoragePath: null });
  const sinkBefore = (await sinkLog()).length;
  const results = {};
  results.analyzeMatchFootage = await callable('analyzeMatchFootage', { jobId: 'l_frames' }, A);
  results.generateAiInsight = await callable('generateAiInsight', { insightType: 'video_summary', contextJson: JSON.stringify({ playerId: A.uid, matches: [] }) }, A);
  results.askThisMatch = await callable('askThisMatch', { jobId: 'l_frames', question: 'What should I work on?' }, A);
  results.explainTrackingMoment = await callable('explainTrackingMoment', { jobId: 'r_new_after_enable', momentId: 'm_1', kind: 'explain' }, users.owner2);
  const sink = (await sinkLog()).slice(sinkBefore);
  const external = (await workerLog()).filter((e) => e.source && e.source.url && !/^http:\/\/(127\.0\.0\.1|localhost):/.test(e.source.url));
  check('legacy.no_provider_calls', sink.length === 0, { sink, results: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { http: v.http, error: v.error?.status ?? null, result: v.result ? 'returned' : null }])) });
  check('legacy.no_external_media_urls', external.length === 0, { external });
  check('legacy.footage_ai_routes_refuse', results.analyzeMatchFootage.http >= 400 && results.generateAiInsight.http >= 400
    && results.explainTrackingMoment.result?.status === 'unavailable', results);

}

async function phaseCleanup() {
  const lib = (p) => require(path.join(root, 'functions/lib/analysis', p));
  const ml = lib('mediaLifecycle.js');
  const A = users.owner;
  const B = users.other;
  const list = async (prefix) => (await bucket.getFiles({ prefix }))[0].map((f) => f.name).sort();
  const pre = (u, j) => `profiles/${u.uid}/matchFootage/${j}/`;
  const extras = async (u, j) => {
    await bucket.file(`${pre(u, j)}tracking/q_1_r0.jpg`).save(Buffer.from([0xff, 0xd8, 1]), { contentType: 'image/jpeg', resumable: false });
    await bucket.file(`${pre(u, j)}owner-note.txt`).save(Buffer.from('not a job object'), { contentType: 'text/plain', resumable: false });
  };
  const inventory = {};
  // c_complete: legacy completion with one cited frame; c_keep: player asked to keep the video.
  for (const [j, u, extra] of [
    ['c_complete', A, { report: { evidence: [{ kind: 'observation', timestampSec: 10, frameIds: ['frame_0'] }] } }],
    ['c_keep', A, { retainSource: true, report: { evidence: [] } }],
    ['c_cancel', A, {}], ['c_failed', A, {}], ['c_failed2', A, {}], ['c_other_owner', B, {}], ['c_complete2', A, {}],
    ['c_tracking_done', users.owner2, LEGACY_AI_BLOCKED]]) {
    await seedJob(j, u, extra);
    await extras(u, j);
  }
  // A job whose videoStoragePath points into another job's folder must never delete that file.
  await db.doc('matchAnalysisJobs/c_complete2').set({ videoStoragePath: `${pre(A, 'c_complete')}video.mp4` }, { merge: true });
  for (const j of ['c_complete', 'c_keep', 'c_cancel', 'c_failed', 'c_failed2', 'c_complete2']) inventory[j] = await list(pre(A, j));
  inventory.c_tracking_done = await list(pre(users.owner2, 'c_tracking_done'));
  inventory.c_other_owner = await list(pre(B, 'c_other_owner'));
  step('cleanup inventory before', { inventory });

  // Completion and cancellation go through the deployed Firestore trigger (onMatchJobMediaLifecycle) in the emulator.
  await db.doc('matchAnalysisJobs/c_complete').update({ status: 'complete', updatedAt: new Date().toISOString() });
  await db.doc('matchAnalysisJobs/c_keep').update({ status: 'complete', updatedAt: new Date().toISOString() });
  const cancel = await callable('cancelMatchAnalysis', { jobId: 'c_cancel' }, A);
  await db.doc('matchAnalysisJobs/c_failed').update({ status: 'failed', updatedAt: new Date().toISOString() });
  await db.doc('matchAnalysisJobs/c_complete2').update({ status: 'complete', updatedAt: new Date().toISOString() });
  await waitFor(async () => ['c_complete', 'c_keep', 'c_cancel', 'c_complete2'].every((j) => true) && (await doc('matchAnalysisJobs/c_cancel'))?.mediaCleanupState === 'done'
    && (await doc('matchAnalysisJobs/c_complete'))?.mediaCleanupState === 'done' && (await doc('matchAnalysisJobs/c_failed'))?.mediaCleanupState === 'retry_window', 30000);
  // A tracking-only run that finished (held + released) but never changed the job status.
  ops('enable', '--allow', ALLOW(), '--worker-version', VERSION, '--hold', 'false');
  await callable('startPlayerAnalysis', { jobId: 'c_tracking_done' }, users.owner2);
  await waitFor(async () => (await trackingState('c_tracking_done')).current?.hasReport, 40000);
  await waitFor(async () => (await doc('matchAnalysisJobs/c_tracking_done'))?.mediaCleanupState === 'done', 20000);
  const after = {};
  for (const j of ['c_complete', 'c_keep', 'c_cancel', 'c_failed', 'c_complete2', 'c_tracking_done']) after[j] = { objects: await list(pre(j === 'c_tracking_done' ? users.owner2 : A, j)), state: (await doc(`matchAnalysisJobs/${j}`))?.mediaCleanupState ?? null, due: (await doc(`matchAnalysisJobs/${j}`))?.mediaCleanupDueAt ?? null };
  after.c_other_owner = { objects: await list(pre(B, 'c_other_owner')) };
  step('cleanup after triggers', { after, cancel });
  const P = (j, n) => `${pre(A, j)}${n}`;
  check('cleanup.complete_deletes_source_and_uncited', !after.c_complete.objects.includes(P('c_complete', 'video.mp4'))
    && after.c_complete.objects.includes(P('c_complete', 'frames/frame_0.jpg')) && !after.c_complete.objects.includes(P('c_complete', 'frames/frame_1.jpg')), after.c_complete);
  check('cleanup.retains_unrecognised_and_tracking_images', after.c_complete.objects.includes(P('c_complete', 'owner-note.txt'))
    && after.c_complete.objects.includes(P('c_complete', 'tracking/q_1_r0.jpg')), after.c_complete);
  check('cleanup.keep_video_retained', after.c_keep.objects.includes(P('c_keep', 'video.mp4')), after.c_keep);
  check('cleanup.cancel_deletes_source', !after.c_cancel.objects.includes(P('c_cancel', 'video.mp4')) && after.c_cancel.state === 'done', after.c_cancel);
  check('cleanup.failed_waits_for_retry_window', after.c_failed.objects.includes(P('c_failed', 'video.mp4')) && after.c_failed.state === 'retry_window', after.c_failed);
  check('cleanup.no_cross_job_deletion', after.c_other_owner.objects.length === inventory.c_other_owner.length
    && after.c_complete2.objects.length >= 1, { other: after.c_other_owner, complete2: after.c_complete2 });
  step('tracking-only completion', { objects: after.c_tracking_done.objects, state: after.c_tracking_done.state });
  check('r1.published_tracking_only_job_cleaned', after.c_tracking_done.state === 'done' && !after.c_tracking_done.objects.some((o) => o.endsWith('/video.mp4'))
    && after.c_tracking_done.objects.some((o) => o.includes('/tracking/')), after.c_tracking_done);
  // Published tracking report (hold off): the explanation route reaches its own gates and stops there; no provider call.
  const sinkN = (await sinkLog()).length;
  const pub = await callable('explainTrackingMoment', { jobId: 'c_tracking_done', momentId: 'm_1', kind: 'explain' }, users.owner2);
  check('legacy.explain_on_published_report_no_provider_call', (await sinkLog()).length === sinkN && pub.result?.status === 'unavailable', pub);
  // Sweep at the documented deadline (failedRetryHours) - the scheduled handler's body, called directly.
  const due = new Date(Date.parse(after.c_failed.due) + 1000);
  const early = await ml.sweepMediaLifecycle(db, new Date(Date.parse(after.c_failed.due) - 60_000));
  // (other jobs whose own deadlines are earlier may be cleaned by this sweep; c_failed must not be)
  const failedEarly = await list(pre(A, 'c_failed'));
  const firstSweep = await ml.sweepMediaLifecycle(db, due);
  const secondSweep = await ml.sweepMediaLifecycle(db, due);
  const failedAfter = await list(pre(A, 'c_failed'));
  check('cleanup.sweep_before_deadline_noop', failedEarly.includes(P('c_failed', 'video.mp4')), { early, failedEarly });
  check('cleanup.sweep_at_deadline_cleans', firstSweep >= 1 && !failedAfter.includes(P('c_failed', 'video.mp4')), { firstSweep, failedAfter });
  check('cleanup.sweep_repeat_safe', secondSweep === 0, { secondSweep });
  // Interrupted cleanup: state 'pending' left by a dead invocation is finished by the sweep.
  await db.doc('matchAnalysisJobs/c_failed2').update({ status: 'cancelled', mediaCleanupState: 'pending', mediaCleanupDueAt: new Date(Date.now() - 1000).toISOString() });
  await sleep(3000);
  const s3 = await ml.sweepMediaLifecycle(db, new Date());
  check('cleanup.interrupted_cleanup_finished_by_sweep', !(await list(pre(A, 'c_failed2'))).includes(P('c_failed2', 'video.mp4')), { s3, objects: await list(pre(A, 'c_failed2')) });
  // Deleting a job purges only its own prefix.
  await db.doc('matchAnalysisJobs/c_complete').delete();
  await waitFor(async () => (await list(pre(A, 'c_complete'))).length === 0, 20000);
  check('cleanup.job_delete_purges_own_prefix_only', (await list(pre(A, 'c_complete'))).length === 0 && (await list(pre(A, 'c_keep'))).length > 0
    && (await list(pre(B, 'c_other_owner'))).length === inventory.c_other_owner.length, { keep: await list(pre(A, 'c_keep')) });
  // The rehearsal footage objects of the rollback jobs: what remains, and why.
  const remaining = (await bucket.getFiles({ prefix: `profiles/${A.uid}/matchFootage/r_` }))[0].map((f) => f.name).sort();
  step('rollback job objects remaining', { remaining });
}

async function phaseR4() {
  // Server enforcement of the 60 s whole-match positioning gate through start -> queue -> worker -> resolve -> store.
  const O3 = users.owner3;
  const cases = { p4_below: ['insufficient', 59.5], p4_exact: ['measured', 60], p4_above: ['measured', 60.5],
    p4_overlap: ['insufficient', 35], p4_gap: ['insufficient', 50], p4_likely: ['insufficient', 30] };
  ops('enable', '--allow', ALLOW(), '--worker-version', VERSION, '--hold', 'true');
  for (const j of Object.keys(cases)) { await seedJob(j, O3, LEGACY_AI_BLOCKED); await callable('startPlayerAnalysis', { jobId: j }, O3); }
  const got = {};
  for (const j of Object.keys(cases)) {
    await waitFor(async () => (await doc(`matchAnalysisJobs/${j}/pilotHeld/current`))?.report, 40000);
    const ob = (await doc(`matchAnalysisJobs/${j}/pilotHeld/current`))?.report?.offball ?? null;
    got[j] = { status: ob?.status ?? null, serverEligibleSec: ob?.serverEligibleSec ?? null, confirmedSec: ob?.confirmedSec ?? null,
      hasMeasurement: Boolean(ob?.nearestOpponentBodyHeights) };
  }
  step('r4 stored offball per case', { got, workerClaimedConfirmedSec: 300 });
  check('r4.server_gate_boundaries', Object.entries(cases).every(([j, [st, sec]]) => got[j].status === st && got[j].serverEligibleSec === sec
    && got[j].hasMeasurement === (st === 'measured') && got[j].confirmedSec <= sec), { got });
  ops('release', 'p4_exact', '--reviewer', 'rehearsal-reviewer');
  ops('release', 'p4_below', '--reviewer', 'rehearsal-reviewer');
  const ex = await ownerRead('matchAnalysisJobs/p4_exact/tracking/current', O3);
  const be = await ownerRead('matchAnalysisJobs/p4_below/tracking/current', O3);
  const st = (r) => r.fields?.report?.mapValue?.fields?.offball?.mapValue?.fields?.status?.stringValue ?? null;
  check('r4.owner_reads_only_validated_measurement', ex.http === 200 && st(ex) === 'measured' && be.http === 200 && st(be) === 'insufficient',
    { exact: st(ex), below: st(be) });
}

async function phaseR1() {
  const A2 = users.owner2;
  ops('enable', '--allow', ALLOW(), '--worker-version', VERSION, '--hold', 'true');
  await seedJob('t1_keep', A2, { ...LEGACY_AI_BLOCKED, retainSource: true });
  await seedJob('t1_dup', A2, LEGACY_AI_BLOCKED);
  await seedJob('t1_cancel', A2, LEGACY_AI_BLOCKED);
  const done = async (j) => waitFor(async () => { const d = await doc(`matchAnalysisJobs/${j}`); return d?.trackingState === 'complete' && d?.mediaCleanupState === 'done' ? d : null; }, 40000);
  await callable('startPlayerAnalysis', { jobId: 't1_keep' }, A2);
  await callable('startPlayerAnalysis', { jobId: 't1_dup' }, A2);
  const keep = await done('t1_keep');
  const keepObjs = await jobObjects(A2, 't1_keep');
  check('r1.keep_choice_retains_source', keep && keepObjs.includes('video.mp4') && !keepObjs.some((o) => o.startsWith('frames/'))
    && keep.mediaLifecycle?.source === 'retained', { keepObjs, lifecycle: keep?.mediaLifecycle });
  const dup = await done('t1_dup');
  const dupBefore = { objs: await jobObjects(A2, 't1_dup'), attempts: dup?.mediaLifecycle?.attempts, held: (await doc('matchAnalysisJobs/t1_dup/pilotHeld/current'))?.version };
  await enqueue('resolveTrackingTask', { jobId: 't1_dup', feedbackRevision: 0, scope: 'full' });
  await enqueue('resolveTrackingTask', { jobId: 't1_dup', feedbackRevision: 0, scope: 'full' });
  await enqueue('extractTrackingSegmentTask', { jobId: 't1_dup', generation: 1, index: 0 });
  await sleep(8000);
  const dupAfterDoc = await doc('matchAnalysisJobs/t1_dup');
  const dupAfter = { objs: await jobObjects(A2, 't1_dup'), attempts: dupAfterDoc?.mediaLifecycle?.attempts, state: dupAfterDoc?.trackingState,
    held: (await doc('matchAnalysisJobs/t1_dup/pilotHeld/current'))?.version };
  check('r1.duplicate_callbacks_after_completion_safe', dup && dupAfter.state === 'complete' && dupAfter.attempts === dupBefore.attempts
    && JSON.stringify(dupAfter.objs.filter((o) => !o.startsWith('pilotHeld/'))) === JSON.stringify(dupBefore.objs.filter((o) => !o.startsWith('pilotHeld/')))
    && dupAfter.objs.filter((o) => o.startsWith('pilotHeld/')).length === dupBefore.objs.filter((o) => o.startsWith('pilotHeld/')).length,
  { dupBefore, dupAfter });
  // Cancellation while the worker is running; the late result must not publish and the source is deleted at once.
  await ctl('plan', { jobId: 't1_cancel', route: 'extract', action: 'hold', times: 1 });
  await callable('startPlayerAnalysis', { jobId: 't1_cancel' }, A2);
  await waitFor(async () => (await waiting('t1_cancel', 'extract')) === 1, 20000);
  const cancel = await callable('cancelMatchAnalysis', { jobId: 't1_cancel' }, A2);
  const cancelled = await waitFor(async () => { const d = await doc('matchAnalysisJobs/t1_cancel'); return d?.mediaCleanupState === 'done' ? d : null; }, 20000);
  const objsAtCancel = await jobObjects(A2, 't1_cancel');
  await ctl('release', { jobId: 't1_cancel', route: 'extract' });
  await sleep(6000);
  const tc = await trackingState('t1_cancel');
  check('r1.cancel_cleans_and_late_result_cannot_publish', cancel.result?.status === 'cancelled' && cancelled && !objsAtCancel.includes('video.mp4')
    && !tc.held?.hasReport && !tc.current?.hasReport && !(await jobObjects(A2, 't1_cancel')).some((o) => o.startsWith('tracking/') || o.startsWith('pilotHeld/')),
  { objsAtCancel, tc, after: await jobObjects(A2, 't1_cancel') });
  // Retry-window boundary for an interrupted (stopped) run, through the sweep handler at the documented deadline.
  const ml = require(path.join(root, 'functions/lib/analysis/mediaLifecycle.js'));
  const q = await doc('matchAnalysisJobs/r_queued');
  const due = Date.parse(q?.mediaCleanupDueAt ?? '');
  const otherBefore = await jobObjects(users.owner, 'r_released');
  const early = await ml.sweepMediaLifecycle(db, new Date(due - 60_000));
  const objEarly = await jobObjects(users.owner, 'r_queued');
  const at = await ml.sweepMediaLifecycle(db, new Date(due + 1000));
  const objAt = await jobObjects(users.owner, 'r_queued');
  const again = await ml.sweepMediaLifecycle(db, new Date(due + 1000));
  check('r1.retry_window_boundary', q?.trackingState === 'failed' && q?.mediaCleanupState === 'retry_window'
    && Math.abs(due - Date.parse(q.trackingFailedAt) - 24 * 3600_000) < 5000 && objEarly.includes('video.mp4') && !objAt.includes('video.mp4')
    && again === 0 && JSON.stringify(otherBefore) === JSON.stringify(await jobObjects(users.owner, 'r_released')),
  { due: q?.mediaCleanupDueAt, failedAt: q?.trackingFailedAt, early, objEarly, at, objAt, again });
}

async function phaseR2Legacy() {
  // Images stored before R2: a held report whose image sits at the owner path, and a released report's image.
  const A = users.owner;
  await seedJob('l2_legacy', A, LEGACY_AI_BLOCKED);
  const base = `profiles/${A.uid}/matchFootage/l2_legacy`;
  for (const n of ['q_legacy_r0', 'm_legacy']) await bucket.file(`${base}/tracking/${n}.jpg`).save(Buffer.from([0xff, 0xd8, 0xff, 1]), { contentType: 'image/jpeg', resumable: false });
  await db.doc('matchAnalysisJobs/l2_legacy/pilotHeld/current').set({ report: { reviewQuestions: [{ id: 'q_legacy', imagePath: `${base}/tracking/q_legacy_r0.jpg` }] }, version: 1, heldAt: 'legacy' });
  await db.doc('matchAnalysisJobs/l2_legacy/tracking/current').set({ report: { moments: [{ id: 'm_legacy', imagePath: `${base}/tracking/m_legacy.jpg` }] }, version: 1, stale: false });
  const before = await clientRead(`${base}/tracking/q_legacy_r0.jpg`, A);
  const pr = JSON.parse(ops('prune-images', 'l2_legacy').stdout || '{}').result;
  const after = { held: await clientRead(`${base}/tracking/q_legacy_r0.jpg`, A), twin: await clientRead(`${base}/pilotHeld/q_legacy_r0.jpg`, A),
    released: await clientRead(`${base}/tracking/m_legacy.jpg`, A) };
  check('r2.legacy_held_image_contained_released_kept', before === 200 && after.held === 404 && after.twin === 403 && after.released === 200
    && pr?.contained?.length === 1, { before, after, pr });
}

async function phaseR3() {
  // Account export of a user with a released report, a held report and finished/cancelled jobs.
  const A2 = users.owner2;
  const r = await callable('requestDataExport', {}, A2);
  const exp = await waitFor(async () => { const d = r.result?.exportId ? await doc(`dataExports/${r.result.exportId}`) : null; return d?.status === 'ready' ? d : null; }, 60000, 500);
  const text = exp?.storagePath ? (await bucket.file(exp.storagePath).download())[0].toString('utf8') : '';
  const archive = text ? JSON.parse(text) : null;
  const links = JSON.stringify(archive?.sections?.media ?? archive?.sections ?? {}).match(/https?:\/\/[^"]+/g) ?? [];
  const analyses = archive?.sections?.analyses ?? [];
  check('r3.account_export_current_contract', Boolean(exp) && !/\/tracking\/[A-Za-z0-9_-]+\.jpg/.test(text) && !text.includes('/pilotHeld/')
    && !text.includes('reviewQuestions') && !text.includes('stateStrip') && !text.includes('producedBy')
    && !links.some((l) => l.includes('tracking') || l.includes('pilotHeld')) && analyses.length >= 3,
  { bytes: text.length, analyses: analyses.length, analysisKeys: Object.keys(analyses[0] ?? {}).sort(), linkCount: links.length });
}

try {
  await setup();
  for (const p of PHASES) {
    step(`phase ${p}`, {});
    try {
      if (p === 'gate') await phaseGate();
      if (p === 'rollback') await phaseRollback();
      if (p === 'race') await phaseRace();
      if (p === 'legacy') await phaseLegacy();
      if (p === 'cleanup') await phaseCleanup();
      if (p === 'r4') await phaseR4();
      if (p === 'r1') await phaseR1();
      if (p === 'r2legacy') await phaseR2Legacy();
      if (p === 'r3') await phaseR3();
    } catch (e) {
      check(`phase.${p}.completed`, false, { error: String(e?.stack ?? e).slice(0, 1500) });
    }
  }
} finally {
  evidence.finishedAt = new Date().toISOString();
  evidence.summary = { passed: evidence.checks.filter((c) => c.ok).length, failed: evidence.checks.filter((c) => !c.ok).map((c) => c.id) };
  fs.writeFileSync(OUT, JSON.stringify(evidence, null, 1));
  console.log('SUMMARY', JSON.stringify(evidence.summary));
}
process.exit(evidence.summary.failed.length ? 1 : 0);
