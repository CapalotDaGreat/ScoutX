#!/usr/bin/env node
/**
 * Cloud Tasks authentication, retry, de-duplication and stale-delivery probes.
 *
 *   STAGING_CONFIG=staging.json node scripts/pilot-staging/probe-tasks.mjs out.json [--dry-run] [--only A1,A2,...]
 *
 * Staging: tasks are created with the Cloud Tasks REST API (operator ADC) or the Admin SDK, exactly as the server does.
 * Emulator (no STAGING_CONFIG): cases that need real OIDC verification are recorded as `unexecuted`; the rest run, which
 * checks this driver. --dry-run prints the redacted task bodies and log filters without creating anything.
 *
 * Every probe job is synthetic, owned by a fresh synthetic user, seeded with a queued segment and an authorised run,
 * so a request that reached the handler WOULD call the worker: "no worker call + progress unchanged" therefore shows
 * the rejection happened before the handler.
 */
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { accessToken, callableHeaders, evidenceWriter, loadConfig, operatorIdentityToken, parseDriverArgs, redact, requireFn, root, sleep, waitFor } from './lib.mjs';
import { driverGuard } from './limits.mjs';

const cfg = loadConfig();
const args = process.argv.slice(2);
const parsed = parseDriverArgs(args);
const OUT = parsed.out ?? process.env.REHEARSAL_OUT ?? 'probe-tasks-evidence.json';
const DRY = parsed.dryRun;
const ONLY = parsed.only;
const RUN = `pt${Date.now().toString(36)}`;
const E = evidenceWriter(OUT, { target: cfg.target, project: cfg.project, commit: process.env.REHEARSAL_COMMIT ?? null, run: RUN, dryRun: DRY });
const want = (id) => !ONLY.length || ONLY.includes(id);
const STAGING = cfg.target === 'staging';

const { initializeApp } = requireFn('firebase-admin/app');
const { getFirestore } = requireFn('firebase-admin/firestore');
const { getStorage } = requireFn('firebase-admin/storage');
const { getFunctions } = requireFn('firebase-admin/functions');
initializeApp({ projectId: cfg.project, storageBucket: cfg.bucket });
const db = getFirestore();
const bucket = getStorage().bucket();
const { VIDEO_CONSENT_VERSION } = requireFn(path.join(root, 'functions/lib/analysis/videoConsent.js'));
const { taskQueueName } = requireFn(path.join(root, 'functions/lib/region.js'));
const doc = async (p) => { const s = await db.doc(p).get(); return s.exists ? s.data() : null; };
const fnUrl = (name) => `${cfg.functionsBase}/${name}`;
const queuePath = (q) => `projects/${cfg.project}/locations/${cfg.region}/queues/${q}`;
const workerHeaders = async () => (cfg.workerAuth === 'operator' ? { Authorization: `Bearer ${await operatorIdentityToken(cfg.workerBase)}` } : {});
const workerLog = async () => (await fetch(`${cfg.workerBase}/_ctl/log`, { headers: await workerHeaders() })).json();
const ctl = async (p, b) => (await fetch(`${cfg.workerBase}/_ctl/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...await workerHeaders() }, body: JSON.stringify(b) })).json();
const calls = async (jobId, route) => (await workerLog()).filter((e) => e.jobId === jobId && (!route || e.route === route));

function ops(...a) {
  const extra = STAGING ? ['--project', cfg.project, '--production-authorized', '--bucket', cfg.bucket] : [];
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/tracking-pilot-ops.mjs'), ...a, ...extra], { env: process.env, encoding: 'utf8' });
  E.step('ops', { args: a, exit: r.status, stdout: r.stdout.trim().slice(0, 600) });
  return r;
}
async function signUp(label) {
  const r = await fetch(`${cfg.authBase}/accounts:signUp?key=${cfg.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${RUN}-${label}@pitchproof-staging.invalid`, password: `stg-${RUN}-pw-1`, returnSecureToken: true }) });
  const j = await r.json();
  return { uid: j.localId, token: j.idToken };
}
async function callable(name, data, user) {
  const r = await fetch(cfg.callableUrls?.[name] ?? fnUrl(name), { method: 'POST', headers: await callableHeaders(cfg, user, name), body: JSON.stringify({ data }) });
  let j = null; try { j = await r.json(); } catch { /* none */ }
  return { http: r.status, result: j?.result ?? null };
}
/** A job whose single segment is queued under a current authorisation: any delivery that reaches the handler calls the worker. */
async function probeJob(id, owner) {
  const prefix = `profiles/${owner.uid}/matchFootage/${id}/`;
  const at = new Date().toISOString();
  await bucket.file(`${prefix}video.mp4`).save(Buffer.from(`synthetic ${id}`), { contentType: 'video/mp4', resumable: false });
  await db.doc(`matchAnalysisJobs/${id}`).set({ playerId: owner.uid, targeting: { kitPrimaryColor: 'orange' }, videoStoragePath: `${prefix}video.mp4`,
    measuredDurationSec: 60, durationSec: 60, status: 'failed', pipelineState: 'failed', syntheticRun: RUN, trackingState: 'running', createdAt: at, updatedAt: at });
  await db.doc(`videoProcessingConsents/${id}`).set({ uid: owner.uid, revokedAt: null, policyVersion: VIDEO_CONSENT_VERSION });
  await db.doc(`matchAnalysisJobs/${id}/tracking/progress`).set({ schema: 'pitchproof.tracking-progress.v1', generation: 1, durationSec: 60,
    plan: [{ index: 0, startSec: 0, endSec: 60 }], segments: { 0: { status: 'queued', attempts: 0 } }, startedAt: at, updatedAt: at,
    resolving: null, preliminary: null, full: null, outcome: null, blocked: null, pilotAuthorizedAt: at });
}
/** Raw Cloud Tasks createTask (staging), so authentication can be varied. Returns the task name and HTTP status. */
async function createRawTask(queue, url, data, { oidc, audience, name, scheduleDelaySec } = {}) {
  const task = { httpRequest: { httpMethod: 'POST', url, headers: { 'Content-Type': 'application/json' },
    body: Buffer.from(JSON.stringify({ data })).toString('base64'), ...(oidc ? { oidcToken: { serviceAccountEmail: oidc, ...(audience ? { audience } : {}) } } : {}) },
  ...(name ? { name: `${queuePath(queue)}/tasks/${name}` } : {}),
  ...(scheduleDelaySec ? { scheduleTime: new Date(Date.now() + scheduleDelaySec * 1000).toISOString() } : {}) };
  if (DRY || !STAGING) { E.step('createTask (not sent)', { queue, task }); return { name: null, http: null }; }
  const r = await fetch(`https://cloudtasks.googleapis.com/v2/${queuePath(queue)}/tasks`, { method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ task, responseView: 'BASIC' }) });
  const j = await r.json().catch(() => ({}));
  E.step('createTask', { queue, http: r.status, name: j.name ?? null, error: j.error?.status ?? null });
  return { name: j.name ?? null, http: r.status, error: j.error?.status ?? null };
}
const enqueue = (queue, payload, opts = {}) => getFunctions().taskQueue(taskQueueName(queue)).enqueue(payload, { dispatchDeadlineSeconds: 900, ...opts });

let guard;
/** Reserve the case's worst-case tasks/attempts (limits.mjs); a case that would exceed a limit stops the run. */
const reserve = async (id) => { if (!DRY) await guard.reserve(id); };
async function main() {
  guard = await driverGuard(cfg, E, ops, spawnSync, operatorIdentityToken);
  const owner = await signUp('owner');
  if (!DRY) ops('enable', '--allow', owner.uid, '--worker-version', cfg.workerVersion, '--hold', 'true');
  const extract = fnUrl('extractTrackingSegmentTask');

  // A: authentication at the platform layer (Cloud Run IAM in front of the task function).
  const authCases = [
    ['A1', 'valid', { oidc: cfg.runtimeServiceAccount }],
    ['A2', 'missing_credentials', {}],
    ['A3', 'wrong_audience', { oidc: cfg.runtimeServiceAccount, audience: 'https://wrong-audience.pitchproof-staging.invalid' }],
    ['A4', 'unauthorized_identity', { oidc: cfg.unauthorizedServiceAccount }],
  ];
  for (const [id, label, auth] of authCases) {
    if (!want(id)) continue;
    await reserve(id);
    const job = `${RUN}_${id}`;
    if (!DRY) await probeJob(job, owner);
    const t0 = new Date().toISOString();
    const created = await createRawTask(cfg.authProbeQueue ?? 'stg-auth-probe', extract, { jobId: job, generation: 1, index: 0 }, auth);
    if (!STAGING || DRY) { E.check(`${id}.${label}`, true, { reason: STAGING ? 'dry run' : 'the emulator does not authenticate task dispatch' }, 'unexecuted'); continue; }
    await sleep(45000);
    const c = await calls(job, 'extract');
    const seg = (await doc(`matchAnalysisJobs/${job}/tracking/progress`))?.segments?.['0'];
    const expectRan = label === 'valid';
    E.check(`${id}.${label}`, expectRan ? c.length === 1 && seg?.status === 'done' : c.length === 0 && seg?.status === 'queued' && seg?.attempts === 0,
      { task: created.name, createdAt: t0, workerCalls: c.length, segment: seg,
        logs: 'collect-logs.mjs: cloudtasks attempt log (status) + run.googleapis.com/requests (status, no container log) for this task name/time' });
  }

  // R: retries through the normal path (startPlayerAnalysis -> extract queue).
  for (const [id, label, fails] of [['R1', 'retryable_then_success', 1], ['R2', 'permanent_failure_at_attempt_limit', 3]]) {
    if (!want(id) || DRY) continue;
    await reserve(id);
    const job = `${RUN}_${id}`;
    await probeJob(job, owner);
    await db.doc(`matchAnalysisJobs/${job}/tracking/progress`).delete();
    await ctl('plan', { jobId: job, route: 'extract', action: 'fail', times: fails });
    await callable('startPlayerAnalysis', { jobId: job }, owner);
    const done = await waitFor(async () => { const s = (await doc(`matchAnalysisJobs/${job}/tracking/progress`))?.segments?.['0']; return s?.status === 'done' || s?.status === 'failed' ? s : null; }, 420000, 2000);
    const attempts = (await calls(job, 'extract')).map((e) => e.at);
    const gaps = attempts.slice(1).map((t, i) => (Date.parse(t) - Date.parse(attempts[i])) / 1000);
    const st = await doc(`matchAnalysisJobs/${job}`);
    E.check(`${id}.${label}`, fails === 1 ? done?.status === 'done' && attempts.length === 2 && gaps[0] >= 55
      : done?.status === 'failed' && attempts.length === 3 && st?.trackingState === 'failed', { attempts, gapsSec: gaps, segment: done, trackingState: st?.trackingState });
  }

  // R3: queue attempt limit below the handler's own limit (probe queue maxAttempts=2): the queue stops, the job stays queued.
  if (want('R3')) {
    await reserve('R3');
    const job = `${RUN}_R3`;
    if (!DRY) { await probeJob(job, owner); await ctl('plan', { jobId: job, route: 'extract', action: 'fail', times: 9 }); }
    const created = await createRawTask(cfg.exhaustProbeQueue ?? 'stg-exhaust-probe', extract, { jobId: job, generation: 1, index: 0 }, { oidc: cfg.runtimeServiceAccount });
    if (!STAGING || DRY) E.check('R3.queue_attempt_limit', true, { reason: STAGING ? 'dry run' : 'needs the dedicated probe queue' }, 'unexecuted');
    else {
      await sleep(240000);
      const c = await calls(job, 'extract');
      E.check('R3.queue_attempt_limit', c.length === 2, { task: created.name, workerCalls: c.length,
        segment: (await doc(`matchAnalysisJobs/${job}/tracking/progress`))?.segments?.['0'] });
    }
  }

  // D1: queue-level de-duplication by task name (Admin SDK `id`, exactly the server's enqueue).
  if (want('D1') && !DRY) {
    await reserve('D1');
    const job = `${RUN}_D1`;
    await probeJob(job, owner);
    await db.doc(`matchAnalysisJobs/${job}/tracking/progress`).set({ segments: { 0: { status: 'done', attempts: 1 } } }, { merge: true });
    const id = `${RUN}-dup`;
    const res = [];
    for (const when of ['first', 'second_immediately']) {
      try { await enqueue('extractTrackingSegmentTask', { jobId: job, generation: 1, index: 0 }, { id }); res.push([when, 'created']); } catch (e) { res.push([when, e.code ?? String(e)]); }
    }
    await sleep(STAGING ? 60000 : 5000);
    try { await enqueue('extractTrackingSegmentTask', { jobId: job, generation: 1, index: 0 }, { id }); res.push(['after_execution', 'created']); } catch (e) { res.push(['after_execution', e.code ?? String(e)]); }
    E.check('D1.task_name_dedup', res[0][1] === 'created' && res[1][1] === 'functions/task-already-exists', { results: res,
      note: 'after_execution is recorded, not asserted (Cloud Tasks documents a dedup window of up to 24 h after deletion)' },
    STAGING ? undefined : (res[1][1] === 'functions/task-already-exists' ? 'passed' : 'unexecuted'));
  }

  // D2: two unnamed tasks for the same logical work, created back to back: one worker call (application lease).
  if (want('D2') && !DRY) {
    await reserve('D2');
    const job = `${RUN}_D2`;
    await probeJob(job, owner);
    await ctl('plan', { jobId: job, route: 'extract', action: 'hold', times: 1 });
    await enqueue('extractTrackingSegmentTask', { jobId: job, generation: 1, index: 0 });
    await waitFor(async () => (await calls(job, 'extract')).length === 1, 120000, 1000);
    await enqueue('extractTrackingSegmentTask', { jobId: job, generation: 1, index: 0 });
    await sleep(20000);
    await ctl('release', { jobId: job, route: 'extract' });
    await sleep(20000);
    E.check('D2.redelivery_one_worker_call', (await calls(job, 'extract')).length === 1
      && (await doc(`matchAnalysisJobs/${job}/tracking/progress`))?.segments?.['0']?.status === 'done', { extractCalls: (await calls(job, 'extract')).length });
  }

  // D3: a resolve repeated after the full report exists: no worker call, no new version, notice or cleanup.
  if (want('D3') && !DRY) {
    await reserve('D3');
    const job = `${RUN}_D3`;
    await probeJob(job, owner);
    await db.doc(`matchAnalysisJobs/${job}/tracking/progress`).delete();
    await callable('startPlayerAnalysis', { jobId: job }, owner);
    await waitFor(async () => (await doc(`matchAnalysisJobs/${job}/pilotHeld/current`))?.report, 300000, 2000);
    await waitFor(async () => (await doc(`matchAnalysisJobs/${job}`))?.mediaCleanupState === 'done', 120000, 2000);
    const before = { resolves: (await calls(job, 'resolve')).length, version: (await doc(`matchAnalysisJobs/${job}/pilotHeld/current`))?.version,
      lifecycle: (await doc(`matchAnalysisJobs/${job}`))?.mediaLifecycle?.attempts,
      notices: (await db.collection('activities').where('recipientId', '==', owner.uid).get()).size };
    await enqueue('resolveTrackingTask', { jobId: job, feedbackRevision: 0, scope: 'full' });
    await enqueue('resolveTrackingTask', { jobId: job, feedbackRevision: 0, scope: 'full' });
    await sleep(STAGING ? 60000 : 8000);
    const after = { resolves: (await calls(job, 'resolve')).length, version: (await doc(`matchAnalysisJobs/${job}/pilotHeld/current`))?.version,
      lifecycle: (await doc(`matchAnalysisJobs/${job}`))?.mediaLifecycle?.attempts,
      notices: (await db.collection('activities').where('recipientId', '==', owner.uid).get()).size };
    E.check('D3.repeated_resolve_no_side_effects', JSON.stringify(before) === JSON.stringify(after), { before, after });
  }

  // D4: two unnamed resolves for the same work while the first executes (claim): one worker call, one version,
  // the duplicate leaves `resolving` alone and triggers no queue retry.
  if (want('D4') && !DRY) {
    await reserve('D4');
    const job = `${RUN}_D4`;
    await probeJob(job, owner);
    await db.doc(`matchAnalysisJobs/${job}/tracking/progress`).set({ segments: { 0: { status: 'done', attempts: 1 } }, resolving: 'full' }, { merge: true });
    await ctl('plan', { jobId: job, route: 'resolve', action: 'hold', times: 1 });
    await enqueue('resolveTrackingTask', { jobId: job, feedbackRevision: 0, scope: 'full' });
    await waitFor(async () => (await calls(job, 'resolve')).length === 1, 120000, 1000);
    await enqueue('resolveTrackingTask', { jobId: job, feedbackRevision: 0, scope: 'full' });
    await sleep(STAGING ? 30000 : 6000);
    const during = { calls: (await calls(job, 'resolve')).length, resolving: (await doc(`matchAnalysisJobs/${job}/tracking/progress`))?.resolving ?? null };
    await ctl('release', { jobId: job, route: 'resolve' });
    await waitFor(async () => (await doc(`matchAnalysisJobs/${job}/pilotHeld/current`))?.report, 120000, 1000);
    await sleep(STAGING ? 30000 : 4000);
    const after = { calls: (await calls(job, 'resolve')).length, version: (await doc(`matchAnalysisJobs/${job}/pilotHeld/current`))?.version ?? null };
    E.check('D4.duplicate_resolve_during_execution', during.calls === 1 && during.resolving === 'full' && after.calls === 1 && after.version === 1, { during, after });
  }

  // S1: a task authorised before a stop, delivered after re-enable (delayed), stays stale.
  if (want('S1') && !DRY) {
    await reserve('S1');
    const job = `${RUN}_S1`;
    await probeJob(job, owner);
    await db.doc(`matchAnalysisJobs/${job}/tracking/progress`).set({ segments: { 0: { status: 'done', attempts: 1 } } }, { merge: true });
    // Staging: the task is created before the stop and scheduled to arrive after the re-enable (Cloud Tasks honours
    // scheduleTime). The tasks emulator was seen dispatching a delayed task at once when the queue had just been busy
    // (2026-11-19), so there the task is created after the re-enable instead: the handler reads the run's authorisation
    // from the progress document, which predates the stop either way.
    if (STAGING) await enqueue('resolveTrackingTask', { jobId: job, feedbackRevision: 0, scope: 'full' }, { scheduleDelaySeconds: 90 });
    ops('stop');
    await sleep(2000);
    ops('enable', '--allow', owner.uid, '--worker-version', cfg.workerVersion, '--hold', 'true');
    if (!STAGING) await enqueue('resolveTrackingTask', { jobId: job, feedbackRevision: 0, scope: 'full' });
    E.step('S1 variant', { createdBeforeStop: STAGING });
    await sleep(STAGING ? 150000 : 20000);
    E.check('S1.pre_stop_task_stale_after_reenable', (await calls(job, 'resolve')).length === 0 && !(await doc(`matchAnalysisJobs/${job}/pilotHeld/current`))?.report,
      { resolveCalls: (await calls(job, 'resolve')).length });
  }
}

let ok = false;
try {
  await main();
  // Worker calls are a lower bound on delivery attempts (rejected deliveries never reach it); attempt logs give the rest.
  if (!DRY) await guard.observe((await workerLog()).filter((e) => String(e.jobId).startsWith(RUN)).length);
} catch (e) { E.check('driver.completed', false, { error: redact(String(e?.stack ?? e)).slice(0, 1500) }); } finally {
  if (guard) E.step('limits', guard.summary());
  ok = E.write();
}
process.exit(ok ? 0 : 1);
