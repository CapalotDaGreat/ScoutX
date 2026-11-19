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
const PHASES = (process.env.REHEARSAL_PHASES ?? 'gate,rollback,race,legacy,cleanup').split(',');

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
const ALLOW = () => [users.owner.uid, users.owner2.uid].join(',');
async function setup() {
  for (const l of ['owner', 'owner2', 'outsider', 'other']) users[l] = await signUp(l);
  step('users', { owner: users.owner.uid, owner2: users.owner2.uid, outsider: users.outsider.uid, other: users.other.uid });
}

async function phaseGate() {
  const A = users.owner;
  const jobs = ['g_missing', 'g_malformed', 'g_version', 'g_unlisted', 'g_consent', 'g_wrongmodel'];
  for (const j of jobs.filter((j) => j !== 'g_unlisted')) await seedJob(j, A);
  await seedJob('g_unlisted', users.outsider);
  await db.doc('videoProcessingConsents/g_consent').delete();

  await db.doc('opsConfig/trackingPilot').delete();
  let r = await callable('startPlayerAnalysis', { jobId: 'g_missing' }, A);
  check('gate.missing_config.start_blocked', r.result?.status === 'blocked' && (await doc('matchAnalysisJobs/g_missing/tracking/progress'))?.pilot === 'missing_config', r);
  await db.doc('opsConfig/trackingPilot').set({ enabled: 'yes', allowlist: [A.uid], workerVersion: VERSION });
  r = await callable('startPlayerAnalysis', { jobId: 'g_malformed' }, A);
  check('gate.malformed_config.start_blocked', r.result?.status === 'blocked' && (await doc('matchAnalysisJobs/g_malformed/tracking/progress'))?.pilot === 'missing_config', r);
  ops('enable', '--allow', ALLOW(), '--worker-version', `${VERSION}-other`);
  r = await callable('startPlayerAnalysis', { jobId: 'g_version' }, A);
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
  for (const j of jobs) await seedJob(j, A);
  // Second allowlisted owner for the later starts (the 10 starts/day limit per user stays in force).
  for (const j of ['r_new_after_stop', 'r_new_after_enable']) await seedJob(j, A2);
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
  ops('release', 'r_released', '--reviewer', 'rehearsal-reviewer');
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
  check('stop.queued_redelivery_fails_closed', redelivered && (await calls('r_queued', 'extract')) === 1, { redelivered, extractCalls: await calls('r_queued', 'extract') });
  const lateReleasedCalls = (await workerLog()).filter((e) => e.jobId === 'r_released' && e.route === 'resolve' && e.at >= stopAt).length;
  check('stop.old_scheduled_delivery_no_effect', after.r_released.current?.version === before.r_released.current?.version
    && lateReleasedCalls === 0, { before: before.r_released, after: after.r_released, lateReleasedCalls });
  check('stop.duplicate_delivery_no_worker_call', (await calls('r_publish', 'resolve')) === 1, { resolveCalls: await calls('r_publish', 'resolve') });
  check('stop.released_report_unchanged_until_withheld', after.r_released.current?.hasReport, after.r_released);
  step('notifications after stop', { list: await notifications(A.uid) });

  // 4. Containment of the already released report (recovery procedure: ops withhold).
  ops('withhold', 'r_released', '--reason', 'rehearsal-containment');
  const w = await trackingState('r_released');
  const ownerCur = await ownerRead('matchAnalysisJobs/r_released/tracking/current', A);
  check('withhold.owner_sees_no_report', !w.current?.hasReport && w.current?.pendingReason === 'withheld_for_review' && w.held?.withheldAt
    && ownerCur.http === 200 && !ownerCur.fields?.report?.mapValue, { w, ownerHttp: ownerCur.http });
  check('withhold.held_copy_unreadable', (await ownerRead('matchAnalysisJobs/r_released/pilotHeld/current', A)).http === 403);
  // Ordinary API paths on the withheld job.
  r = await callable('answerTrackingQuestion', { jobId: 'r_released', questionId: qid, answer: 'not_me', operationId: 'op_rehearsal_0002' }, A);
  check('withhold.answer_refused_without_report', r.http >= 400, r);
  r = await callable('explainTrackingMoment', { jobId: 'r_released', momentId: 'm_1', kind: 'positioning' }, A);
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
    const heldMs = heldSnap.exists ? heldSnap.updateTime.toMillis() : null;
    const stopMs = stop ? stop.writeTime.toMillis() : null;
    const order = stop && heldSnap.exists ? (heldMs < stopMs ? 'publish_before_stop' : 'publish_after_stop') : null;
    step(`race ${variant}`, { jobId, outcome, held: heldSnap.exists, order, heldMs, stopMs, stopWriteMs, stopCompletedBeforeRelease });
    if (variant === 'stop_during_commit') {
      check('race.no_persist_after_stop', outcome === 'stopped' ? !heldSnap.exists : order === 'publish_before_stop', { outcome, order });
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
  results.generateAiInsight = await callable('generateAiInsight', { insightType: 'weekly_summary', contextJson: JSON.stringify({ playerId: A.uid }) }, A);
  results.askThisMatch = await callable('askThisMatch', { jobId: 'l_frames', question: 'What should I work on?' }, A);
  results.explainTrackingMoment = await callable('explainTrackingMoment', { jobId: 'r_new_after_enable', momentId: 'm_1', kind: 'positioning' }, A);
  const sink = (await sinkLog()).slice(sinkBefore);
  const external = (await workerLog()).filter((e) => e.source && e.source.url && !/^http:\/\/(127\.0\.0\.1|localhost):/.test(e.source.url));
  check('legacy.no_provider_calls', sink.length === 0, { sink, results: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { http: v.http, error: v.error?.status ?? null, result: v.result ? 'returned' : null }])) });
  check('legacy.no_external_media_urls', external.length === 0, { external });
  check('legacy.footage_ai_routes_refuse', results.analyzeMatchFootage.http >= 400, { analyze: results.analyzeMatchFootage });
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
    ['c_tracking_done', users.owner2, {}]]) {
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
  // Sweep at the documented deadline (failedRetryHours) - the scheduled handler's body, called directly.
  const due = new Date(Date.parse(after.c_failed.due) + 1000);
  const early = await ml.sweepMediaLifecycle(db, new Date(Date.parse(after.c_failed.due) - 60_000));
  const firstSweep = await ml.sweepMediaLifecycle(db, due);
  const secondSweep = await ml.sweepMediaLifecycle(db, due);
  const failedAfter = await list(pre(A, 'c_failed'));
  check('cleanup.sweep_before_deadline_noop', early === 0, { early });
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
