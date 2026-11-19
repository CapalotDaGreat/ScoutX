import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setEmulatorCvApproval } from '../../functions/src/analysis/cvConfig.ts';
import { effectiveLifecycleStatus } from '../../functions/src/analysis/mediaLifecycle.ts';
import { releaseHeldReport, withholdPublishedReport } from '../../functions/src/analysis/pilotGate.ts';
import { processResolveTask } from '../../functions/src/analysis/trackingCallables.ts';
import { processExtractTask } from '../../functions/src/analysis/trackingOrchestrator.ts';
import {
  heldImagePath, pruneJobImages, referencedImagePaths, type ImageBucket,
} from '../../functions/src/analysis/trackingImages.ts';
import {
  OFFBALL_MIN_CONFIRMED_SEC, eligibleConfirmedSec, enforceOffballGate, parseTrackingReport,
} from '../../functions/src/analysis/trackingV3.ts';
import { VIDEO_CONSENT_VERSION } from '../../functions/src/analysis/videoConsent.ts';
import { buildCoachInsights, wholeMatchOffballEligible } from '../../src/features/match-review/services/coach.ts';

type Firestore = Parameters<typeof processResolveTask>[0];

// ---------------------------------------------------------------- R4: server recomputation of the 60 s gate
const C = 'CONFIRMED_VISIBLE';
/** n confirmed samples at `step` s starting at t0 (the uploaded timeline is ~2 samples/s). */
function run(t0: number, n: number, step = 0.5, state = C) {
  return { times: Array.from({ length: n }, (_, i) => Math.round((t0 + i * step) * 1000) / 1000), states: Array(n).fill(state) as string[] };
}
const cat = (...xs: Array<{ times: number[]; states: string[] }>) => ({ times: xs.flatMap((x) => x.times), states: xs.flatMap((x) => x.states) });

test('R4: eligible confirmed duration below, exactly at and above 60 s, with the worker semantics', () => {
  assert.equal(OFFBALL_MIN_CONFIRMED_SEC, 60);
  assert.equal(eligibleConfirmedSec(run(0, 119), 3000), 59.5);
  assert.equal(eligibleConfirmedSec(run(0, 120), 3000), 60);
  assert.equal(eligibleConfirmedSec(run(0, 121), 3000), 60.5);
});

test('R4: overlaps count once, gaps and non-confirmed states count nothing, invalid samples are excluded', () => {
  // the same 30 s uploaded twice (overlapping chunks) is still 30 s
  assert.equal(eligibleConfirmedSec(cat(run(0, 60), run(0, 60)), 3000), 30);
  // a timestamp reported with two different states is invalid
  assert.equal(eligibleConfirmedSec(cat(run(0, 60), run(0, 1, 0.5, 'LIKELY_VISIBLE')), 3000), 29.5);
  // discontinuous: 2 x 25 s with a 10-minute gap = 50 s (the gap is not confirmed footage)
  assert.equal(eligibleConfirmedSec(cat(run(0, 50), run(625, 50)), 3000), 50);
  // likely / ambiguous / unknown never count
  const mixed = cat(run(0, 100), run(50, 100, 0.5, 'LIKELY_VISIBLE'), run(100, 100, 0.5, 'AMBIGUOUS'));
  assert.equal(eligibleConfirmedSec(mixed, 3000), 50);
  // outside the recording, negative or non-finite times are excluded; no/short/mismatched timeline -> 0
  assert.equal(eligibleConfirmedSec({ times: [...run(0, 100).times, 5000, -1, Number.NaN], states: [...run(0, 100).states, C, C, C] }, 3000), 50);
  assert.equal(eligibleConfirmedSec(undefined, 3000), 0);
  assert.equal(eligibleConfirmedSec({ times: [1, 2], states: [C] }, 3000), 0);
  // unsorted input is fine
  const r = run(0, 120);
  assert.equal(eligibleConfirmedSec({ times: [...r.times].reverse(), states: r.states }, 3000), 60);
});

function workerReport(offball: Record<string, unknown>) {
  return {
    schema: 'pitchproof.tracking.v3', engine: { version: '3.0.0' }, target: { number: '20', kit: 'orange', kit2: '', position: 'midfielder' },
    timeline: { periods: [{ start: 0, end: 3000, kind: 'play', label: 'play', source: 'detected' }] },
    coverage: { recordingSec: 3000, nonMatchSec: 0, offPitchSec: 0, matchSec: 3000, unobservedSec: 0, analysedSec: 3000,
      confirmedVisibleSec: 400, likelyVisibleSec: 100, ambiguousSec: 100, notIdentifiedSec: 2400 },
    identity: { statesSec: { CONFIRMED_VISIBLE: 400 }, numberSightings: 3, confirmedByUser: 0 },
    physical: { status: 'unavailable', productionVisible: false, reason: 'x', values: {}, sprints: [], highSpeedRuns: [],
      thresholds: { sprint_kmh: 19.8, hsr_kmh: 14.4 } },
    ball: { contacts: 0, carries: 0, passAttempts: 0, completedPasses: 0, incompletePasses: 0, unknownOutcomePasses: 0 },
    events: [], reviewQuestions: [], offball,
  };
}
const MEASURED = { status: 'measured', confirmedSec: 400, minConfirmedSec: 60, measuredSec: 300,
  nearestOpponentBodyHeights: { median: 2.2, p25: 1.1, p75: 3.4 }, freeShare: 0.3, tightShare: 0.1, freeEpisodes: [], tightEpisodes: [] };

test('R4: a worker that overstates confirmed duration cannot publish a whole-match observation or drill', () => {
  // worker claims 400 s confirmed; the timeline it sent supports 30 s
  const parsed = parseTrackingReport(workerReport(MEASURED), run(100, 60));
  assert.ok(parsed);
  assert.equal(parsed.offball?.status, 'insufficient');
  assert.equal(parsed.offball?.serverEligibleSec, 30);
  assert.equal(parsed.offball?.confirmedSec, 30, 'the stored claim is capped at what the server could verify');
  assert.equal(parsed.offball?.nearestOpponentBodyHeights, undefined, 'no measurement survives');
  const insights = buildCoachInsights(parsed as never, { position: 'midfielder' });
  assert.ok(!insights.some((i) => i.id === 'positioning_observation'));
  assert.ok(!insights.some((i) => i.topic === 'positioning' && i.drill), 'no positioning drill either');
  // exactly 60 s supported -> measured, with the validated duration recorded
  const at = parseTrackingReport(workerReport(MEASURED), run(100, 120));
  assert.equal(at?.offball?.status, 'measured');
  assert.equal(at?.offball?.serverEligibleSec, 60);
  assert.equal(at?.offball?.confirmedSec, 60, 'the 400 s claim is capped at the verified 60 s');
  assert.equal(at?.offball?.measuredSec, 60, 'the 300 s measured claim is capped too');
  const obs = buildCoachInsights(at as never, { position: 'midfielder' }).find((i) => i.id === 'positioning_observation');
  assert.ok(obs?.drill, 'eligible: observation with its position-dependent drill');
  assert.equal(obs?.params.measuredMin, 1, 'the text says 1 min, not the 5 min the worker claimed');
  // never upgraded: an insufficient worker block stays insufficient even with enough timeline
  const ins = parseTrackingReport(workerReport({ status: 'insufficient', confirmedSec: 40, minConfirmedSec: 60 }), run(0, 400));
  assert.equal(ins?.offball?.status, 'insufficient');
  // a lowered worker threshold is raised to the server's
  assert.equal(enforceOffballGate({ ...MEASURED, minConfirmedSec: 10 } as never, 30).status, 'insufficient');
});

test('R4: reports stored before R4 (no serverEligibleSec) get no whole-match positioning in the app', () => {
  const legacy = { offball: { ...MEASURED, status: 'measured' as const } };
  assert.equal(wholeMatchOffballEligible(legacy.offball as never), false);
  assert.equal(wholeMatchOffballEligible({ ...MEASURED, serverEligibleSec: 59.5 } as never), false);
  assert.equal(wholeMatchOffballEligible({ ...MEASURED, serverEligibleSec: 60 } as never), true);
});

// ---------------------------------------------------------------- R1: lifecycle status of tracking jobs
test('R1: the media lifecycle waits for a running tracking analysis and settles a finished one', () => {
  const e = (status: string, trackingState: 'running' | 'complete' | 'failed' | null) => effectiveLifecycleStatus({ status, trackingState });
  assert.equal(e('failed', 'running'), 'processing', 'legacy failure (AI not approved) must not delete a running tracking source');
  assert.equal(e('complete', 'running'), 'processing');
  assert.equal(e('failed', 'complete'), 'complete', 'tracking-only completion settles the job');
  assert.equal(e('processing', 'complete'), 'processing', 'an active legacy pipeline still needs the source');
  assert.equal(e('failed', 'failed'), 'failed', 'interrupted tracking: retry window');
  assert.equal(e('cancelled', 'running'), 'cancelled', 'owner cancellation always wins');
  assert.equal(e('complete', null), 'complete', 'jobs without tracking: unchanged');
  assert.equal(e('uploading', null), 'uploading');
});

// ---------------------------------------------------------------- R2: images follow report visibility
function memBucket(seed: Record<string, number> = {}) {
  const objects = new Map<string, { bytes: Buffer; updatedMs: number }>(Object.entries(seed).map(([k, t]) => [k, { bytes: Buffer.from(k), updatedMs: t }]));
  let clock = 1_000_000;
  const b: ImageBucket & { objects: typeof objects } = {
    objects,
    async save(p, bytes) { objects.set(p, { bytes, updatedMs: (clock += 1) }); },
    async read(p) { return objects.get(p)?.bytes ?? null; },
    async remove(p) { objects.delete(p); },
    async list(prefix) { return [...objects].filter(([k]) => k.startsWith(prefix)).map(([name, o]) => ({ name, updatedMs: o.updatedMs })); },
  };
  return b;
}
const P = (n: string) => `profiles/u1/matchFootage/job_1/tracking/${n}.jpg`;

test('R2: prune keeps referenced images, contains held copies stored before R2, discards own and stale ones only', async () => {
  const bucket = memBucket({
    [P('cur')]: 0, [heldImagePath(P('pending'))]: 0, [P('legacy_held')]: 0, [P('old_unref')]: 0, [heldImagePath(P('mine'))]: 2_000_000,
    [heldImagePath(P('recent_other'))]: 2_000_000, [heldImagePath(P('half_published'))]: 0,
    'profiles/u1/matchFootage/job_2/tracking/cur.jpg': 0, 'profiles/u1/matchFootage/job_1/video.mp4': 0,
  });
  const docs = { current: { report: { referenceImagePath: P('cur'), moments: [{ imagePath: P('half_published') }] } },
    held: { report: { reviewQuestions: [{ imagePath: P('pending') }, { imagePath: P('legacy_held') }] } }, discovery: null, heldDiscovery: null };
  const r = await pruneJobImages(bucket, 'u1', 'job_1', docs, { own: [P('mine')], olderThanMs: 1_500_000 });
  const has = (k: string) => bucket.objects.has(k);
  assert.ok(has(P('cur')), 'owner-visible report image kept');
  assert.ok(has(heldImagePath(P('pending'))) && !has(P('pending')), 'held image stays server-only');
  assert.ok(!has(P('legacy_held')) && has(heldImagePath(P('legacy_held'))), 'pre-R2 held image moved off the owner path');
  assert.ok(!has(P('old_unref')), 'unreferenced and older than any running attempt: discarded');
  assert.ok(!has(heldImagePath(P('mine'))), "this attempt's discarded image deleted at once");
  assert.ok(has(heldImagePath(P('recent_other'))), 'a recent image of another, possibly running attempt is kept');
  assert.ok(has(P('half_published')) && !has(heldImagePath(P('half_published'))), 'interrupted publication completed');
  assert.ok(has('profiles/u1/matchFootage/job_2/tracking/cur.jpg') && has('profiles/u1/matchFootage/job_1/video.mp4'), 'nothing else touched');
  const again = await pruneJobImages(bucket, 'u1', 'job_1', docs, { olderThanMs: 1_500_000 });
  assert.deepEqual([again.deleted, again.contained], [[], []], 'repeating is a no-op');
  assert.ok(r.deleted.length === 2 && r.contained.length === 1);
  assert.deepEqual([...referencedImagePaths(docs.held)].sort(), [P('legacy_held'), P('pending')]);
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
    delete: (r: { path: string }) => { data.delete(r.path); } }) };
  return { db: db as unknown as Firestore, data };
}
const env = { FUNCTIONS_EMULATOR: 'true', CV_WORKER_URL: 'http://localhost:9', CV_WORKER_APPROVED: 'true', TRACKING_V3_ENABLED: 'true' };
const approval = { workerVersion: 'football-cv/0.7.0', models: { detector: 'd' }, eventsApproved: false } as never;
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');
const pilot = (over: Record<string, unknown> = {}) => ({ enabled: true, allowlist: ['u1'], workerVersion: 'football-cv/0.7.0',
  enabledAt: '2026-11-19T09:00:00.000Z', ...over });
function seed(cfg: Record<string, unknown>) {
  return {
    'opsConfig/trackingPilot': cfg,
    'matchAnalysisJobs/job_1': { playerId: 'u1', targeting: { jerseyNumber: '20' }, videoStoragePath: 'profiles/u1/matchFootage/job_1/video.mp4',
      measuredDurationSec: 60, durationSec: 60, status: 'failed', trackingState: 'running' },
    'videoProcessingConsents/job_1': { uid: 'u1', revokedAt: null, policyVersion: VIDEO_CONSENT_VERSION },
    'matchAnalysisJobs/job_1/tracking/progress': { generation: 1, durationSec: 60, plan: [{ index: 0, startSec: 0, endSec: 60 }],
      segments: { 0: { status: 'done', attempts: 1 } }, outcome: null, blocked: null, resolving: 'full', pilotAuthorizedAt: '2026-11-19T10:00:00.000Z' },
  };
}
const worker = (before?: () => void) => async () => {
  before?.();
  const report = { ...workerReport(MEASURED), coverage: { recordingSec: 60, nonMatchSec: 0, offPitchSec: 0, matchSec: 60, unobservedSec: 0,
    analysedSec: 60, confirmedVisibleSec: 10, likelyVisibleSec: 10, ambiguousSec: 10, notIdentifiedSec: 30 },
  timeline: { periods: [{ start: 0, end: 60, kind: 'play', label: 'play', source: 'detected' }] }, analysedRange: { startSec: 0, endSec: 60, parts: 1 },
  reviewQuestions: [{ t: 12.3, box: [1, 2, 30, 90], affectedSec: 20, currentlyTarget: false, score: 0.5, imageJpegBase64: JPEG }],
  referenceImageJpegBase64: JPEG };
  return { workerVersion: 'football-cv/0.7.0', models: { detector: 'd' }, report, timeline: run(10, 20) };
};

test('R1+R2: a full held report finishes the run; its images stay server-only until release; withholding closes them again', async () => {
  setEmulatorCvApproval(approval);
  const f = fakeDb(seed(pilot()));
  const bucket = memBucket();
  const store = async (p: string, b: Buffer) => bucket.save(heldImagePath(p), b);
  assert.equal(await processResolveTask(f.db, 'job_1', 0, worker(), env, store, { scope: 'full', images: bucket }), 'held');
  assert.equal((f.data.get('matchAnalysisJobs/job_1') as { trackingState: string }).trackingState, 'complete');
  const owner = [...bucket.objects.keys()].filter((k) => k.includes('/tracking/'));
  const held = [...bucket.objects.keys()].filter((k) => k.includes('/pilotHeld/'));
  assert.deepEqual(owner, [], 'nothing at an owner-readable path while held');
  assert.equal(held.length, 2);
  assert.equal(await releaseHeldReport(f.db, 'matchAnalysisJobs', 'tracking', 'job_1', 'reviewer-a', () => new Date(), bucket), 'released');
  assert.equal([...bucket.objects.keys()].filter((k) => k.includes('/tracking/')).length, 2, 'released: owner paths filled');
  assert.equal([...bucket.objects.keys()].filter((k) => k.includes('/pilotHeld/')).length, 0);
  assert.equal(await withholdPublishedReport(f.db, 'matchAnalysisJobs', 'tracking', 'job_1', 'audit', () => new Date(), bucket), 'withheld');
  assert.equal([...bucket.objects.keys()].filter((k) => k.includes('/tracking/')).length, 0, 'withheld: owner paths closed');
  assert.equal([...bucket.objects.keys()].filter((k) => k.includes('/pilotHeld/')).length, 2, 'kept server-side with the withheld copy');
  // the R4 gate held: the timeline supports 10 s, so no whole-match observation was stored
  const heldDoc = f.data.get('matchAnalysisJobs/job_1/pilotHeld/current') as { report: { offball: { status: string } } };
  assert.equal(heldDoc.report.offball.status, 'insufficient');
  setEmulatorCvApproval(null);
});

test('R2: a result discarded by the kill switch leaves no image behind; a finished run is not reopened by a late failure', async () => {
  setEmulatorCvApproval(approval);
  const f = fakeDb(seed(pilot()));
  const bucket = memBucket();
  const store = async (p: string, b: Buffer) => bucket.save(heldImagePath(p), b);
  const stop = () => { void f.db.runTransaction(async (tx) => { (tx as { set: (r: unknown, v: unknown) => void }).set({ path: 'opsConfig/trackingPilot' }, pilot({ enabled: false })); }); };
  assert.equal(await processResolveTask(f.db, 'job_1', 0, worker(stop), env, store, { scope: 'full', images: bucket }), 'stopped');
  assert.equal(bucket.objects.size, 0, 'the discarded attempt deleted its images');
  assert.equal((f.data.get('matchAnalysisJobs/job_1') as { trackingState: string }).trackingState, 'running', 'not completed by a discarded result');
  setEmulatorCvApproval(null);
});

test('idempotency: a repeated full resolve of the same run and revision makes no worker call and no new version', async () => {
  setEmulatorCvApproval(approval);
  const f = fakeDb(seed(pilot()));
  const bucket = memBucket();
  const store = async (p: string, b: Buffer) => bucket.save(heldImagePath(p), b);
  let calls = 0;
  const counted = async () => { calls += 1; return worker()(); };
  assert.equal(await processResolveTask(f.db, 'job_1', 0, counted, env, store, { scope: 'full', images: bucket }), 'held');
  const v1 = (f.data.get('matchAnalysisJobs/job_1/pilotHeld/current') as { version: number }).version;
  const names1 = [...bucket.objects.keys()].sort();
  assert.equal(await processResolveTask(f.db, 'job_1', 0, counted, env, store, { scope: 'full', images: bucket }), 'stale');
  assert.equal(await processResolveTask(f.db, 'job_1', 0, counted, env, store, { images: bucket }), 'stale', 'also a duplicate feedback-scope delivery');
  assert.equal(calls, 1, 'no second worker call');
  assert.equal((f.data.get('matchAnalysisJobs/job_1/pilotHeld/current') as { version: number }).version, v1);
  assert.deepEqual([...bucket.objects.keys()].sort(), names1, 'no new images');
  // an operator re-authorisation (authorizeRun) is new work and resolves again, with new image names
  f.data.set('matchAnalysisJobs/job_1/tracking/progress', { ...(f.data.get('matchAnalysisJobs/job_1/tracking/progress') as object),
    pilotAuthorizedAt: '2026-11-19T11:00:00.000Z' });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(await processResolveTask(f.db, 'job_1', 0, counted, env, store, { scope: 'full', images: bucket }), 'held');
  assert.equal(calls, 2);
  const names2 = [...bucket.objects.keys()].filter((k) => !names1.includes(k));
  assert.ok(names2.length >= 2, 'reprocessing writes new names, never re-using an earlier image path');
  setEmulatorCvApproval(null);
});

test('idempotency: a duplicate extract task while an attempt runs makes no second worker call; a real retry proceeds', async () => {
  setEmulatorCvApproval(approval);
  const f = fakeDb(seed(pilot()));
  f.data.set('matchAnalysisJobs/job_1/tracking/progress', { ...(f.data.get('matchAnalysisJobs/job_1/tracking/progress') as object),
    resolving: null, segments: { 0: { status: 'queued', attempts: 0 } } });
  let calls = 0;
  let duplicate: string | undefined;
  const enqueue = async () => {};
  const src = async () => 'https://storage.invalid/source';
  const client = async () => {
    calls += 1;
    if (calls === 1) duplicate = await processExtractTask(f.db, 'job_1', 1, 0, 0, client as never, enqueue, env, src);
    return { status: 'complete', processingSec: 1 };
  };
  assert.equal(await processExtractTask(f.db, 'job_1', 1, 0, 0, client as never, enqueue, env, src), 'done');
  assert.equal(duplicate, 'stale', 'the concurrent duplicate saw the running attempt');
  assert.equal(calls, 1);
  // a crashed attempt 0 left "running"; the queue's retry (attempt 1) is not blocked
  const g = fakeDb(seed(pilot()));
  g.data.set('matchAnalysisJobs/job_1/tracking/progress', { ...(g.data.get('matchAnalysisJobs/job_1/tracking/progress') as object),
    resolving: null, segments: { 0: { status: 'running', attempts: 1, startedAt: new Date().toISOString() } } });
  let retryCalls = 0;
  const ok = async () => { retryCalls += 1; return { status: 'complete', processingSec: 1 }; };
  assert.equal(await processExtractTask(g.db, 'job_1', 1, 0, 1, ok as never, enqueue, env, src), 'done');
  assert.equal(retryCalls, 1);
  setEmulatorCvApproval(null);
});
