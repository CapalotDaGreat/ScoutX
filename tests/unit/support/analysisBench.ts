/**
 * Deterministic workload benchmark for the match-analysis orchestration.
 *
 * It drives the REAL task code (startAnalysis, processDiscoverTask, processExtractTask,
 * processResolveTask, settleOrchestratedResolve, explainMoment, callChat) against an in-memory
 * Firestore and recorded worker output for IMG_4809 (tests/fixtures/tracking50-img4809-auto.json,
 * tests/fixtures/tracking41-img4809-discovery.json). Nothing here calls a network, a provider or
 * the vision worker, so it measures what the orchestration layer asks of them, not how long they
 * take. See docs/video/analysis-cost-benchmark.md for what is measured, estimated and missing.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { setEmulatorCvApproval } from '../../../functions/src/analysis/cvConfig.ts';
import { callChat } from '../../../functions/src/ai/openRouter.ts';
import {
  processResolveTask, settleOrchestratedResolve, type TrackingWorkerClient,
} from '../../../functions/src/analysis/trackingCallables.ts';
import {
  processDiscoverTask, processExtractTask, startAnalysis, type Enqueue,
} from '../../../functions/src/analysis/trackingOrchestrator.ts';
import { explainMoment, type ReasoningDeps } from '../../../functions/src/analysis/trackingReasoning.ts';
import { emptyFeedback } from '../../../functions/src/analysis/trackingV3.ts';
import type { TrackingProgress } from '../../../functions/src/analysis/trackingProgress.ts';
import { VIDEO_CONSENT_VERSION } from '../../../functions/src/analysis/videoConsent.ts';

type Firestore = Parameters<typeof processResolveTask>[0];
type Doc = Record<string, unknown>;

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', '..', 'fixtures');
const readFixture = (name: string): Doc => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as Doc;

export const JOB = 'job_bench';
export const UID = 'u_bench';
const JOB_PATH = `matchAnalysisJobs/${JOB}`;
const TRACKING = `${JOB_PATH}/tracking`;
const CONSENT_PATH = `videoProcessingConsents/${JOB}`;
const WORKER_VERSION = 'football-cv/bench';
const APPROVAL = { workerVersion: WORKER_VERSION, models: { detector: 'bench' }, eventsApproved: false } as never;
const ENV = { FUNCTIONS_EMULATOR: 'true', CV_WORKER_URL: 'http://localhost:9', CV_WORKER_APPROVED: 'true', TRACKING_V3_ENABLED: 'true' };
/** Synthetic JPEG (magic bytes + padding). The recorded fixtures have their images removed, so byte sizes are synthetic. */
const SYNTHETIC_JPEG_BYTES = 20_000;
const JPEG_B64 = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(SYNTHETIC_JPEG_BYTES - 4, 1)]).toString('base64');
const RECORDED_DURATION_SEC = 2035;

// ------------------------------------------------------------------------------------ fakes

function deepMerge(a: Doc, b: Doc): Doc {
  const out: Doc = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const prev = out[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && prev && typeof prev === 'object' && !Array.isArray(prev)
      ? deepMerge(prev as Doc, v as Doc) : v;
  }
  return out;
}

export type DbCounters = { reads: number; writes: number; publishes: number };
export type TransactionOptions = { readOnly?: boolean };

/** In-memory Firestore with Firestore's deep-merge semantics, counting reads, writes and report publishes. */
export function fakeDb(seed: Record<string, Doc>) {
  const data = new Map<string, Doc>(Object.entries(structuredClone(seed)));
  const counters: DbCounters = { reads: 0, writes: 0, publishes: 0 };
  const transactionOptions: Array<TransactionOptions | undefined> = [];
  const write = (path: string, value: Doc, opts?: { merge?: boolean }) => {
    counters.writes += 1;
    if (path.endsWith('/tracking/current')) counters.publishes += 1;
    data.set(path, opts?.merge ? deepMerge(data.get(path) ?? {}, structuredClone(value)) : structuredClone(value));
  };
  const snap = (path: string) => {
    counters.reads += 1;
    return { exists: data.has(path), data: () => structuredClone(data.get(path)), get: (k: string) => data.get(path)?.[k] };
  };
  const docRef = (path: string): unknown => ({
    path,
    collection: (name: string) => collectionRef(`${path}/${name}`),
    get: async () => snap(path),
    set: async (value: Doc, opts?: { merge?: boolean }) => write(path, value, opts),
  });
  const collectionRef = (path: string) => ({ doc: (id: string) => docRef(`${path}/${id}`) });
  const db = {
    collection: collectionRef,
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>, options?: TransactionOptions) => {
      transactionOptions.push(options);
      return fn({
        get: async (ref: { path: string }) => snap(ref.path),
        set: (ref: { path: string }, value: Doc, opts?: { merge?: boolean }) => write(ref.path, value, opts),
        delete: (ref: { path: string }) => { counters.writes += 1; data.delete(ref.path); },
      });
    },
  };
  return { db: db as unknown as Firestore, data, counters, transactionOptions };
}

export type Meter = {
  worker: { discover: number; extract: number; resolve: number; frames: number };
  /** extract calls answered 'cached' (stage-1 artifacts already existed) */
  workerCachedHits: number;
  imageWrites: number;
  imageBytes: number;
  notifications: number;
  /** Cloud Tasks re-deliveries after a retryable failure */
  retries: number;
  /** worker requests issued before the first report was published */
  workerCallsBeforeFirstReport: number | null;
  /** segments finished when the first report was published */
  segmentsDoneAtFirstReport: number | null;
  /** worker requests issued before the last report was published (the full report's position in the request sequence) */
  workerCallsAtLastPublish: number | null;
  provider: { requests: number; images: number; requestBytes: number };
};

function newMeter(): Meter {
  return { worker: { discover: 0, extract: 0, resolve: 0, frames: 0 }, workerCachedHits: 0, imageWrites: 0, imageBytes: 0,
    notifications: 0, retries: 0, workerCallsBeforeFirstReport: null, segmentsDoneAtFirstReport: null, workerCallsAtLastPublish: null,
    provider: { requests: 0, images: 0, requestBytes: 0 } };
}

const totalWorker = (m: Meter) => m.worker.discover + m.worker.extract + m.worker.resolve + m.worker.frames;

// ------------------------------------------------------------------------------------ recorded worker

const recordedReport = readFixture('tracking50-img4809-auto.json');
const recordedDiscovery = readFixture('tracking41-img4809-discovery.json');

type Queued = { queue: 'discoverTrackingTask' | 'extractTrackingSegmentTask' | 'resolveTrackingTask'; payload: Doc; attempt: number };

export type RunOptions = {
  /** 'prompt': resolve tasks run as soon as they are queued. 'delayed': they run only after every extraction task
   *  finished, which models a busy worker or a Cloud Tasks backoff retry and is the upper bound for overlapping resolves. */
  resolvePolicy: 'prompt' | 'delayed';
  /** segment index -> number of times the worker fails before it succeeds */
  failExtract?: Record<number, number>;
  jerseyNumber?: string;
  durationSec?: number;
};

export type RunResult = {
  meter: Meter;
  db: DbCounters;
  outcome: string | null;
  published: { version: number; scope: string; parts: number; reportSha256: string; moments: number } | null;
  /** distinct image objects written, and how many of them the final report does not reference */
  storedObjects: number;
  unreferencedObjects: number;
  progress: TrackingProgress | null;
  /** Legacy name: local replay elapsed milliseconds from performance.now(), not process CPU usage. */
  cpuMs: number;
};

const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function seedJob(opts: Required<Pick<RunOptions, 'jerseyNumber' | 'durationSec'>>): Record<string, Doc> {
  return {
    [JOB_PATH]: { playerId: UID, targeting: { jerseyNumber: opts.jerseyNumber, kitPrimaryColor: 'orange' },
      videoStoragePath: `profiles/${UID}/matchFootage/${JOB}/source.mp4`, measuredDurationSec: opts.durationSec, durationSec: opts.durationSec },
    [CONSENT_PATH]: { uid: UID, revokedAt: null, policyVersion: VIDEO_CONSENT_VERSION, providers: ['pitchproof_cloud'] },
  };
}

function makeWorker(meter: Meter, data: Map<string, Doc>, failures: Map<number, number>, doneSegments: Set<number>): TrackingWorkerClient {
  return async (body) => {
    if ('segmentIndex' in body) {
      meter.worker.extract += 1;
      const index = body.segmentIndex as number;
      const left = failures.get(index) ?? 0;
      if (left > 0) { failures.set(index, left - 1); return null; }
      if (doneSegments.has(index)) { meter.workerCachedHits += 1; return { status: 'cached' }; }
      doneSegments.add(index);
      return { status: 'complete', processingSec: 1 };
    }
    if ('chunkIndex' in body) {
      meter.worker.discover += 1;
      const start = body.startSec as number;
      const end = body.endSec as number;
      const moments = ((recordedDiscovery.moments ?? []) as Array<{ start: number }>).filter((m) => m.start >= start && m.start < end);
      return { status: 'complete', moments, processingSec: 1 };
    }
    if ('times' in body) {
      meter.worker.frames += 1;
      return { frames: [{ id: 'f0', t: 32, jpegBase64: 'AAAA' }, { id: 'f1', t: 35, jpegBase64: 'BBBB' }] };
    }
    meter.worker.resolve += 1;
    const progress = data.get(`${TRACKING}/progress`) as unknown as TrackingProgress | undefined;
    const parts = progress ? Object.values(progress.segments).filter((s) => s.status === 'done').length : 0;
    const plan = progress?.plan ?? [];
    const endSec = parts > 0 && plan[parts - 1] ? plan[Math.min(parts, plan.length) - 1].endSec : 0;
    const base = recordedReport.report as Doc;
    const moments = ((base.moments ?? []) as Doc[]).map((m) => ({ ...m, imageJpegBase64: m.candidate ? null : JPEG_B64 }));
    const reviewQuestions = ((base.reviewQuestions ?? []) as Doc[]).map((q) => ({ ...q, imageJpegBase64: JPEG_B64 }));
    return {
      workerVersion: WORKER_VERSION, models: { detector: 'bench' }, timeline: recordedReport.timeline,
      report: { ...base, moments, reviewQuestions, analysedRange: { startSec: 0, endSec, parts }, referenceImageJpegBase64: JPEG_B64 },
    };
  };
}

/** Runs one analysis from start to a published full report (or an interruption) through a Cloud-Tasks-like executor. */
export type Shared = { db: ReturnType<typeof fakeDb>; meter: Meter; done: Set<number>; failures: Map<number, number>;
  paths: Map<string, number> };

export async function runAnalysis(options: RunOptions, shared?: Shared): Promise<RunResult & { shared: Shared }> {
  const opts = { jerseyNumber: '20', durationSec: RECORDED_DURATION_SEC, ...options };
  setEmulatorCvApproval(APPROVAL);
  const fake = shared?.db ?? fakeDb(seedJob(opts));
  const meter = shared?.meter ?? newMeter();
  const done = shared?.done ?? new Set<number>();
  const failures = shared?.failures ?? new Map<number, number>(Object.entries(opts.failExtract ?? {}).map(([k, v]) => [Number(k), v]));
  const paths = shared?.paths ?? new Map<string, number>();
  const client = makeWorker(meter, fake.data, failures, done);
  const queue: Queued[] = [];
  const enqueue: Enqueue = async (q, payload) => { queue.push({ queue: q, payload, attempt: 0 }); };
  const seen = new Set<string>();
  const notify = async (id: string): Promise<boolean> => {
    if (seen.has(id)) return false;
    seen.add(id);
    meter.notifications += 1;
    return true;
  };
  const store = async (path: string, jpeg: Buffer) => {
    meter.imageWrites += 1;
    meter.imageBytes += jpeg.length;
    paths.set(path, (paths.get(path) ?? 0) + 1);
  };
  let clock = Date.parse('2026-11-20T10:00:00Z');
  const now = () => new Date((clock += 1000));
  const source = async () => 'https://signed.example/source';
  const publishesBefore = fake.counters.publishes;
  const started = performance.now();

  await startAnalysis(fake.db, UID, JOB, enqueue, ENV, now(), notify);

  let seenPublishes = publishesBefore;
  const noteFirstReport = () => {
    if (fake.counters.publishes > seenPublishes) {
      seenPublishes = fake.counters.publishes;
      meter.workerCallsAtLastPublish = totalWorker(meter);
    }
    if (meter.workerCallsBeforeFirstReport === null && fake.counters.publishes > publishesBefore) {
      meter.workerCallsBeforeFirstReport = totalWorker(meter);
      const p = fake.data.get(`${TRACKING}/progress`) as unknown as TrackingProgress;
      meter.segmentsDoneAtFirstReport = Object.values(p.segments).filter((s) => s.status === 'done').length;
    }
  };
  const next = (): Queued | undefined => {
    const isResolve = (t: Queued) => t.queue === 'resolveTrackingTask';
    if (opts.resolvePolicy === 'prompt') {
      const i = queue.findIndex(isResolve);
      return i >= 0 ? queue.splice(i, 1)[0] : queue.shift();
    }
    const i = queue.findIndex((t) => !isResolve(t));
    return i >= 0 ? queue.splice(i, 1)[0] : queue.shift();
  };
  let guard = 0;
  for (let task = next(); task && guard < 500; task = next(), guard += 1) {
    const progress = fake.data.get(`${TRACKING}/progress`) as unknown as TrackingProgress | undefined;
    const generation = progress?.generation ?? 1;
    let again = false;
    if (task.queue === 'discoverTrackingTask') {
      const out = await processDiscoverTask(fake.db, JOB, generation, task.payload.index as number, task.attempt, client, enqueue, ENV,
        source, now, notify, store);
      again = out === 'retry';
    } else if (task.queue === 'extractTrackingSegmentTask') {
      const out = await processExtractTask(fake.db, JOB, generation, task.payload.index as number, task.attempt, client, enqueue, ENV,
        source, now, notify);
      again = out === 'retry';
    } else {
      // Mirrors the resolveTrackingTask handler in trackingCallables.ts.
      const scope = task.payload.scope === 'preliminary' || task.payload.scope === 'full' ? task.payload.scope : 'feedback';
      let revision = task.payload.feedbackRevision as number;
      if (scope !== 'feedback') {
        const fb = fake.data.get(`${TRACKING}/feedback`) as { revision?: number } | undefined;
        revision = fb?.revision ?? 0;
      }
      const out = await processResolveTask(fake.db, JOB, revision, client, ENV, store, { scope, notify, now });
      if (scope !== 'feedback') await settleOrchestratedResolve(fake.db, JOB, scope, out, now());
    }
    if (again) { meter.retries += 1; queue.push({ ...task, attempt: task.attempt + 1 }); }
    noteFirstReport();
  }
  if (guard >= 500) throw new Error('benchmark exceeded its task budget; result is incomplete');
  const cpuMs = performance.now() - started;
  const current = fake.data.get(`${TRACKING}/current`) as { version?: number; scope?: string; parts?: number; report?: {
    moments?: Array<{ imagePath?: string | null }>; reviewQuestions?: Array<{ imagePath?: string | null }>; referenceImagePath?: string | null } } | undefined;
  const progressDoc = (fake.data.get(`${TRACKING}/progress`) ?? null) as unknown as TrackingProgress | null;
  const referenced = new Set<string>([
    ...(current?.report?.moments ?? []).map((m) => m.imagePath),
    ...(current?.report?.reviewQuestions ?? []).map((q) => q.imagePath),
    current?.report?.referenceImagePath,
  ].filter((p): p is string => typeof p === 'string' && p.length > 0));
  const shared2: Shared = { db: fake, meter, done, failures, paths };
  return {
    meter, db: { ...fake.counters }, outcome: progressDoc?.outcome ?? null, progress: progressDoc, cpuMs, shared: shared2,
    published: current ? { version: current.version ?? 0, scope: current.scope ?? '', parts: current.parts ?? 0,
      reportSha256: sha(current.report), moments: current.report?.moments?.length ?? 0 } : null,
    storedObjects: paths.size, unreferencedObjects: [...paths.keys()].filter((p) => !referenced.has(p)).length,
  };
}

/** Owner answers one identity question; the feedback re-resolve runs once. */
export async function runCorrection(after: RunResult & { shared: Shared }): Promise<{
  meter: Meter; db: DbCounters; published: RunResult['published'] }> {
  const { db: fake, meter } = after.shared;
  const before: Meter = structuredClone(meter);
  const beforeDb = { ...fake.counters };
  fake.data.set(`${TRACKING}/feedback`, { ...emptyFeedback(), revision: 1 } as unknown as Doc);
  const client = makeWorker(meter, fake.data, new Map(), after.shared.done);
  const store = async (path: string, jpeg: Buffer) => {
    meter.imageWrites += 1;
    meter.imageBytes += jpeg.length;
    after.shared.paths.set(path, (after.shared.paths.get(path) ?? 0) + 1);
  };
  const out = await processResolveTask(fake.db, JOB, 1, client, ENV, store, { scope: 'feedback', notify: async () => false });
  void out;
  const current = fake.data.get(`${TRACKING}/current`) as { version?: number; scope?: string; parts?: number; report?: unknown } | undefined;
  const diff: Meter = { ...meter, worker: { discover: meter.worker.discover - before.worker.discover, extract: meter.worker.extract - before.worker.extract,
    resolve: meter.worker.resolve - before.worker.resolve, frames: meter.worker.frames - before.worker.frames },
  imageWrites: meter.imageWrites - before.imageWrites, imageBytes: meter.imageBytes - before.imageBytes };
  return { meter: diff, db: { reads: fake.counters.reads - beforeDb.reads, writes: fake.counters.writes - beforeDb.writes,
    publishes: fake.counters.publishes - beforeDb.publishes },
  published: current ? { version: current.version ?? 0, scope: current.scope ?? '', parts: current.parts ?? 0, reportSha256: sha(current.report), moments: 0 } : null };
}

// ------------------------------------------------------------------------------------ clip explanation

const REASONING_MOMENT = { id: 'd_360', kind: 'sighting', kinds: ['sighting'], start: 36, end: 36, clipStart: 31, clipEnd: 40,
  identityState: 'CONFIRMED_VISIBLE', candidate: false, evidence: 'number_read', indicator: [[36, 0.4, 0.3, 0.05, 0.2]] };
const GOOD_ANSWER = JSON.stringify({ observation: 'You hold your width near the touchline.', interpretation: 'That can stretch the defence.',
  evidenceFrames: ['f0'], confidence: 'partial', limitations: [], suggestion: 'Scan before receiving.' });
const BAD_ANSWER = JSON.stringify({ observation: 'You scored a goal.', evidenceFrames: ['f0'] });

export type ReasoningScenario = 'repeat_answered' | 'repeat_rejected' | 'double_submit' | 'after_correction' | 'consent_revoked';

/** Counts what a sequence of "explain this clip" taps costs. `taps` run sequentially unless `concurrent`. */
export async function runReasoning(scenario: ReasoningScenario): Promise<{ taps: number; statuses: string[]; workerFrameCalls: number;
  providerRequests: number; providerImages: number; cachedAnswers: number }> {
  const seed: Record<string, Doc> = {
    [JOB_PATH]: { playerId: UID, videoStoragePath: `profiles/${UID}/matchFootage/${JOB}/v.mov` },
    [`${TRACKING}/current`]: { report: { target: { number: '20', kit: 'orange', position: 'winger', kit2: '' }, moments: [REASONING_MOMENT], offball: null },
      version: 4, stale: false },
    [CONSENT_PATH]: { uid: UID, providers: ['openrouter_zdr'], revokedAt: null, policyVersion: VIDEO_CONSENT_VERSION },
  };
  const fake = fakeDb(seed);
  let framesAsked = 0;
  let chats = 0;
  let images = 0;
  const content = scenario === 'repeat_rejected' ? BAD_ANSWER : GOOD_ANSWER;
  const deps: ReasoningDeps = {
    db: fake.db, env: { VIDEO_REASONING_ENABLED: 'true', FUNCTIONS_EMULATOR: 'true' }, aiConsent: async () => true, now: () => '2026-11-20T12:00:00Z',
    sourceUrl: async () => 'https://signed/v.mov',
    // A real worker/provider takes time; yielding makes two concurrent taps genuinely overlap.
    frames: async () => { framesAsked += 1; await new Promise((r) => setTimeout(r, 5));
      return { frames: [{ id: 'f0', t: 32, jpegBase64: 'AAAA' }, { id: 'f1', t: 35, jpegBase64: 'BBBB' }] }; },
    chat: async (messages) => {
      chats += 1; await new Promise((r) => setTimeout(r, 5));
      const user = messages.find((m) => m.role === 'user');
      if (user && Array.isArray(user.content)) images += user.content.filter((p) => p.type === 'image_url').length;
      return { ok: true as const, content };
    },
  };
  const ask = () => explainMoment(UID, JOB, 'd_360', 'explain', deps);
  const statuses: string[] = [];
  const record = (r: Awaited<ReturnType<typeof ask>>) => statuses.push(r.status === 'answered' && r.cached ? 'answered_cached' : r.status);
  let taps = 0;
  if (scenario === 'repeat_answered' || scenario === 'repeat_rejected') {
    for (let i = 0; i < 3; i += 1) { taps += 1; record(await ask()); }
  } else if (scenario === 'double_submit') {
    taps = 2;
    (await Promise.all([ask(), ask()])).forEach(record);
  } else if (scenario === 'after_correction') {
    taps += 1; record(await ask());
    fake.data.set(`${TRACKING}/current`, { ...(fake.data.get(`${TRACKING}/current`) as Doc), version: 5 });
    taps += 1; record(await ask());
    taps += 1; record(await ask());
  } else {
    taps += 1; record(await ask());
    fake.data.set(CONSENT_PATH, { ...(fake.data.get(CONSENT_PATH) as Doc), revokedAt: '2026-11-20T12:30:00Z' });
    taps += 1; record(await ask());
  }
  return { taps, statuses, workerFrameCalls: framesAsked, providerRequests: chats, providerImages: images,
    cachedAnswers: statuses.filter((s) => s === 'answered_cached').length };
}

// ------------------------------------------------------------------------------------ provider usage capture

/** Calls the real callChat against a stubbed fetch that returns a usage block, and reports whether usage is surfaced. */
export async function probeUsageCapture(): Promise<{ usageSurfaced: boolean; usage: unknown }> {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 1200, completion_tokens: 150, total_tokens: 1350 },
  }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
  try {
    const result = await callChat({ apiKey: 'k', model: 'google/gemini-2.5-flash', title: 'bench', messages: [{ role: 'system', content: 's' }] });
    const usage = (result as { usage?: unknown }).usage;
    return { usageSurfaced: usage !== undefined, usage: usage ?? null };
  } finally {
    globalThis.fetch = realFetch;
  }
}

// ------------------------------------------------------------------------------------ driver

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export type ScenarioSummary = {
  id: string;
  description: string;
  samples: number;
  counts: { workerRequests: Meter['worker']; workerCachedHits: number; retries: number; imageWrites: number; imageBytesSynthetic: number;
    notifications: number; firestoreReads: number; firestoreWrites: number; publishes: number;
    storedObjects: number; unreferencedObjects: number;
    workerCallsBeforeFirstReport: number | null; segmentsDoneAtFirstReport: number | null; workerCallsAtLastPublish: number | null };
  published: RunResult['published'];
  outcome: string | null;
  cpuMs: { coldFirstRun: number; p50: number; p95: number };
};

const SAMPLES = 30;

async function summarise(id: string, description: string, exec: () => Promise<RunResult>): Promise<ScenarioSummary> {
  const runs: RunResult[] = [];
  for (let i = 0; i < SAMPLES; i += 1) runs.push(await exec());
  const first = runs[0];
  for (const r of runs) {
    if (JSON.stringify([r.meter, r.db, r.published]) !== JSON.stringify([first.meter, first.db, first.published])) {
      throw new Error(`scenario ${id} is not deterministic`);
    }
  }
  const cpu = runs.map((r) => r.cpuMs).sort((a, b) => a - b);
  const m = first.meter;
  return {
    id, description, samples: SAMPLES,
    counts: { workerRequests: m.worker, workerCachedHits: m.workerCachedHits, retries: m.retries, imageWrites: m.imageWrites,
      imageBytesSynthetic: m.imageBytes, notifications: m.notifications, firestoreReads: first.db.reads, firestoreWrites: first.db.writes,
      publishes: first.db.publishes, storedObjects: first.storedObjects, unreferencedObjects: first.unreferencedObjects,
      workerCallsBeforeFirstReport: m.workerCallsBeforeFirstReport, segmentsDoneAtFirstReport: m.segmentsDoneAtFirstReport,
      workerCallsAtLastPublish: m.workerCallsAtLastPublish },
    published: first.published, outcome: first.outcome,
    cpuMs: { coldFirstRun: round(cpu.length ? runs[0].cpuMs : NaN), p50: round(percentile(cpu, 50)), p95: round(percentile(cpu, 95)) },
  };
}

const round = (v: number) => Math.round(v * 1000) / 1000;

export async function runBenchmark(): Promise<{ schema: string; revision: string; fixture: string; scenarios: ScenarioSummary[];
  reasoning: Record<string, Awaited<ReturnType<typeof runReasoning>>>; correction: Awaited<ReturnType<typeof runCorrection>>;
  usageCapture: Awaited<ReturnType<typeof probeUsageCapture>>; segments: number }> {
  const scenarios: ScenarioSummary[] = [];
  scenarios.push(await summarise('cold_prompt', 'Cold analysis, 2035 s recorded match, shirt number given; resolve tasks run promptly.',
    () => runAnalysis({ resolvePolicy: 'prompt' })));
  scenarios.push(await summarise('cold_delayed_resolve', 'Same, but resolve tasks are delayed until extraction ends (busy worker or backoff retry).',
    () => runAnalysis({ resolvePolicy: 'delayed' })));
  scenarios.push(await summarise('cold_no_number_prompt', 'Cold analysis without a shirt number (no discovery pass), prompt resolves.',
    () => runAnalysis({ resolvePolicy: 'prompt', jerseyNumber: '' })));
  scenarios.push(await summarise('transient_failures', 'Segment 2 fails twice and segment 4 once, then succeed within the 3-attempt budget.',
    () => runAnalysis({ resolvePolicy: 'prompt', failExtract: { 2: 2, 4: 1 } })));
  scenarios.push(await summarise('interrupted_then_resumed', 'Segment 3 fails every attempt (analysis interrupted), then the owner resumes: finished segments must not run again.', async () => {
    const first = await runAnalysis({ resolvePolicy: 'prompt', failExtract: { 3: 3 } });
    const shared = first.shared;
    shared.failures.clear();
    const second = await runAnalysis({ resolvePolicy: 'prompt' }, shared);
    return { ...second, cpuMs: first.cpuMs + second.cpuMs };
  }));
  const base = await runAnalysis({ resolvePolicy: 'prompt' });
  const correction = await runCorrection(base);
  const reasoning: Record<string, Awaited<ReturnType<typeof runReasoning>>> = {};
  for (const s of ['repeat_answered', 'repeat_rejected', 'double_submit', 'after_correction', 'consent_revoked'] as const) {
    reasoning[s] = await runReasoning(s);
  }
  setEmulatorCvApproval(null);
  return { schema: 'pitchproof.analysis-bench.v1', revision: process.env.BENCH_REVISION ?? 'unknown',
    fixture: 'IMG_4809 recorded worker output (tracking50-img4809-auto, tracking41-img4809-discovery), 2035 s',
    scenarios, reasoning, correction, usageCapture: await probeUsageCapture(), segments: base.progress?.plan.length ?? 0 };
}
