import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setEmulatorCvApproval } from '../../functions/src/analysis/cvConfig.ts';
import { processResolveTask } from '../../functions/src/analysis/trackingCallables.ts';

type Firestore = Parameters<typeof processResolveTask>[0];

/** Minimal in-memory Firestore: enough for get/set/merge/runTransaction on fixed paths. */
function fakeDb(seed: Record<string, Record<string, unknown>>) {
  const data = new Map<string, Record<string, unknown>>(Object.entries(seed));
  const docRef = (path: string) => ({
    path,
    collection: (name: string) => collectionRef(`${path}/${name}`),
    get: async () => snap(path),
  });
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

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');
const env = { FUNCTIONS_EMULATOR: 'true', CV_WORKER_URL: 'http://localhost:9', CV_WORKER_APPROVED: 'true', TRACKING_V3_ENABLED: 'true' };
const approval = { workerVersion: 'football-cv/0.7.0', models: { detector: 'd' }, eventsApproved: false } as never;

function workerReport() {
  return {
    schema: 'pitchproof.tracking.v3', engine: { version: '3.0.0' }, target: { number: '20', kit: 'orange', kit2: '', position: 'winger' },
    timeline: { periods: [{ start: 0, end: 60, kind: 'play', label: 'play', source: 'detected' }] },
    coverage: { recordingSec: 60, nonMatchSec: 0, offPitchSec: 0, matchSec: 60, unobservedSec: 0, analysedSec: 60,
      confirmedVisibleSec: 10, likelyVisibleSec: 10, ambiguousSec: 10, notIdentifiedSec: 30 },
    identity: { statesSec: { CONFIRMED_VISIBLE: 10 }, numberSightings: 1, confirmedByUser: 0 },
    physical: { status: 'unavailable', productionVisible: false, reason: 'too little', values: {}, sprints: [], highSpeedRuns: [],
      thresholds: { sprint_kmh: 19.8, hsr_kmh: 14.4 } },
    ball: { contacts: 0, carries: 0, passAttempts: 0, completedPasses: 0, incompletePasses: 0, unknownOutcomePasses: 0 },
    events: [],
    reviewQuestions: [{ t: 12.3, box: [1, 2, 30, 90], affectedSec: 20, currentlyTarget: false, score: 0.5, imageJpegBase64: JPEG },
      { t: 30, box: [5, 5, 40, 120], affectedSec: 9, currentlyTarget: true, score: 0.6, imageJpegBase64: 'bm90IGEganBlZw==' }],
    referenceImageJpegBase64: JPEG,
  };
}

function seed(revision: number) {
  return {
    'matchAnalysisJobs/job_1': { playerId: 'u1', targeting: { jerseyNumber: '20' } },
    'matchAnalysisJobs/job_1/tracking/feedback': { entries: [], periods: {}, offPitch: [], revision },
    'matchAnalysisJobs/job_1/tracking/current': { report: null, version: 2, stale: true, feedbackRevision: revision },
  };
}

test('re-resolve writes a validated target-only report with owner-only review images', async () => {
  setEmulatorCvApproval(approval);
  const { db, data } = fakeDb(seed(3));
  const stored: string[] = [];
  let sent: Record<string, unknown> = {};
  const client = async (body: Record<string, unknown>) => {
    sent = body;
    return { workerVersion: 'football-cv/0.7.0', models: { detector: 'd' }, report: workerReport(),
      timeline: { times: [0, 0.5, 1], states: ['UNKNOWN', 'UNKNOWN', 'CONFIRMED_VISIBLE'] } };
  };
  const outcome = await processResolveTask(db, 'job_1', 3, client, env, async (path) => { stored.push(path); });
  assert.equal(outcome, 'done');
  assert.deepEqual((sent.privacy as Record<string, boolean>), { retainNonTargetIdentities: false, faceRecognition: false, persistMedia: false });
  const cur = data.get('matchAnalysisJobs/job_1/tracking/current') as { report: Record<string, unknown>; version: number; stale: boolean };
  assert.equal(cur.stale, false);
  assert.equal(cur.version, 3);
  const qs = cur.report.reviewQuestions as Array<{ imagePath: string | null }>;
  assert.match(String(qs[0].imagePath), /^profiles\/u1\/matchFootage\/job_1\/tracking\/q_123_1_r3\.jpg$/);
  assert.equal(qs[1].imagePath, null, 'non-JPEG payload is ignored');
  assert.equal(cur.report.referenceImagePath, 'profiles/u1/matchFootage/job_1/tracking/reference.jpg');
  assert.equal(stored.length, 2);
  assert.ok(!JSON.stringify(cur.report).includes('imageJpegBase64'));
  setEmulatorCvApproval(null);
});

test('re-resolve is gated, superseded by newer feedback and rejects unapproved workers', async () => {
  const report = async () => ({ workerVersion: 'football-cv/0.7.0', models: { detector: 'd' }, report: workerReport() });
  setEmulatorCvApproval(approval);
  assert.equal(await processResolveTask(fakeDb(seed(3)).db, 'job_1', 3, report, { ...env, TRACKING_V3_ENABLED: '' }), 'unavailable');
  assert.equal(await processResolveTask(fakeDb(seed(4)).db, 'job_1', 3, report, env), 'superseded');
  const rogue = async () => ({ workerVersion: 'other', models: { detector: 'd' }, report: workerReport() });
  assert.equal(await processResolveTask(fakeDb(seed(3)).db, 'job_1', 3, rogue, env, async () => undefined), 'rejected');
  const broken = async () => ({ workerVersion: 'football-cv/0.7.0', models: { detector: 'd' },
    report: { ...workerReport(), coverage: { ...workerReport().coverage, ambiguousSec: 99 } } });
  assert.equal(await processResolveTask(fakeDb(seed(3)).db, 'job_1', 3, broken, env, async () => undefined), 'rejected');
  setEmulatorCvApproval(null);
  assert.equal(await processResolveTask(fakeDb(seed(3)).db, 'job_1', 3, report, env), 'unavailable', 'no approval record');
});
