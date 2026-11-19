import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setEmulatorCvApproval } from '../../functions/src/analysis/cvConfig.ts';
import { decidePilot, parsePilotConfig, releaseHeldReport, withholdPublishedReport } from '../../functions/src/analysis/pilotGate.ts';
import { processResolveTask } from '../../functions/src/analysis/trackingCallables.ts';
import { processExtractTask, startAnalysis, type Enqueue } from '../../functions/src/analysis/trackingOrchestrator.ts';
import { VIDEO_CONSENT_VERSION } from '../../functions/src/analysis/videoConsent.ts';

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

// TRACKING_PILOT_GATE=off: emulator-only seam; the pilot gate itself is covered by trackingPilotGate.test.ts.
const env = { FUNCTIONS_EMULATOR: 'true', CV_WORKER_URL: 'http://localhost:9', CV_WORKER_APPROVED: 'true', TRACKING_V3_ENABLED: 'true', TRACKING_PILOT_GATE: 'off' };
const approval = { workerVersion: 'football-cv/0.7.0', models: { detector: 'd' }, eventsApproved: false } as never;
const PROGRESS = 'matchAnalysisJobs/job_1/tracking/progress';
const T0 = Date.parse('2026-10-27T10:00:00Z');

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');
// No TRACKING_PILOT_GATE seam here: these tests exercise the real gate.
const env = { FUNCTIONS_EMULATOR: 'true', CV_WORKER_URL: 'http://localhost:9', CV_WORKER_APPROVED: 'true', TRACKING_V3_ENABLED: 'true' };
const approval = { workerVersion: 'football-cv/0.7.0', models: { detector: 'd' }, eventsApproved: false } as never;
const PILOT = 'opsConfig/trackingPilot';
const pilot = (over: Record<string, unknown> = {}) => ({ enabled: true, allowlist: ['u1'], workerVersion: 'football-cv/0.7.0', ...over });

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


function seed(extra: Record<string, Record<string, unknown>> = {}) {
  return {
    'matchAnalysisJobs/job_1': { playerId: 'u1', targeting: { jerseyNumber: '20', kitPrimaryColor: 'orange' },
      videoStoragePath: 'profiles/u1/matchFootage/job_1/source.mp4', measuredDurationSec: 1020, durationSec: 1020 },
    'videoProcessingConsents/job_1': { uid: 'u1', revokedAt: null, policyVersion: VIDEO_CONSENT_VERSION },
    'matchAnalysisJobs/job_1/tracking/feedback': { entries: [{ t: 40, answer: 'me' }], periods: {}, offPitch: [], revision: 2 },
    'matchAnalysisJobs/job_1/tracking/current': { report: null, version: 1, stale: true, feedbackRevision: 2 },
    ...extra,
  };
}
const okWorker = (calls: string[], before?: () => void) => async () => {
  calls.push('worker');
  before?.();
  return { workerVersion: 'football-cv/0.7.0', models: { detector: 'd' }, report: workerReport(),
    timeline: { times: [0, 0.5, 1], states: ['UNKNOWN', 'UNKNOWN', 'CONFIRMED_VISIBLE'] } };
};
const noStore = async () => {};
const notes: string[] = [];
const notify = async (id: string) => { notes.push(id); };

test('decision: fails closed on missing, malformed, off, unlisted and wrong-version configuration', () => {
  setEmulatorCvApproval(approval);
  assert.equal(decidePilot(null, 'u1', env), 'missing_config');
  assert.equal(parsePilotConfig({ enabled: 'yes', allowlist: ['u1'], workerVersion: 'x' }), null);
  assert.equal(parsePilotConfig({ enabled: true, allowlist: 'u1', workerVersion: 'x' }), null);
  assert.equal(parsePilotConfig({ enabled: true, allowlist: [''], workerVersion: 'x' }), null);
  assert.equal(decidePilot(parsePilotConfig(pilot({ enabled: false })), 'u1', env), 'pilot_off');
  assert.equal(decidePilot(parsePilotConfig(pilot()), 'u2', env), 'not_allowlisted');
  assert.equal(decidePilot(parsePilotConfig(pilot({ workerVersion: 'football-cv/0.6.9' })), 'u1', env), 'version_mismatch');
  assert.equal(decidePilot(parsePilotConfig(pilot()), 'u1', env), 'allowed');
  assert.equal(parsePilotConfig(pilot())?.holdReports, true, 'reports are held unless explicitly released by config');
  setEmulatorCvApproval(null);
  assert.equal(decidePilot(parsePilotConfig(pilot()), 'u1', env), 'version_mismatch', 'no approval record: closed');
  // The emulator-only seam never opens the gate outside the emulators.
  assert.equal(decidePilot(null, 'u1', { TRACKING_PILOT_GATE: 'off' }), 'missing_config');
});

test('start: only an allowlisted owner with consent starts; others are blocked without enqueuing work', async () => {
  setEmulatorCvApproval(approval);
  for (const [cfg, expected] of [[undefined, 'missing_config'], [pilot({ enabled: false }), 'pilot_off'],
    [pilot({ allowlist: ['u9'] }), 'not_allowlisted'], [pilot({ workerVersion: 'other' }), 'version_mismatch']] as const) {
    const { db, data } = fakeDb(seed(cfg ? { [PILOT]: cfg } : {}));
    const queued: string[] = [];
    const enqueue: Enqueue = async (q) => { queued.push(q); };
    const r = await startAnalysis(db, 'u1', 'job_1', enqueue, env, new Date('2026-11-19T10:00:00Z'), notify);
    assert.equal(r.status, 'blocked', expected);
    assert.equal(r.blocked, 'worker_unavailable');
    assert.equal((data.get('matchAnalysisJobs/job_1/tracking/progress') as { pilot?: string }).pilot, expected);
    assert.deepEqual(queued, []);
  }
  const { db } = fakeDb(seed({ [PILOT]: pilot() }));
  const queued: string[] = [];
  const r = await startAnalysis(db, 'u1', 'job_1', async (q) => { queued.push(q); }, env, new Date('2026-11-19T10:00:00Z'), notify);
  assert.equal(r.status, 'started');
  assert.ok(queued.length > 0);
  // Consent still applies to allowlisted owners.
  const noConsent = seed({ [PILOT]: pilot() }) as Record<string, unknown>;
  delete noConsent['videoProcessingConsents/job_1'];
  const r2 = await startAnalysis(fakeDb(noConsent as never).db, 'u1', 'job_1', async () => {}, env, new Date(), notify);
  assert.equal(r2.blocked, 'consent_required');
  setEmulatorCvApproval(null);
});

test('queued extraction stops without a worker call once the pilot is switched off', async () => {
  setEmulatorCvApproval(approval);
  const { db } = fakeDb(seed({ [PILOT]: pilot() }));
  await startAnalysis(db, 'u1', 'job_1', async () => {}, env, new Date('2026-11-19T10:00:00Z'), notify);
  await db.runTransaction(async (tx) => { (tx as { set: (r: unknown, v: unknown) => void }).set({ path: PILOT }, pilot({ enabled: false })); });
  const calls: string[] = [];
  const client = async () => { calls.push('worker'); return { status: 'complete' }; };
  const out = await processExtractTask(db, 'job_1', 1, 0, 0, client as never, async () => {}, env, async () => 'https://x', () => new Date(), notify);
  assert.equal(out, 'unavailable');
  assert.deepEqual(calls, []);
  setEmulatorCvApproval(null);
});

test('resolve: held for review by default, published only when hold is off, never to unlisted owners', async () => {
  setEmulatorCvApproval(approval);
  notes.length = 0;
  let calls: string[] = [];
  let f = fakeDb(seed({ [PILOT]: pilot() }));
  assert.equal(await processResolveTask(f.db, 'job_1', 2, okWorker(calls), env, noStore, { notify }), 'held');
  assert.equal((f.data.get('matchAnalysisJobs/job_1/tracking/current') as { report: unknown }).report, null, 'owner-visible doc untouched');
  assert.ok((f.data.get('matchAnalysisJobs/job_1/pilotHeld/current') as { report: unknown }).report);
  assert.deepEqual(notes, [], 'no completion notification while held');
  calls = [];
  f = fakeDb(seed({ [PILOT]: pilot({ allowlist: ['u9'] }) }));
  assert.equal(await processResolveTask(f.db, 'job_1', 2, okWorker(calls), env, noStore, { notify }), 'unavailable');
  assert.deepEqual(calls, [], 'no worker call for an unlisted owner');
  f = fakeDb(seed({ [PILOT]: pilot({ holdReports: false }) }));
  assert.equal(await processResolveTask(f.db, 'job_1', 2, okWorker(calls), env, noStore, { notify }), 'done');
  assert.ok((f.data.get('matchAnalysisJobs/job_1/tracking/current') as { report: unknown }).report);
  setEmulatorCvApproval(null);
});

test('kill switch during an in-flight worker call: the late result is discarded, nothing is published or held', async () => {
  setEmulatorCvApproval(approval);
  notes.length = 0;
  const f = fakeDb(seed({ [PILOT]: pilot({ holdReports: false }) }));
  const stop = () => { f.db.runTransaction(async (tx) => { (tx as { set: (r: unknown, v: unknown) => void }).set({ path: PILOT }, pilot({ enabled: false, holdReports: false })); }); };
  const out = await processResolveTask(f.db, 'job_1', 2, okWorker([], stop), env, noStore, { notify });
  assert.equal(out, 'stopped');
  assert.equal((f.data.get('matchAnalysisJobs/job_1/tracking/current') as { report: unknown }).report, null);
  assert.equal(f.data.has('matchAnalysisJobs/job_1/pilotHeld/current'), false);
  assert.deepEqual(notes, []);
  setEmulatorCvApproval(null);
});

test('reviewer release publishes the held report; containment withholds it again; owner corrections are untouched', async () => {
  setEmulatorCvApproval(approval);
  const f = fakeDb(seed({ [PILOT]: pilot() }));
  const feedbackBefore = structuredClone(f.data.get('matchAnalysisJobs/job_1/tracking/feedback'));
  assert.equal(await processResolveTask(f.db, 'job_1', 2, okWorker([]), env, noStore, { notify }), 'held');
  const heldReport = (f.data.get('matchAnalysisJobs/job_1/pilotHeld/current') as { report: { engine: unknown } }).report;
  const M = 'matchAnalysisJobs', T = 'tracking';
  assert.equal(await releaseHeldReport(f.db, M, T, 'job_1', 'reviewer-a', () => new Date('2026-11-19T12:00:00Z')), 'released');
  const cur = f.data.get('matchAnalysisJobs/job_1/tracking/current') as { report: { engine: unknown }; releasedBy: string; feedbackRevision: number };
  assert.deepEqual(cur.report.engine, heldReport.engine, 'provenance (engine block) preserved');
  assert.equal(cur.releasedBy, 'reviewer-a');
  assert.equal(cur.feedbackRevision, 2);
  assert.equal(await releaseHeldReport(f.db, M, T, 'job_1', 'reviewer-a'), 'nothing_held', 'release is not repeatable');
  assert.equal(await withholdPublishedReport(f.db, M, T, 'job_1', 'wrong-player audit'), 'withheld');
  const after = f.data.get('matchAnalysisJobs/job_1/tracking/current') as { report: unknown; pendingReason: string; stale: boolean };
  assert.equal(after.report, null);
  assert.equal(after.pendingReason, 'withheld_for_review');
  assert.equal((f.data.get('matchAnalysisJobs/job_1/pilotHeld/current') as { withheldReason: string }).withheldReason, 'wrong-player audit');
  assert.deepEqual(f.data.get('matchAnalysisJobs/job_1/tracking/feedback'), feedbackBefore);
  assert.equal(await withholdPublishedReport(f.db, M, T, 'job_1', 'again'), 'nothing_published');
  setEmulatorCvApproval(null);
});
