import { decodeTrackingStorage as appDecode } from '../../src/features/match-analysis/services/trackingStorage.ts';
/** B-26 real Firestore transactions; synthetic worker replies, no inference or cloud access. */
import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test as nodeTest } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PROJECT_ID, getDocument, setDocument, tokenFor } from './emulator.mjs';

// Fail before Admin initialization if this file is invoked outside a loopback emulator.
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/,
  'B-26 integration requires a loopback FIRESTORE_EMULATOR_HOST');
assert.ok(PROJECT_ID.startsWith('demo-'));
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { claimTrackingTask, releaseTrackingTask, RECONCILIATION_COLLECTION } = require('./lib/analysis/trackingTaskLeases.js');
const { reconcileTrackingAttempt, sweepTrackingAttempts } = require('./lib/analysis/trackingReconciliation.js');
const { processResolveTask, runResolveTaskAttempt, processOcrFollowUpTask, answerTrackingQuestion } = require('./lib/analysis/trackingCallables.js');
const { TRACKING_ATTEMPT_LEASE_MS, RESOLVE_MAX_ATTEMPTS, OCR_REFRESH_MAX_ATTEMPTS } = require('./lib/analysis/trackingDeadlines.js');
const { newProgress, planDiscovery } = require('./lib/analysis/trackingProgress.js');
const { readCompatibleTracking, readTrackingStorageV1 } = require('./lib/analysis/trackingReader.js');
const { encodeTrackingStorage, decodeTrackingStorage, TRACKING_STORAGE_ENCODING } = require('./lib/analysis/trackingStorage.js');
const { processDiscoverTask } = require('./lib/analysis/trackingOrchestrator.js');
const { VIDEO_CONSENT_VERSION } = require('./lib/analysis/videoConsent.js');
const { parseTrackingReport, parseDiscoveryMoments, answerTarget } = require('./lib/analysis/trackingV3.js');
const { emptyFeedback } = require('./lib/analysis/trackingV3.js');
const { setEmulatorCvApproval } = require('./lib/analysis/cvConfig.js');
const { rateLimitDocId } = require('./lib/security/rateLimit.js');
const { OCR_FOLLOW_UP_ACTION } = require('./lib/analysis/trackingFollowUp.js');

const test = (name, fn) => nodeTest(name, { timeout: 60000 }, fn);

const T0 = Date.parse('2026-11-24T12:00:00Z');
const EXPIRED = T0 + TRACKING_ATTEMPT_LEASE_MS + 1;
const ENV = { FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
  CV_WORKER_URL: 'http://localhost:9', CV_WORKER_APPROVED: 'true', TRACKING_V3_ENABLED: 'true' };
const APPROVAL = { workerVersion: 'b26-emulator', models: { detector: 'synthetic' }, eventsApproved: false };
const fixture = JSON.parse(readFileSync(new URL('../fixtures/tracking50-img4809-auto.json', import.meta.url), 'utf8')).report;
let apps, clients, db, jobId, job, base, clock, effects;
const jobs = new Set();
const tokens = new Set();
const now = () => new Date(clock);
const options = (scope = 'full') => ({ scope, now, notify: async () => { effects.notifications += 1; return false; },
  enqueueFollowUp: async () => { effects.enqueue += 1; } });
const store = async () => { effects.images += 1; };
const snapshot = async (ref) => (await ref.get()).data();
const ticket = (token) => db.collection(RECONCILIATION_COLLECTION).doc(token);

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function reply() {
  const report = structuredClone(fixture);
  report.engine = { ...report.engine, ocrDeferred: 0 };
  report.analysedRange = { startSec: 0, endSec: 2035, parts: newProgress(1, 2035, '').plan.length };
  return { workerVersion: APPROVAL.workerVersion, models: APPROVAL.models, report, timeline: structuredClone(JSON.parse(readFileSync(new URL('../fixtures/tracking50-img4809-auto.json', import.meta.url), 'utf8')).timeline) };
}
async function claim(scope = 'full', client = db, attempt = scope === 'refresh' ? OCR_REFRESH_MAX_ATTEMPTS - 1 : RESOLVE_MAX_ATTEMPTS - 1) {
  const lease = await claimTrackingTask(client, jobId, 0, scope, scope === 'refresh' ? 1 : undefined, now, attempt);
  if (typeof lease !== 'string') tokens.add(lease.token);
  return lease;
}
async function owned(scope = 'full') {
  const lease = await claim(scope);
  assert.notEqual(typeof lease, 'string');
  return lease;
}

before(() => {
  apps = [initializeApp({ projectId: PROJECT_ID }), initializeApp({ projectId: PROJECT_ID }, `b26-${process.pid}-peer`)];
  clients = apps.map((app) => getFirestore(app));
  [db] = clients;
});
beforeEach(async () => {
  clock = T0;
  effects = { images: 0, notifications: 0, enqueue: 0 };
  setEmulatorCvApproval(APPROVAL);
  jobId = `b26_${randomUUID().replaceAll('-', '')}`;
  jobs.add(jobId);
  job = db.collection('matchAnalysisJobs').doc(jobId);
  base = job.collection('tracking');
  const progress = newProgress(1, 2035, now().toISOString());
  progress.resolving = 'full';
  const batch = db.batch();
  batch.set(job, { playerId: 'b26-emulator-owner', targeting: { jerseyNumber: '20' } });
  batch.set(base.doc('progress'), progress);
  batch.set(base.doc('feedback'), { ...emptyFeedback(), revision: 0 });
  batch.set(base.doc('current'), { version: 1, report: { retained: true }, stale: true, feedbackRevision: 0,
    followUp: { revision: 0, round: 1, status: 'scheduled', deferredBefore: 20, deferredAfter: null, updatedAt: now().toISOString() } });
  await batch.commit();
});
afterEach(async () => {
  setEmulatorCvApproval(null);
  // Remove only this suite's generated ticket namespaces; never clear the emulator database globally.
  const records = await db.collection(RECONCILIATION_COLLECTION).where('jobId', '==', jobId).get();
  for (const doc of records.docs) tokens.add(doc.id);
  await Promise.all(records.docs.map((doc) => doc.ref.delete()));
  await db.recursiveDelete(job);
});
after(async () => {
  // Cleanup remains bounded to exact test-created ids even after a failed assertion.
  if (!db) return;
  await Promise.all([...tokens].map((token) => ticket(token).delete()));
  for (const id of jobs) await db.recursiveDelete(db.collection('matchAnalysisJobs').doc(id));
  await Promise.all(apps.map(deleteApp));
});

test('atomic final claim, expiry boundary and duplicate reconcilers settle once', async () => {
  const lease = await owned();
  assert.equal((await snapshot(ticket(lease.token))).dueAtMs, T0 + TRACKING_ATTEMPT_LEASE_MS);
  assert.equal(await reconcileTrackingAttempt(db, lease.token, now()), 'waiting');
  const at = new Date(T0 + TRACKING_ATTEMPT_LEASE_MS);
  const results = await Promise.all(clients.map((client) => reconcileTrackingAttempt(client, lease.token, at)));
  assert.deepEqual(results.sort(), ['discarded', 'settled']);
  assert.equal((await snapshot(base.doc('progress'))).outcome, 'interrupted');
  assert.equal((await snapshot(base.doc('progress'))).resolving, null);
  assert.equal((await snapshot(base.doc('lease_full'))).token, null);
  assert.equal((await ticket(lease.token).get()).exists, false);
});

test('concurrent final claims create one owner and one matching durable ticket', async () => {
  const results = await Promise.all(clients.map((client) => claim('full', client)));
  const owners = results.filter((result) => typeof result !== 'string');
  assert.equal(owners.length, 1);
  assert.equal(results.filter((result) => result === 'busy').length, 1);
  const records = await db.collection(RECONCILIATION_COLLECTION).where('jobId', '==', jobId).get();
  assert.equal(records.size, 1);
  assert.equal(records.docs[0].id, owners[0].token);
  assert.equal((await snapshot(base.doc('lease_full'))).token, owners[0].token);
});

test('concurrent expired-lease takeovers select one replacement; old reconciliation/release cannot clear it', async () => {
  const old = await owned();
  clock = EXPIRED;
  const contenders = await Promise.all(clients.map((client) => claim('full', client)));
  const next = contenders.find((result) => typeof result !== 'string');
  assert.ok(next && next.token !== old.token);
  assert.equal(contenders.filter((result) => result === 'busy').length, 1);
  assert.equal(await reconcileTrackingAttempt(db, old.token, now()), 'discarded');
  await releaseTrackingTask(clients[1], old);
  assert.equal((await snapshot(base.doc('lease_full'))).token, next.token);
  assert.equal((await snapshot(base.doc('progress'))).outcome, null);
});

test('new lifecycle takeover races old-ticket reconciliation without interrupting replacement work', async () => {
  const old = await owned();
  clock = EXPIRED;
  await base.doc('progress').update({ generation: 2, startedAt: now().toISOString() });
  const [next, outcome] = await Promise.all([claim('full', clients[1]), reconcileTrackingAttempt(db, old.token, now())]);
  assert.notEqual(typeof next, 'string');
  assert.equal(outcome, 'discarded');
  assert.equal((await snapshot(base.doc('progress'))).outcome, null);
  assert.equal((await snapshot(base.doc('lease_full'))).token, next.token);
});

for (const scope of ['full', 'refresh']) {
  test(`late ${scope} worker reply cannot publish after takeover or reconcile the newer report`, async () => {
    const entered = deferred();
    const finish = deferred();
    const worker = async () => { entered.resolve(); return finish.promise; };
    const opts = { ...options(scope), attempt: scope === 'refresh' ? 1 : 2 };
    const first = scope === 'refresh'
      ? processOcrFollowUpTask(db, jobId, 0, 1, worker, ENV, store, opts)
      : runResolveTaskAttempt(db, jobId, 0, worker, ENV, store, opts);
    await entered.promise;
    const oldToken = (await snapshot(base.doc(`lease_${scope}`))).token;
    tokens.add(oldToken);
    clock = EXPIRED;
    const next = await claim(scope, clients[1]);
    assert.notEqual(typeof next, 'string');
    // Publish through the real parser, version transaction and lease fence with a synthetic worker response.
    const accepted = await processResolveTask(clients[1], jobId, 0, async () => reply(), ENV, store,
      { ...options(scope), lease: next, ...(scope === 'refresh' ? { followUpRound: 1 } : {}) });
    assert.equal(accepted, 'done');
    const current = await snapshot(base.doc('current'));
    const progress = await snapshot(base.doc('progress'));
    const effectsBefore = { ...effects };
    finish.resolve(reply());
    assert.equal(await first, 'stale');
    assert.deepEqual(await snapshot(base.doc('current')), current);
    assert.deepEqual(await snapshot(base.doc('progress')), progress);
    assert.deepEqual(effects, effectsBefore, 'stale reply must not store images, notify or enqueue');
    assert.equal((await snapshot(base.doc(`lease_${scope}`))).token, next.token);
    assert.equal(await reconcileTrackingAttempt(db, oldToken, now()), 'discarded');
    clock += TRACKING_ATTEMPT_LEASE_MS + 1;
    assert.equal(await reconcileTrackingAttempt(db, next.token, now()), 'discarded', 'published version survives expiry');
    assert.deepEqual(await snapshot(base.doc('current')), current);
  });
}

test('expired/reconciled owner cannot publish even without a replacement', async () => {
  const old = await owned();
  clock = EXPIRED;
  assert.equal(await reconcileTrackingAttempt(db, old.token, now()), 'settled');
  const current = await snapshot(base.doc('current'));
  assert.equal(await processResolveTask(db, jobId, 0, async () => reply(), ENV, store,
    { ...options(), lease: old }), 'stale');
  assert.deepEqual(await snapshot(base.doc('current')), current);
  assert.deepEqual(effects, { images: 0, notifications: 0, enqueue: 0 });
});

test('OCR expiry fails only its runnable round; quota and saved report are unchanged', async () => {
  const old = await owned('refresh');
  const quota = db.collection('callableRateLimits').doc(rateLimitDocId('b26-emulator-owner', OCR_FOLLOW_UP_ACTION, 'day', now()));
  await quota.set({ count: 7 });
  try {
    const before = await snapshot(base.doc('current'));
    clock = EXPIRED;
    assert.equal(await reconcileTrackingAttempt(db, old.token, now()), 'settled');
    const current = await snapshot(base.doc('current'));
    assert.equal(current.followUp.status, 'failed');
    assert.deepEqual(current.report, before.report);
    assert.equal(current.version, before.version);
    assert.equal((await snapshot(quota)).count, 7);
    assert.equal((await snapshot(base.doc('progress'))).outcome, null);
  } finally { await quota.delete(); }
});

for (const change of ['feedback', 'round', 'resume', 'cancelled', 'deleted']) {
  test(`real transactions discard expired OCR ticket after ${change}`, async () => {
    const old = await owned('refresh');
    if (change === 'feedback') await base.doc('feedback').update({ revision: 1 });
    if (change === 'round') await base.doc('current').update({ 'followUp.round': 2 });
    if (change === 'resume') await base.doc('progress').update({ startedAt: new Date(T0 + 1).toISOString() });
    if (change === 'cancelled') await job.update({ cancelRequested: true });
    if (change === 'deleted') await job.delete();
    const before = await snapshot(base.doc('current'));
    clock = EXPIRED;
    assert.equal(await reconcileTrackingAttempt(db, old.token, now()), 'discarded');
    assert.deepEqual(await snapshot(base.doc('current')), before);
    if (change === 'deleted') assert.equal((await job.get()).exists, false);
  });
}

test('due-query sweep settles expired tickets and leaves future tickets; collection is client-denied', async () => {
  const full = await owned();
  clock += 1000;
  const refresh = await owned('refresh');
  const at = new Date(T0 + TRACKING_ATTEMPT_LEASE_MS);
  assert.equal(await sweepTrackingAttempts(db, at), 1);
  assert.equal((await ticket(full.token).get()).exists, false);
  assert.equal((await ticket(refresh.token).get()).exists, true);
  const path = `${RECONCILIATION_COLLECTION}/${refresh.token}`;
  assert.equal(await getDocument('b26-emulator-owner', path), 403);
  assert.equal(await getDocument(null, path), 403);
  assert.equal(await setDocument('b26-emulator-owner', path, { token: 'forged' }), 403);
});


test('publication transaction fences takeover after preflight, while an image write was in flight', async () => {
  const old = await owned();
  const entered = deferred();
  const finish = deferred();
  const raw = reply();
  raw.report.referenceImageJpegBase64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64');
  const imageStore = async () => { effects.images += 1; entered.resolve(); await finish.promise; };
  const result = processResolveTask(db, jobId, 0, async () => raw, ENV, imageStore, { ...options(), lease: old });
  await entered.promise;
  try {
    clock = EXPIRED;
    const next = await claim('full', clients[1]);
    assert.notEqual(typeof next, 'string');
    const before = await snapshot(base.doc('current'));
    finish.resolve();
    assert.equal(await result, 'stale');
    assert.deepEqual(await snapshot(base.doc('current')), before);
    assert.equal((await snapshot(base.doc('lease_full'))).token, next.token);
    assert.deepEqual(effects, { images: 1, notifications: 0, enqueue: 0 }, 'an in-flight image callback may finish, but no publication side effects follow');
  } finally { finish.resolve(); await result; }
});


test('populated indicators and state strips publish and round-trip to server and app without loss', async () => {
  const raw = reply();
  const expected = parseTrackingReport(raw.report, raw.timeline);
  assert.ok(expected.stateStrip.length && expected.moments.some((m) => m.indicator.length));
  assert.equal(await runResolveTaskAttempt(db, jobId, 0, async () => raw, ENV, store,
    { ...options(), attempt: RESOLVE_MAX_ATTEMPTS - 1 }), 'done');
  const stored = await snapshot(base.doc('current'));
  assert.equal(stored.tupleEncoding, 'pitchproof.tracking.tuples.v1');
  assert.ok(!Array.isArray(stored.report.stateStrip[0]));
  assert.ok(!Array.isArray(stored.report.moments[0].indicator[0]));
  assert.deepEqual(decodeTrackingStorage(stored).report, expected);
  assert.deepEqual(appDecode(stored).report, expected);
  const token = (await snapshot(base.doc('lease_full'))).token;
  assert.equal(token, null);
  clock = EXPIRED;
  await sweepTrackingAttempts(db, now());
  assert.deepEqual(await snapshot(base.doc('current')), stored);
  assert.equal((await snapshot(base.doc('progress'))).outcome, null);
});


test('real discovery writer appends and re-encodes sightings without losing prior indicators', async () => {
  await job.update({ videoStoragePath: `profiles/b26-emulator-owner/matchFootage/${jobId}/source.mp4` });
  await base.doc('progress').update({ discovery: planDiscovery(2035) });
  const raw = (t) => ({ id: `d_${t}`, kind: 'sighting', evidence: 'number_read', identityState: 'CONFIRMED_VISIBLE',
    number: '20', readFrames: 2, start: t, clipStart: Math.max(0, t - 2), clipEnd: t + 2,
    indicator: [[t, 0.123456789, 0.2, 0.3, 0.4]] });
  const first = parseDiscoveryMoments([raw(1)], { startSec: 0, endSec: 600 }, 2035, '20')[0];
  const legacy = { moments: [{ ...first, indicator: [] }], generation: 1, updatedAt: now().toISOString() };
  await base.doc('discovery').set(legacy);
  assert.deepEqual(appDecode(await snapshot(base.doc('discovery'))), legacy);
  const expected = [...legacy.moments];
  for (const [index, t] of [[0, 10], [1, 620]]) {
    assert.equal(await processDiscoverTask(db, jobId, 1, index, 0,
      async () => ({ status: 'complete', moments: [raw(t)] }), async () => { effects.enqueue += 1; }, ENV,
      async () => 'https://synthetic.invalid/source', now, options().notify, store), 'done');
    expected.push(...parseDiscoveryMoments([raw(t)], { startSec: index * 600, endSec: (index + 1) * 600 }, 2035, '20'));
    const stored = await snapshot(base.doc('discovery'));
    assert.equal(stored.tupleEncoding, 'pitchproof.tracking.tuples.v1');
    assert.deepEqual(appDecode(stored).moments, expected);
    assert.deepEqual(decodeTrackingStorage(stored).moments, expected);
  }
});


test('identity-answer callable decodes a stored moment back into the original pixel point', async () => {
  const raw = reply();
  const parsed = parseTrackingReport(raw.report, raw.timeline);
  await base.doc('current').set(encodeTrackingStorage({ report: parsed, version: 4, stale: false, feedbackRevision: 0 }));
  const consent = db.collection('videoProcessingConsents').doc(jobId);
  await consent.set({ uid: 'b26-emulator-owner', revokedAt: null, policyVersion: VIDEO_CONSENT_VERSION });
  const flag = process.env.TRACKING_V3_ENABLED;
  delete process.env.TRACKING_V3_ENABLED; // Guarantee no Cloud Tasks enqueue while exercising the actual callable.
  try {
    const moment = parsed.moments.find((m) => m.indicator.length);
    const point = answerTarget(parsed, moment.id);
    assert.ok(point);
    const result = await answerTrackingQuestion.run({ auth: { uid: 'b26-emulator-owner', token: {} },
      data: { jobId, questionId: moment.id, answer: 'yes', operationId: 'storage-regression-answer' },
      rawRequest: { headers: {} }, acceptsStreaming: false });
    assert.equal(result.pending, 'worker_unavailable');
    const feedback = await snapshot(base.doc('feedback'));
    assert.deepEqual(feedback.entries[0].point, point.point);
    assert.equal(feedback.entries[0].t, point.t);
    assert.deepEqual(appDecode(await snapshot(base.doc('current'))).report, parsed);
  } finally {
    if (flag === undefined) delete process.env.TRACKING_V3_ENABLED;
    else process.env.TRACKING_V3_ENABLED = flag;
    await consent.delete();
  }
});


test('v1 readers must negotiate the callable protocol; direct owner/old-device and collection reads are denied', async () => {
  const raw = reply();
  const report = parseTrackingReport(raw.report, raw.timeline);
  await base.doc('current').set(encodeTrackingStorage({ report, version: 1 }));
  await base.doc('discovery').set(encodeTrackingStorage({ moments: report.moments, generation: 1 }));
  for (const id of ['current', 'discovery']) {
    const path = `matchAnalysisJobs/${jobId}/tracking/${id}`;
    assert.equal(await getDocument('b26-emulator-owner', path), 403, 'same owner on an old device gets no raw v1 data');
    assert.equal(await getDocument(null, path), 403);
    assert.equal(await getDocument('other-owner', path), 403);
    assert.equal(await setDocument('b26-emulator-owner', path, { report: {} }), 403);
  }
  const list = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/matchAnalysisJobs/${jobId}/tracking`,
    { headers: { Authorization: `Bearer ${tokenFor('b26-emulator-owner')}` } });
  assert.equal(list.status, 403, 'listing the tracking collection must not bypass the read API');
  const request = { jobId, readerEncoding: TRACKING_STORAGE_ENCODING };
  await assert.rejects(readCompatibleTracking(db, undefined, request), (error) => error.code === 'unauthenticated');
  await assert.rejects(readCompatibleTracking(db, 'other-owner', request), (error) => error.code === 'permission-denied');
  await assert.rejects(readCompatibleTracking(db, 'b26-emulator-owner', { jobId }), (error) => error.code === 'failed-precondition');
  const result = await readCompatibleTracking(db, 'b26-emulator-owner', request);
  assert.deepEqual(result.current.report, report);
  assert.deepEqual(result.discovery.moments, report.moments);
  const quota = db.collection('callableRateLimits').doc(rateLimitDocId('b26-emulator-owner', 'tracking_reader_v1', 'hour'));
  try {
    const call = { auth: { uid: 'b26-emulator-owner', token: {} }, data: request,
      rawRequest: { headers: {} }, acceptsStreaming: false };
    assert.deepEqual(await readTrackingStorageV1.run(call), result, 'actual callable uses the negotiated owner helper');
    await quota.set({ count: 1200 });
    await assert.rejects(readTrackingStorageV1.run(call), (error) => error.code === 'resource-exhausted');
  } finally { await quota.delete(); }
  // A successful opt-in does not authorize another same-uid session's legacy read path.
  assert.equal(await getDocument('b26-emulator-owner', `matchAnalysisJobs/${jobId}/tracking/current`), 403);
  assert.equal(await getDocument('b26-emulator-owner', `matchAnalysisJobs/${jobId}/tracking/progress`), 200);
  await base.doc('current').set({ report: null, version: 0 });
  assert.equal((await readCompatibleTracking(db, 'b26-emulator-owner', request)).current.report, null);
  assert.equal(await getDocument('b26-emulator-owner', `matchAnalysisJobs/${jobId}/tracking/current`), 403, 'no unmarked-data bypass');
  await base.doc('current').set({ tupleEncoding: 'future' });
  await assert.rejects(readCompatibleTracking(db, 'b26-emulator-owner', request), (error) => error.code === 'failed-precondition');
});
