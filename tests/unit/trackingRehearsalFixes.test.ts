import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setEmulatorCvApproval } from '../../functions/src/analysis/cvConfig.ts';
import { releaseHeldReport, withholdPublishedReport } from '../../functions/src/analysis/pilotGate.ts';
import { processDiscoverTask, type Enqueue } from '../../functions/src/analysis/trackingOrchestrator.ts';
import { fromStoredForm, toStoredForm } from '../../functions/src/analysis/trackingV3.ts';
import { fromStoredForm as appFromStoredForm } from '../../src/features/match-analysis/services/trackingPresentation.ts';

/**
 * Defects found by the Functions-emulator rollback rehearsal (2026-11-19, scripts/pilot-rehearsal):
 *  1. Firestore rejects arrays inside arrays, so no tracking report (stateStrip, moment indicator) could be stored.
 *  2. Discovery sightings reached the owner (and sent "first moments") while reports were held, and a sighting that
 *     returned after the kill switch was still merged.
 */

function hasNestedArray(v: unknown, inArray = false): boolean {
  if (Array.isArray(v)) return inArray || v.some((x) => hasNestedArray(x, true));
  if (v && typeof v === 'object') return Object.values(v).some((x) => hasNestedArray(x, false));
  return false;
}

test('stored form: no array inside an array; server and app decoders restore the report exactly', () => {
  const report = {
    stateStrip: [[0, 10, 'UNKNOWN'], [10, 20, 'CONFIRMED_VISIBLE']],
    moments: [{ id: 'm_1', indicator: [[11, 0.4, 0.3, 0.05, 0.2]], kinds: ['spell'] }, { id: 'm_2', indicator: [] }],
    reviewQuestions: [{ box: [1, 2, 3, 4] }],
    deep: [[[1, 2], [3]], []],
    plain: { _tuple: 'not an array stays an object' },
  };
  const stored = toStoredForm(report);
  assert.equal(hasNestedArray(report), true);
  assert.equal(hasNestedArray(stored), false, 'Firestore-safe');
  assert.deepEqual(fromStoredForm(stored), report);
  assert.deepEqual(appFromStoredForm(stored), report, 'the app reads the same report the server wrote');
  assert.deepEqual(fromStoredForm(report), report, 'unwrapped tuples are accepted on read');
  assert.deepEqual(toStoredForm(null), null);
});

function deepMerge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const prev = out[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && prev && typeof prev === 'object' && !Array.isArray(prev)
      ? deepMerge(prev as Record<string, unknown>, v as Record<string, unknown>) : v;
  }
  return out;
}
function fakeDb(seed: Record<string, Record<string, unknown>>) {
  const data = new Map<string, Record<string, unknown>>(Object.entries(structuredClone(seed)));
  const write = (path: string, value: Record<string, unknown>, opts?: { merge?: boolean }) => {
    data.set(path, opts?.merge ? deepMerge(data.get(path) ?? {}, structuredClone(value)) : structuredClone(value));
  };
  const snap = (path: string) => ({ exists: data.has(path), data: () => structuredClone(data.get(path)), get: (k: string) => data.get(path)?.[k] });
  const docRef = (path: string) => ({ path, collection: (n: string) => collectionRef(`${path}/${n}`), get: async () => snap(path),
    set: async (v: Record<string, unknown>, o?: { merge?: boolean }) => write(path, v, o) });
  const collectionRef = (path: string) => ({ doc: (id: string) => docRef(`${path}/${id}`) });
  const db = { collection: collectionRef, runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn({
    get: async (r: { path: string }) => snap(r.path),
    set: (r: { path: string }, v: Record<string, unknown>, o?: { merge?: boolean }) => write(r.path, v, o),
    delete: (r: { path: string }) => { data.delete(r.path); },
  }) };
  return { db: db as unknown as Parameters<typeof processDiscoverTask>[0], data };
}

const env = { FUNCTIONS_EMULATOR: 'true', CV_WORKER_URL: 'http://localhost:9', CV_WORKER_APPROVED: 'true', TRACKING_V3_ENABLED: 'true' };
const approval = { workerVersion: 'football-cv/0.7.0', models: { detector: 'd' }, eventsApproved: false } as never;
const PILOT = 'opsConfig/trackingPilot';
const pilot = (over: Record<string, unknown> = {}) => ({ enabled: true, allowlist: ['u1'], workerVersion: 'football-cv/0.7.0',
  enabledAt: '2026-11-19T09:00:00.000Z', ...over });
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');
function seed(cfg: Record<string, unknown>) {
  return {
    [PILOT]: cfg,
    'matchAnalysisJobs/job_d': { playerId: 'u1', targeting: { jerseyNumber: '20', kitPrimaryColor: 'orange' },
      videoStoragePath: 'profiles/u1/matchFootage/job_d/video.mp4', measuredDurationSec: 1020, durationSec: 1020 },
    'matchAnalysisJobs/job_d/tracking/progress': { generation: 1, durationSec: 1020, plan: [{ index: 0, startSec: 0, endSec: 1020 }],
      segments: { 0: { status: 'queued', attempts: 0 } }, outcome: null, blocked: null, resolving: null,
      pilotAuthorizedAt: '2026-11-19T10:00:00.000Z',
      discovery: { chunks: [{ index: 0, startSec: 0, endSec: 120 }], state: { 0: { status: 'queued', attempts: 0 } }, firstMomentAt: null,
        sightingTimes: [], extractionQueued: false } },
  };
}
const sighting = (before?: () => void) => async () => {
  before?.();
  return { status: 'complete', moments: [{ id: 'd_1', kind: 'sighting', evidence: 'number_read', identityState: 'CONFIRMED_VISIBLE',
    number: '20', readFrames: 2, start: 5, clipStart: 4, clipEnd: 8, indicator: [[5, 0.5, 0.4, 0.05, 0.2]], imageJpegBase64: JPEG }] };
};

test('discovery: sightings stay under hold (no owner doc, no "first moments"); release publishes them; withhold contains them', async () => {
  setEmulatorCvApproval(approval);
  const notes: string[] = [];
  const notify = async (id: string) => { notes.push(id); return true; };
  const queued: string[] = [];
  const enqueue: Enqueue = async (q) => { queued.push(q); };
  const f = fakeDb(seed(pilot()));
  const out = await processDiscoverTask(f.db, 'job_d', 1, 0, 0, sighting() as never, enqueue, env, async () => 'http://x', () => new Date(),
    notify, async () => {});
  assert.equal(out, 'done');
  assert.equal(f.data.has('matchAnalysisJobs/job_d/tracking/discovery'), false, 'nothing owner-visible while held');
  const held = f.data.get('matchAnalysisJobs/job_d/pilotHeld/discovery') as { moments: unknown[] };
  assert.equal(held.moments.length, 1);
  assert.deepEqual(notes, [], 'no "first moments" notice while held');
  assert.deepEqual(queued, ['extractTrackingSegmentTask'], 'the analysis itself continues');
  assert.equal(await releaseHeldReport(f.db, 'matchAnalysisJobs', 'tracking', 'job_d', 'reviewer-a'), 'released');
  assert.equal((f.data.get('matchAnalysisJobs/job_d/tracking/discovery') as { moments: unknown[] }).moments.length, 1);
  assert.equal(await withholdPublishedReport(f.db, 'matchAnalysisJobs', 'tracking', 'job_d', 'audit'), 'withheld');
  assert.equal(f.data.has('matchAnalysisJobs/job_d/tracking/discovery'), false);
  assert.ok((f.data.get('matchAnalysisJobs/job_d/pilotHeld/discovery') as { withheldAt?: string }).withheldAt);
  setEmulatorCvApproval(null);
});

test('discovery: a sighting that returns after the kill switch is discarded', async () => {
  setEmulatorCvApproval(approval);
  const notes: string[] = [];
  const f = fakeDb(seed(pilot({ holdReports: false })));
  const stop = () => { void f.db.runTransaction(async (tx) => { (tx as { set: (r: unknown, v: unknown) => void }).set({ path: PILOT }, pilot({ enabled: false })); }); };
  const queued: string[] = [];
  const out = await processDiscoverTask(f.db, 'job_d', 1, 0, 0, sighting(stop) as never, async (q) => { queued.push(q); }, env,
    async () => 'http://x', () => new Date(), async (id: string) => { notes.push(id); return true; }, async () => {});
  assert.equal(out, 'unavailable');
  assert.equal(f.data.has('matchAnalysisJobs/job_d/tracking/discovery'), false);
  assert.equal(f.data.has('matchAnalysisJobs/job_d/pilotHeld/discovery'), false);
  assert.deepEqual(notes, []);
  assert.deepEqual(queued, []);
  setEmulatorCvApproval(null);
});
