import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setEmulatorCvApproval } from '../../functions/src/analysis/cvConfig.ts';
import { processOcrFollowUpTask, processResolveTask } from '../../functions/src/analysis/trackingCallables.ts';
import {
  OCR_FOLLOW_UP_DAILY_LIMIT, OCR_FOLLOW_UP_MAX_CROPS, OCR_FOLLOW_UP_MAX_ROUNDS, followUpRunnable, followUpTaskId, followUpVisible,
  planOcrFollowUp,
} from '../../functions/src/analysis/trackingFollowUp.ts';

type Firestore = Parameters<typeof processResolveTask>[0];

function fakeDb(seed: Record<string, Record<string, unknown>>) {
  const data = new Map<string, Record<string, unknown>>(Object.entries(seed));
  const docRef = (path: string) => ({ path, collection: (name: string) => collectionRef(`${path}/${name}`), get: async () => snap(path) });
  const collectionRef = (path: string) => ({ doc: (id: string) => docRef(`${path}/${id}`) });
  const snap = (path: string) => ({ exists: data.has(path), data: () => data.get(path), get: (k: string) => data.get(path)?.[k] });
  const db = {
    collection: collectionRef,
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn({
      get: async (ref: { path: string }) => snap(ref.path),
      set: (ref: { path: string }, value: Record<string, unknown>, opts?: { merge?: boolean }) => {
        data.set(ref.path, opts?.merge ? { ...(data.get(ref.path) ?? {}), ...value } : value);
      },
    }),
  };
  return { db: db as unknown as Firestore, data };
}

const env = { FUNCTIONS_EMULATOR: 'true', CV_WORKER_URL: 'http://localhost:9', CV_WORKER_APPROVED: 'true', TRACKING_V3_ENABLED: 'true' };
const approval = { workerVersion: 'football-cv/0.8.0', models: { detector: 'd' }, eventsApproved: false } as never;
const CUR = 'matchAnalysisJobs/job_1/tracking/current';

function workerReport(ocrDeferred: number) {
  return {
    schema: 'pitchproof.tracking.v3', engine: { version: '5.2.0', ocrDeferred }, target: { number: '20', kit: 'orange', kit2: '', position: 'winger' },
    timeline: { periods: [{ start: 0, end: 60, kind: 'play', label: 'play', source: 'detected' }] },
    coverage: { recordingSec: 60, nonMatchSec: 0, offPitchSec: 0, matchSec: 60, unobservedSec: 0, analysedSec: 60,
      confirmedVisibleSec: 10, likelyVisibleSec: 10, ambiguousSec: 10, notIdentifiedSec: 30 },
    identity: { statesSec: { CONFIRMED_VISIBLE: 10 }, numberSightings: 1, confirmedByUser: 0 },
    physical: { status: 'unavailable', productionVisible: false, reason: 'too little', values: {}, sprints: [], highSpeedRuns: [],
      thresholds: { sprint_kmh: 19.8, hsr_kmh: 14.4 } },
    ball: { contacts: 0, carries: 0, passAttempts: 0, completedPasses: 0, incompletePasses: 0, unknownOutcomePasses: 0 },
    events: [], reviewQuestions: [],
  };
}

function seed(revision: number, extra: Record<string, unknown> = {}) {
  return {
    'matchAnalysisJobs/job_1': { playerId: 'u1', targeting: { jerseyNumber: '20' }, ...extra },
    'matchAnalysisJobs/job_1/tracking/feedback': { entries: [], periods: {}, offPitch: [], revision },
    [CUR]: { report: null, version: 2, stale: true, feedbackRevision: revision },
  };
}

const at = '2026-10-28T20:00:00.000Z';

test('5.2 follow-up rules: one chain per revision, only while it makes progress, bounded rounds and quota', () => {
  assert.equal(planOcrFollowUp('feedback', 3, 0, null, at), null, 'nothing deferred, nothing scheduled');
  const r1 = planOcrFollowUp('feedback', 3, 900, null, at)!;
  assert.deepEqual([r1.round, r1.status, r1.deferredBefore], [1, 'scheduled', 900]);
  assert.equal(planOcrFollowUp('feedback', 3, 900, r1, at), r1, 'a repeated publish keeps the same round');
  const ran = { ...r1, status: 'running' as const };
  const r2 = planOcrFollowUp('refresh', 3, 500, ran, at, 1)!;
  assert.deepEqual([r2.round, r2.status, r2.deferredBefore], [2, 'scheduled', 500]);
  const stuck = planOcrFollowUp('refresh', 3, 500, { ...r2, status: 'running' }, at, 2)!;
  assert.deepEqual([stuck.round, stuck.status, stuck.deferredAfter], [2, 'done', 500], 'no progress -> stop, never loop');
  let f = { ...r1, status: 'running' as const };
  for (let round = 1; round < OCR_FOLLOW_UP_MAX_ROUNDS; round += 1) {
    f = { ...planOcrFollowUp('refresh', 3, 900 - 100 * round, f, at, round)!, status: 'running' as const };
  }
  assert.equal(planOcrFollowUp('refresh', 3, 1, f, at, OCR_FOLLOW_UP_MAX_ROUNDS)!.status, 'done', 'round cap');
  assert.equal(planOcrFollowUp('feedback', 4, 50, null, at, null, false)!.status, 'limited', 'quota exhausted: shown as not scheduled');
  assert.equal(followUpVisible({ status: 'limited' }), false);
  assert.equal(followUpVisible({ status: 'scheduled' }), true);
  assert.equal(followUpRunnable(r1, 3, 2), false);
  assert.equal(followUpTaskId('job_1', 3, 2), 'ocr-follow-up-job_1-r3-n2');
});

test('5.2 correction publishes immediately, then schedules exactly one de-duplicated follow-up', async () => {
  setEmulatorCvApproval(approval);
  const { db, data } = fakeDb(seed(3));
  const queued: string[] = [];
  const enqueue = async (_p: unknown, id: string) => { queued.push(id); };
  const client = async () => ({ workerVersion: 'football-cv/0.8.0', models: { detector: 'd' }, report: workerReport(120) });
  assert.equal(await processResolveTask(db, 'job_1', 3, client, env, async () => undefined, { enqueueFollowUp: enqueue }), 'done');
  const cur = data.get(CUR) as { version: number; report: { ocrDeferred: number }; followUp: { status: string; round: number } };
  assert.equal(cur.version, 3, 'the correction itself is published first');
  assert.equal(cur.report.ocrDeferred, 120);
  assert.deepEqual([cur.followUp.status, cur.followUp.round], ['scheduled', 1]);
  assert.deepEqual(queued, ['ocr-follow-up-job_1-r3-n1']);
  const quota = data.get([...data.keys()].find((k) => k.startsWith('callableRateLimits/u1_ocr_follow_up_'))!) as { count: number };
  assert.equal(quota.count, 1);
  // the same resolve delivered twice (task retry): same round, no second quota unit
  await processResolveTask(db, 'job_1', 3, client, env, async () => undefined, { enqueueFollowUp: enqueue });
  assert.equal((data.get([...data.keys()].find((k) => k.startsWith('callableRateLimits/'))!) as { count: number }).count, 1);
  assert.ok(queued.every((q) => q === 'ocr-follow-up-job_1-r3-n1'), 'only the deterministic id - Cloud Tasks drops the duplicate');
  setEmulatorCvApproval(null);
});

test('5.2 follow-up round reads bounded crops, publishes a newer version, and stops when stale or cancelled', async () => {
  setEmulatorCvApproval(approval);
  const { db, data } = fakeDb(seed(3));
  const queued: string[] = [];
  const enqueue = async (_p: unknown, id: string) => { queued.push(id); };
  let deferred = 120;
  const bodies: Array<Record<string, unknown>> = [];
  const client = async (body: Record<string, unknown>) => {
    bodies.push(body);
    return { workerVersion: 'football-cv/0.8.0', models: { detector: 'd' }, report: workerReport(deferred) };
  };
  await processResolveTask(db, 'job_1', 3, client, env, async () => undefined, { enqueueFollowUp: enqueue });
  deferred = 0;
  assert.equal(await processOcrFollowUpTask(db, 'job_1', 3, 1, client, env, async () => undefined, { enqueueFollowUp: enqueue }), 'done');
  assert.deepEqual(bodies[1].ocr, { mode: 'refresh', maxNewCrops: OCR_FOLLOW_UP_MAX_CROPS });
  const cur = data.get(CUR) as { version: number; followUp: { status: string; deferredAfter: number } };
  assert.equal(cur.version, 4, 'newer report version');
  assert.deepEqual([cur.followUp.status, cur.followUp.deferredAfter], ['done', 0]);
  assert.equal(await processOcrFollowUpTask(db, 'job_1', 3, 1, client, env), 'stale', 'a duplicate task does nothing');
  assert.equal(bodies.length, 2);
  // a newer answer arrives: the queued round is stale
  const s2 = fakeDb(seed(3));
  deferred = 80;
  await processResolveTask(s2.db, 'job_1', 3, client, env, async () => undefined, { enqueueFollowUp: enqueue });
  (s2.data.get('matchAnalysisJobs/job_1/tracking/feedback') as { revision: number }).revision = 4;
  assert.equal(await processOcrFollowUpTask(s2.db, 'job_1', 3, 1, client, env), 'superseded');
  assert.equal((s2.data.get(CUR) as { followUp: { status: string } }).followUp.status, 'stale');
  // cancelled analysis
  const s3 = fakeDb(seed(3));
  await processResolveTask(s3.db, 'job_1', 3, client, env, async () => undefined, { enqueueFollowUp: enqueue });
  (s3.data.get('matchAnalysisJobs/job_1') as { cancelRequested?: boolean }).cancelRequested = true;
  assert.equal(await processOcrFollowUpTask(s3.db, 'job_1', 3, 1, client, env), 'unavailable');
  assert.equal((s3.data.get(CUR) as { followUp: { status: string } }).followUp.status, 'cancelled');
  setEmulatorCvApproval(null);
});

test('5.2 per-user quota: past the daily limit a follow-up is recorded as limited, not scheduled', async () => {
  setEmulatorCvApproval(approval);
  const day = new Date().toISOString().slice(0, 10);
  const { db, data } = fakeDb({ ...seed(3), [`callableRateLimits/u1_ocr_follow_up_${day}`]: { count: OCR_FOLLOW_UP_DAILY_LIMIT } });
  const queued: string[] = [];
  const client = async () => ({ workerVersion: 'football-cv/0.8.0', models: { detector: 'd' }, report: workerReport(50) });
  await processResolveTask(db, 'job_1', 3, client, env, async () => undefined, { enqueueFollowUp: async (_p, id) => { queued.push(id); } });
  assert.equal((data.get(CUR) as { followUp: { status: string } }).followUp.status, 'limited');
  assert.deepEqual(queued, []);
  setEmulatorCvApproval(null);
});

test('5.2 app shows "checking more moments" only while a follow-up is really queued or running', async () => {
  const { checkingMoreMoments } = await import('../../src/features/match-analysis/services/trackingPresentation.ts');
  assert.equal(checkingMoreMoments({ stale: false, followUp: { status: 'scheduled', round: 1 } }), true);
  assert.equal(checkingMoreMoments({ stale: false, followUp: { status: 'running', round: 2 } }), true);
  for (const status of ['done', 'stale', 'cancelled', 'limited', 'failed'] as const) {
    assert.equal(checkingMoreMoments({ stale: false, followUp: { status, round: 1 } }), false, status);
  }
  assert.equal(checkingMoreMoments({ stale: true, followUp: { status: 'scheduled', round: 1 } }), false, 'the correction itself shows first');
  assert.equal(checkingMoreMoments({ stale: false, followUp: null }), false);
});
