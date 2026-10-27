import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setEmulatorCvApproval } from '../../functions/src/analysis/cvConfig.ts';
import { processResolveTask } from '../../functions/src/analysis/trackingCallables.ts';
import { processExtractTask, startAnalysis, type Enqueue } from '../../functions/src/analysis/trackingOrchestrator.ts';
import {
  measuredThroughput, newProgress, notificationId, planSegments, remainingExtractionSec, reviewNeeded,
  shouldReplaceReport, shouldResolvePreliminary, type TrackingProgress,
} from '../../functions/src/analysis/trackingProgress.ts';
import { decidePush, defaultStoredPreferences, pushPathFor } from '../../functions/src/notificationPolicy.ts';

type Firestore = Parameters<typeof processResolveTask>[0];

function deepMerge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const prev = out[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && prev && typeof prev === 'object' && !Array.isArray(prev)
      ? deepMerge(prev as Record<string, unknown>, v as Record<string, unknown>) : v;
  }
  return out;
}

/** In-memory Firestore with Firestore's deep-merge semantics for set(..., { merge: true }). */
function fakeDb(seed: Record<string, Record<string, unknown>>) {
  const data = new Map<string, Record<string, unknown>>(Object.entries(structuredClone(seed)));
  const write = (path: string, value: Record<string, unknown>, opts?: { merge?: boolean }) => {
    data.set(path, opts?.merge ? deepMerge(data.get(path) ?? {}, structuredClone(value)) : structuredClone(value));
  };
  const snap = (path: string) => ({ exists: data.has(path), data: () => structuredClone(data.get(path)),
    get: (k: string) => data.get(path)?.[k] });
  const docRef = (path: string) => ({
    path,
    collection: (name: string) => collectionRef(`${path}/${name}`),
    get: async () => snap(path),
    set: async (value: Record<string, unknown>, opts?: { merge?: boolean }) => write(path, value, opts),
  });
  const collectionRef = (path: string) => ({ doc: (id: string) => docRef(`${path}/${id}`) });
  const db = {
    collection: collectionRef,
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn({
      get: async (ref: { path: string }) => snap(ref.path),
      set: (ref: { path: string }, value: Record<string, unknown>, opts?: { merge?: boolean }) => write(ref.path, value, opts),
    }),
  };
  return { db: db as unknown as Firestore, data };
}

const env = { FUNCTIONS_EMULATOR: 'true', CV_WORKER_URL: 'http://localhost:9', CV_WORKER_APPROVED: 'true', TRACKING_V3_ENABLED: 'true' };
const approval = { workerVersion: 'football-cv/0.7.0', models: { detector: 'd' }, eventsApproved: false } as never;
const PROGRESS = 'matchAnalysisJobs/job_1/tracking/progress';
const T0 = Date.parse('2026-10-27T10:00:00Z');

function seed(extra: Record<string, Record<string, unknown>> = {}, consent = true) {
  return {
    'matchAnalysisJobs/job_1': { playerId: 'u1', targeting: { jerseyNumber: '20', kitPrimaryColor: 'orange' },
      videoStoragePath: 'profiles/u1/matchFootage/job_1/source.mp4', measuredDurationSec: 1020, durationSec: 1020 },
    ...(consent ? { 'videoProcessingConsents/job_1': { uid: 'u1', revokedAt: null, policyVersion: CONSENT_VERSION } } : {}),
    ...extra,
  };
}
// Resolved lazily so the test follows the real constant.
let CONSENT_VERSION = '';

function recorder() {
  const queued: Array<[string, Record<string, unknown>]> = [];
  const enqueue: Enqueue = async (q, p) => { queued.push([q, p]); };
  const notes: Array<[string, Record<string, unknown>]> = [];
  const seen = new Set<string>();
  const notify = async (id: string, input: Record<string, unknown>) => {
    if (seen.has(id)) return false;
    seen.add(id);
    notes.push([id, input]);
    return true;
  };
  return { queued, enqueue, notes, notify };
}

test('segments: short first segment, contiguous, within worker limits, for 90 and 140 minute recordings', () => {
  for (const duration of [5400, 8400, 1020, 125]) {
    const plan = planSegments(duration);
    assert.equal(plan[0].startSec, 0);
    assert.equal(plan[plan.length - 1].endSec, duration);
    for (let i = 1; i < plan.length; i += 1) assert.equal(plan[i].startSec, plan[i - 1].endSec);
    assert.ok(plan.every((s) => s.endSec - s.startSec <= 900 && s.endSec > s.startSec));
    assert.ok(plan.length <= 61);
  }
  assert.equal(planSegments(5400)[0].endSec, 120, 'first results come from a short first segment');
  assert.equal(planSegments(5400).length, 19);
  assert.equal(planSegments(125).length, 1, 'a 5 s remainder is folded into the previous segment');
  assert.deepEqual(planSegments(0), []);
  assert.ok(planSegments(30000).length <= 61, 'very long recordings grow the segment size instead of exceeding the limit');
});

test('progress decisions: preliminary cadence, version guard, review need', () => {
  assert.equal(shouldResolvePreliminary(1, 10, null), true);
  assert.equal(shouldResolvePreliminary(2, 10, 0), true, 'warm-up only so far: try again');
  assert.equal(shouldResolvePreliminary(2, 10, 5), false);
  assert.equal(shouldResolvePreliminary(6, 19, 5), true);
  assert.equal(shouldResolvePreliminary(10, 10, null), false, 'the last segment triggers the full report instead');
  assert.equal(shouldReplaceReport(null, { parts: 1, scope: 'preliminary' }), true);
  assert.equal(shouldReplaceReport({ parts: 12, scope: 'full' }, { parts: 3, scope: 'preliminary' }), false);
  assert.equal(shouldReplaceReport({ parts: 12, scope: 'full' }, { parts: 12, scope: 'preliminary' }), false);
  assert.equal(shouldReplaceReport({ parts: 3, scope: 'preliminary' }, { parts: 6, scope: 'preliminary' }), true);
  assert.equal(shouldReplaceReport({ parts: 12, scope: 'full' }, { parts: 12, scope: 'full' }), true, 'feedback re-resolve');
  const cov = { confirmedVisibleSec: 10, analysedSec: 100 };
  assert.equal(reviewNeeded({ reviewQuestions: [{}], coverage: cov }), true);
  assert.equal(reviewNeeded({ reviewQuestions: [], coverage: cov }), false);
  assert.equal(reviewNeeded({ reviewQuestions: [{}], coverage: { confirmedVisibleSec: 90, analysedSec: 100 } }), false);
});

test('throughput and remaining time come only from measured segments of this run', () => {
  const p = newProgress(1, 1020, new Date(T0).toISOString());
  assert.equal(measuredThroughput(p, T0 + 1000), null);
  assert.equal(remainingExtractionSec(p, T0 + 1000), null, 'no estimate before anything was measured');
  p.segments['0'] = { status: 'done', attempts: 1, processingSec: 300, doneAt: new Date(T0 + 240_000).toISOString() };
  const tp = measuredThroughput(p, T0 + 300_000);
  assert.ok(tp);
  assert.equal(tp.videoSecDone, 120);
  assert.equal(tp.wallPerVideoSec, 2);
  assert.equal(remainingExtractionSec(p, T0 + 300_000), 1800, '900 s of video left at the measured 2 s per second');
  // Segments finished before a resume are not counted in the new run's speed.
  p.startedAt = new Date(T0 + 400_000).toISOString();
  assert.equal(measuredThroughput(p, T0 + 500_000), null);
});

test('start: consent, source and worker gates block honestly; a start is idempotent', async () => {
  CONSENT_VERSION = (await import('../../functions/src/analysis/videoConsent.ts')).VIDEO_CONSENT_VERSION;
  setEmulatorCvApproval(approval);
  const now = new Date(T0);
  const r1 = recorder();
  const noConsent = fakeDb(seed({}, false));
  const blocked = await startAnalysis(noConsent.db, 'u1', 'job_1', r1.enqueue, env, now, r1.notify);
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.blocked, 'consent_required');
  assert.equal(r1.queued.length, 0);
  const off = await startAnalysis(fakeDb(seed()).db, 'u1', 'job_1', r1.enqueue, { ...env, TRACKING_V3_ENABLED: '' }, now, r1.notify);
  assert.equal(off.blocked, 'worker_unavailable');
  await assert.rejects(startAnalysis(fakeDb(seed()).db, 'intruder', 'job_1', r1.enqueue, env, now, r1.notify), /owner/);

  const { db, data } = fakeDb(seed());
  const r = recorder();
  const started = await startAnalysis(db, 'u1', 'job_1', r.enqueue, env, now, r.notify);
  assert.equal(started.status, 'started');
  assert.equal(r.queued.length, started.segments);
  assert.ok(r.queued.every(([q]) => q === 'extractTrackingSegmentTask'));
  assert.equal(r.notes[0][0], notificationId('started', 'job_1', 1));
  const again = await startAnalysis(db, 'u1', 'job_1', r.enqueue, env, now, r.notify);
  assert.equal(again.status, 'running');
  assert.equal(r.queued.length, started.segments, 'no duplicate work');
  const progress = data.get(PROGRESS) as TrackingProgress;
  assert.equal(progress.plan.length, started.segments);
  setEmulatorCvApproval(null);
});

test('extract: records measured time, publishes early, then full; failures retry then interrupt once', async () => {
  setEmulatorCvApproval(approval);
  const { db, data } = fakeDb(seed());
  const r = recorder();
  await startAnalysis(db, 'u1', 'job_1', r.enqueue, env, new Date(T0), r.notify);
  r.queued.length = 0;
  const total = (data.get(PROGRESS) as TrackingProgress).plan.length;
  const sent: Array<Record<string, unknown>> = [];
  const ok = async (body: Record<string, unknown>) => { sent.push(body); return { status: 'complete', processingSec: 50 }; };
  const src = async () => 'https://signed.example/source';
  let clock = T0;
  const now = () => new Date((clock += 60_000));
  assert.equal(await processExtractTask(db, 'job_1', 1, 0, 0, ok, r.enqueue, env, src, now, r.notify), 'done');
  assert.deepEqual(sent[0].privacy, { retainNonTargetIdentities: false, faceRecognition: false, persistMedia: false });
  assert.equal((sent[0].source as { url: string }).url, 'https://signed.example/source');
  assert.deepEqual(r.queued.at(-1), ['resolveTrackingTask', { jobId: 'job_1', feedbackRevision: 0, scope: 'preliminary' }]);
  let p = data.get(PROGRESS) as TrackingProgress;
  assert.equal(p.segments['0'].status, 'done');
  assert.equal(p.segments['0'].processingSec, 50);
  assert.equal(p.resolving, 'preliminary');
  // While a preliminary resolve is pending, finishing more segments does not queue another one.
  assert.equal(await processExtractTask(db, 'job_1', 1, 1, 0, ok, r.enqueue, env, src, now, r.notify), 'done');
  assert.equal(r.queued.filter(([q]) => q === 'resolveTrackingTask').length, 1);
  // Re-delivery of a finished segment is a no-op.
  assert.equal(await processExtractTask(db, 'job_1', 1, 1, 1, ok, r.enqueue, env, src, now, r.notify), 'stale');
  // Stale generation is ignored.
  assert.equal(await processExtractTask(db, 'job_1', 7, 2, 0, ok, r.enqueue, env, src, now, r.notify), 'stale');
  // Failure: retry, then interrupt with one notification.
  const bad = async () => null;
  assert.equal(await processExtractTask(db, 'job_1', 1, 2, 0, bad, r.enqueue, env, src, now, r.notify), 'retry');
  assert.equal((data.get(PROGRESS) as TrackingProgress).segments['2'].status, 'queued');
  assert.equal(await processExtractTask(db, 'job_1', 1, 2, 2, bad, r.enqueue, env, src, now, r.notify), 'failed');
  p = data.get(PROGRESS) as TrackingProgress;
  assert.equal(p.outcome, 'interrupted');
  assert.equal(r.notes.filter(([id]) => id === notificationId('interrupted', 'job_1', 1)).length, 1);
  // Resume: only unfinished segments are queued again; finished ones are never processed twice.
  r.queued.length = 0;
  const resumed = await startAnalysis(db, 'u1', 'job_1', r.enqueue, env, new Date(clock), r.notify);
  assert.equal(resumed.status, 'started');
  assert.equal(r.queued.length, total - 2);
  assert.ok(r.queued.every(([, payload]) => payload.index !== 0 && payload.index !== 1));
  // Finish everything: the last segment triggers the full report.
  (data.get(PROGRESS) as TrackingProgress).resolving = null;
  data.set(PROGRESS, { ...(data.get(PROGRESS) as Record<string, unknown>), resolving: null });
  for (const [, payload] of [...r.queued]) {
    await processExtractTask(db, 'job_1', 1, payload.index as number, 0, ok, r.enqueue, env, src, now, r.notify);
  }
  assert.deepEqual(r.queued.at(-1), ['resolveTrackingTask', { jobId: 'job_1', feedbackRevision: 0, scope: 'full' }]);
  setEmulatorCvApproval(null);
});

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');

function workerReport(parts: number, moments = true) {
  return {
    schema: 'pitchproof.tracking.v3', engine: { version: '3.3.0' }, target: { number: '20', kit: 'orange', kit2: '', position: 'winger' },
    timeline: { periods: [{ start: 0, end: 600, kind: 'play', label: 'play', source: 'detected' }] },
    coverage: { recordingSec: 600, nonMatchSec: 0, offPitchSec: 0, matchSec: 600, unobservedSec: 0, analysedSec: 600,
      confirmedVisibleSec: 30, likelyVisibleSec: 100, ambiguousSec: 200, notIdentifiedSec: 270 },
    identity: { statesSec: { CONFIRMED_VISIBLE: 30 }, numberSightings: 1, confirmedByUser: 0 },
    physical: { status: 'unavailable', productionVisible: false, reason: 'no calibration', values: {}, sprints: [], highSpeedRuns: [],
      thresholds: { sprint_kmh: 19.8, hsr_kmh: 14.4 } },
    ball: { contacts: 1, carries: 0, passAttempts: 0, completedPasses: 0, incompletePasses: 0, unknownOutcomePasses: 0 },
    events: [{ type: 'contact', start: 40, end: 40.5, identityState: 'CONFIRMED_VISIBLE', evidenceTimes: [40], confidence: 0.6 }],
    moments: moments ? [
      { id: 'm_360', kind: 'contact', kinds: ['contact'], start: 40, end: 40.5, clipStart: 36, clipEnd: 43.5,
        identityState: 'CONFIRMED_VISIBLE', candidate: false, indicator: [[40, 0.1, 0.2, 0.05, 0.1]], imageJpegBase64: JPEG },
      { id: 'm_900', kind: 'duel_candidate', kinds: ['duel_candidate'], start: 94, end: 95, clipStart: 90, clipEnd: 98,
        identityState: 'LIKELY_VISIBLE', candidate: true, indicator: [], imageJpegBase64: null },
    ] : [],
    analysedRange: { startSec: 0, endSec: parts * 100, parts },
    reviewQuestions: [{ t: 12.3, box: [1, 2, 30, 90], affectedSec: 20, currentlyTarget: false, score: 0.5 }],
  };
}

test('resolve: preliminary then full, never overwritten by a smaller report, notifications once each', async () => {
  setEmulatorCvApproval(approval);
  const progress = newProgress(1, 600, new Date(T0).toISOString());
  const { db, data } = fakeDb(seed({ [PROGRESS]: progress as unknown as Record<string, unknown> }));
  const r = recorder();
  const stored: string[] = [];
  const store = async (path: string) => { stored.push(path); };
  const worker = (parts: number) => async () => ({ workerVersion: 'football-cv/0.7.0', models: { detector: 'd' }, report: workerReport(parts) });
  const total = progress.plan.length;
  assert.equal(await processResolveTask(db, 'job_1', 0, worker(1), env, store, { scope: 'preliminary', notify: r.notify }), 'done');
  let cur = data.get('matchAnalysisJobs/job_1/tracking/current') as { scope: string; parts: number; report: { moments: Array<{ imagePath: string | null; candidate: boolean }> } };
  assert.equal(cur.scope, 'preliminary');
  assert.match(String(cur.report.moments[0].imagePath), /^profiles\/u1\/matchFootage\/job_1\/tracking\/m_360_p1_r0\.jpg$/);
  assert.equal(cur.report.moments[1].imagePath, null);
  assert.equal(cur.report.moments[1].candidate, true);
  let p = data.get(PROGRESS) as TrackingProgress;
  assert.equal(p.preliminary?.moments, 2);
  const ids = r.notes.map(([id]) => id);
  assert.ok(ids.includes(notificationId('first_moments', 'job_1', 1)));
  assert.ok(ids.includes(notificationId('review_needed', 'job_1', 1)));
  assert.ok(!ids.includes(notificationId('ready', 'job_1', 1)));

  assert.equal(await processResolveTask(db, 'job_1', 0, worker(total), env, store, { scope: 'full', notify: r.notify }), 'done');
  cur = data.get('matchAnalysisJobs/job_1/tracking/current') as typeof cur;
  assert.equal(cur.scope, 'full');
  p = data.get(PROGRESS) as TrackingProgress;
  assert.ok(p.full);
  // A late preliminary resolve finishing after the full report is discarded.
  assert.equal(await processResolveTask(db, 'job_1', 0, worker(1), env, store, { scope: 'preliminary', notify: r.notify }), 'stale');
  assert.equal((data.get('matchAnalysisJobs/job_1/tracking/current') as typeof cur).parts, total);
  const counts = new Map<string, number>();
  for (const [id] of r.notes) counts.set(id, (counts.get(id) ?? 0) + 1);
  assert.ok([...counts.values()].every((n) => n === 1), 'each notification at most once');
  assert.ok(counts.has(notificationId('ready', 'job_1', 1)));
  assert.ok(stored.every((s) => s.startsWith('profiles/u1/')), 'images are owner-scoped');
  setEmulatorCvApproval(null);
});

test('tracking notifications use the analysis category, respect preferences and deep-link to the right section', () => {
  const prefs = defaultStoredPreferences();
  for (const type of ['analysis_first_moments', 'analysis_review_needed', 'analysis_interrupted', 'analysis_completed']) {
    assert.deepEqual(decidePush(type, prefs, [], T0), { send: true, category: 'analysis' });
    assert.equal(decidePush(type, { ...prefs, categories: { ...prefs.categories, analysis: false } }, [], T0).send, false);
  }
  assert.equal(decidePush('analysis_started', prefs, [], T0).send, false, 'start is in-app only');
  const ref = { entityType: 'match_analysis', entityId: 'job_1' };
  assert.equal(pushPathFor('analysis_first_moments', ref, 'player'), 'match/job_1/moments');
  assert.equal(pushPathFor('analysis_review_needed', ref, 'player'), 'match/job_1/review');
  assert.equal(pushPathFor('analysis_interrupted', ref, 'player'), 'match/job_1');
});

test('an orchestrated resolve that does not publish frees the slot; a failed full report interrupts', async () => {
  const { settleOrchestratedResolve } = await import('../../functions/src/analysis/trackingCallables.ts');
  const progress = { ...newProgress(1, 600, new Date(T0).toISOString()), resolving: 'preliminary' };
  const { db, data } = fakeDb(seed({ [PROGRESS]: progress as unknown as Record<string, unknown> }));
  await settleOrchestratedResolve(db, 'job_1', 'preliminary', 'stale');
  assert.equal((data.get(PROGRESS) as TrackingProgress).resolving, null);
  assert.equal((data.get(PROGRESS) as TrackingProgress).outcome, null);
  await settleOrchestratedResolve(db, 'job_1', 'full', 'rejected');
  assert.equal((data.get(PROGRESS) as TrackingProgress).outcome, 'interrupted');
});

test('progress metrics come from persisted facts only', async () => {
  const { progressMetrics } = await import('../../functions/src/analysis/trackingProgress.ts');
  const p = newProgress(1, 600, new Date(T0).toISOString());
  assert.deepEqual(progressMetrics(p), { timeToFirstReportSec: null, timeToFullReportSec: null, workerSecPerVideoSec: null,
    segmentRetries: 0, segmentFailures: 0, firstReportHadMoments: null });
  p.segments['0'] = { status: 'done', attempts: 2, processingSec: 240, doneAt: new Date(T0 + 300_000).toISOString() };
  p.preliminary = { scope: 'preliminary', parts: 1, analysedEndSec: 120, moments: 0, reviewQuestions: 2, at: new Date(T0 + 360_000).toISOString() };
  const m = progressMetrics(p);
  assert.equal(m.timeToFirstReportSec, 360);
  assert.equal(m.workerSecPerVideoSec, 2);
  assert.equal(m.segmentRetries, 1);
  assert.equal(m.firstReportHadMoments, false);
});
