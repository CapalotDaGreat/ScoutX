/**
 * Video Intelligence 4.0 - progressive, resumable player analysis.
 *
 *   startPlayerAnalysis (owner callable)
 *     -> plans the recording into segments (trackingProgress.planSegments)
 *     -> enqueues one extractTrackingSegmentTask per segment (retryable, rate limited)
 *   extractTrackingSegmentTask
 *     -> worker /v3/tracking:extract with a short-lived signed source URL (stage 1 artifacts are
 *        cached per segment on the worker, so a retry never re-processes finished footage)
 *     -> records the worker-measured processing time (real throughput, no invented percentages)
 *     -> enqueues a preliminary resolve while extraction continues, and the full resolve at the end
 *   resolveTrackingTask (trackingCallables.ts)
 *     -> publishes the report; a preliminary report never overwrites a fuller one
 *
 * The same gates as before apply: nothing runs unless TRACKING_V3_ENABLED=true and the approved
 * CV worker is available, the caller owns the job and holds current video consent.
 */
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getFunctions } from 'firebase-admin/functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { createCallableOptions } from '../callableOptions';
import { taskQueueName } from '../region';
import { writeSystemActivity } from '../notificationProducers';
import { assertCallableRateLimit } from '../security/rateLimit';
import { readableSourceFor } from '../uploads/mediaSource';
import { cvWorkerStatus, cvWorkerUrl } from './cvConfig';
import { MATCH_COLLECTION, type MatchJobDoc } from './frameAnalysis';
import {
  TRACKING_COLLECTION, decodeReviewImage, parseDiscoveryMoments, reviewImagePath, trackingV3Enabled, type TrackingMoment,
} from './trackingV3';
import {
  httpTrackingClient, storageImageStore, type ImageStore, type TrackingNotifier, type TrackingWorkerClient,
} from './trackingCallables';
import {
  discoveryFinished, doneCount, newProgress, notificationId, planDiscovery, prioritisedSegments, shouldResolvePreliminary,
  type DiscoveryProgress, type ProgressBlock, type SegmentState, type TrackingProgress,
} from './trackingProgress';
import { VIDEO_CONSENT_COLLECTION, VIDEO_CONSENT_VERSION } from './videoConsent';

const JOB_ID = /^[A-Za-z0-9_-]{1,80}$/;
export const PLAYER_ANALYSIS_START_LIMIT = { action: 'player_analysis_start', max: 10, window: 'day' as const };
export const EXTRACT_MAX_ATTEMPTS = 3;

export type Enqueue = (queue: 'discoverTrackingTask' | 'extractTrackingSegmentTask' | 'resolveTrackingTask',
  payload: Record<string, unknown>) => Promise<void>;

export const cloudTasksEnqueue: Enqueue = async (queue, payload) => {
  await getFunctions().taskQueue(taskQueueName(queue)).enqueue(payload, { dispatchDeadlineSeconds: 1800 });
};

function progressRef(db: Firestore, jobId: string) {
  return db.collection(MATCH_COLLECTION).doc(jobId).collection(TRACKING_COLLECTION).doc('progress');
}

export type StartResult = { status: 'started' | 'running' | 'complete' | 'blocked'; generation: number; segments: number;
  blocked?: ProgressBlock };

/**
 * Starts (or resumes) the progressive analysis for an owned job. Idempotent: a running or
 * finished analysis is returned as is; an interrupted one is resumed from its unfinished
 * segments (finished segments are cached and never processed twice).
 */
export async function startAnalysis(db: Firestore, uid: string, jobId: string, enqueue: Enqueue,
  env: NodeJS.ProcessEnv = process.env, now = new Date(), notify?: TrackingNotifier): Promise<StartResult> {
  if (!JOB_ID.test(jobId)) throw new HttpsError('invalid-argument', 'Invalid analysis.');
  const jobRef = db.collection(MATCH_COLLECTION).doc(jobId);
  const ready = trackingV3Enabled(env) && cvWorkerStatus(env) === 'available';
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef);
    const consent = await tx.get(db.collection(VIDEO_CONSENT_COLLECTION).doc(jobId));
    const prog = await tx.get(progressRef(db, jobId));
    if (!snap.exists) throw new HttpsError('not-found', 'Analysis not found.');
    const job = snap.data() as MatchJobDoc;
    if (job.playerId !== uid) throw new HttpsError('permission-denied', 'Only the owner can start this analysis.');
    const at = now.toISOString();
    const existing = prog.exists ? prog.data() as TrackingProgress : null;
    const block: ProgressBlock | null = !consent.exists || consent.get('uid') !== uid || consent.get('revokedAt') !== null
      || consent.get('policyVersion') !== VIDEO_CONSENT_VERSION ? 'consent_required'
      : !job.videoStoragePath || !(job.measuredDurationSec ?? job.durationSec) ? 'source_missing'
        : !ready ? 'worker_unavailable' : null;
    if (block) {
      const p = existing ?? newProgress(1, job.measuredDurationSec ?? job.durationSec ?? 0, at);
      tx.set(progressRef(db, jobId), { ...p, blocked: block, updatedAt: at });
      return { status: 'blocked' as const, generation: p.generation, segments: p.plan.length, blocked: block, toQueue: [] as number[], discoveryQueue: [] as number[], pendingSegments: [] as number[], job };
    }
    if (existing && !existing.outcome && !existing.blocked) {
      return { status: existing.full ? 'complete' as const : 'running' as const, generation: existing.generation,
        segments: existing.plan.length, toQueue: [] as number[], discoveryQueue: [] as number[], pendingSegments: [] as number[], job };
    }
    // New analysis, or resume after an interruption/block: same generation keeps finished segments.
    const duration = job.measuredDurationSec ?? job.durationSec;
    const fresh = !(existing && existing.plan.length > 0);
    const base = fresh || !existing ? newProgress((existing?.generation ?? 0) + 1, duration, at) : existing;
    // 4.1: with a shirt number, an early discovery pass runs first and finds playable sightings.
    const discovery = fresh
      ? (/^[0-9]{1,3}$/.test(job.targeting?.jerseyNumber ?? '') ? planDiscovery(duration) : null)
      : base.discovery ?? null;
    const discoveryQueue = discovery && !discoveryFinished(discovery)
      ? discovery.chunks.filter((c) => discovery.state[String(c.index)]?.status === 'queued').map((c) => c.index) : [];
    const segments: Record<string, SegmentState> = { ...base.segments };
    const pendingSegments: number[] = [];
    for (const s of base.plan) {
      const st = segments[String(s.index)];
      if (st?.status !== 'done') {
        segments[String(s.index)] = { status: 'queued', attempts: 0 };
        pendingSegments.push(s.index);
      }
    }
    // Extraction waits for discovery (it is then queued sightings-first by the last discovery task).
    const waitForDiscovery = discoveryQueue.length > 0;
    const toQueue = waitForDiscovery ? [] : prioritisedSegments(base.plan, discovery?.sightingTimes ?? [])
      .filter((i) => pendingSegments.includes(i));
    const nextDiscovery = discovery ? { ...discovery, extractionQueued: !waitForDiscovery } : null;
    tx.set(progressRef(db, jobId), { ...base, segments, discovery: nextDiscovery, outcome: null, blocked: null, updatedAt: at,
      startedAt: existing?.outcome ? at : base.startedAt });
    return { status: 'started' as const, generation: base.generation, segments: base.plan.length, toQueue, discoveryQueue,
      pendingSegments, job };
  });
  for (const index of result.discoveryQueue) {
    await enqueue('discoverTrackingTask', { jobId, generation: result.generation, index });
  }
  for (const index of result.toQueue) {
    await enqueue('extractTrackingSegmentTask', { jobId, generation: result.generation, index });
  }
  if (result.status === 'started' && result.pendingSegments.length === 0) {
    // Every segment was already cached: only the report needs (re)building.
    await enqueue('resolveTrackingTask', { jobId, feedbackRevision: 0, scope: 'full' });
  }
  if (result.status === 'started') {
    // In-app activity only: "analysis_started" has no push category, so it never interrupts.
    await (notify ?? ((id, input) => writeSystemActivity(db, id, input)))(
      notificationId('started', jobId, result.generation), { recipientId: uid, recipientRole: 'player',
        type: 'analysis_started', category: 'analysis', title: 'Analysis started',
        body: 'PitchProof is finding your moments. You can leave the app; we will let you know when they are ready.',
        reference: { entityType: 'match_analysis', entityId: jobId, label: 'Match analysis' } });
  }
  return { status: result.status, generation: result.generation, segments: result.segments,
    ...(result.status === 'blocked' ? { blocked: result.blocked } : {}) };
}

export type ExtractOutcome = 'done' | 'cached' | 'stale' | 'cancelled' | 'retry' | 'failed' | 'unavailable';

/**
 * One segment of stage 1. `attempt` is the Cloud Tasks retry count (0-based); a failure on the
 * last attempt marks the analysis interrupted and notifies the owner once.
 */
export async function processExtractTask(db: Firestore, jobId: string, generation: number, index: number, attempt: number,
  client: TrackingWorkerClient | null, enqueue: Enqueue, env: NodeJS.ProcessEnv = process.env,
  sourceUrl: (path: string) => Promise<string> = async (p) => (await readableSourceFor(p, 60 * 60 * 1000)).url,
  now: () => Date = () => new Date(), notify?: TrackingNotifier): Promise<ExtractOutcome> {
  const ref = progressRef(db, jobId);
  const jobSnap = await db.collection(MATCH_COLLECTION).doc(jobId).get();
  const job = jobSnap.data() as MatchJobDoc | undefined;
  const progSnap = await ref.get();
  const prog = progSnap.exists ? progSnap.data() as TrackingProgress : null;
  if (!job || !prog || prog.generation !== generation || prog.outcome) return 'stale';
  if (job.cancelRequested) {
    await ref.set({ outcome: 'cancelled', updatedAt: now().toISOString() }, { merge: true });
    return 'cancelled';
  }
  const seg = prog.plan.find((s) => s.index === index);
  if (!seg || prog.segments[String(index)]?.status === 'done') return 'stale';
  if (!client || !trackingV3Enabled(env) || cvWorkerStatus(env) !== 'available' || !job.videoStoragePath) {
    await ref.set({ blocked: 'worker_unavailable', updatedAt: now().toISOString() }, { merge: true });
    return 'unavailable';
  }
  await ref.set({ segments: { [String(index)]: { status: 'running', attempts: attempt + 1, startedAt: now().toISOString() } },
    updatedAt: now().toISOString() }, { merge: true });
  const res = await client({
    contractVersion: 3, jobId, segmentIndex: index, startSec: seg.startSec, endSec: seg.endSec,
    source: { url: await sourceUrl(job.videoStoragePath) },
    privacy: { retainNonTargetIdentities: false, faceRecognition: false, persistMedia: false },
  }) as { status?: string; processingSec?: unknown } | null;
  const at = now().toISOString();
  if (!res || (res.status !== 'complete' && res.status !== 'cached')) {
    const last = attempt + 1 >= EXTRACT_MAX_ATTEMPTS;
    await ref.set({ segments: { [String(index)]: { status: last ? 'failed' : 'queued', attempts: attempt + 1 } },
      ...(last ? { outcome: 'interrupted' } : {}), updatedAt: at }, { merge: true });
    if (!last) return 'retry';
    await (notify ?? ((id, input) => writeSystemActivity(db, id, input)))(notificationId('interrupted', jobId, generation), {
      recipientId: job.playerId, recipientRole: 'player', type: 'analysis_interrupted', category: 'analysis',
      title: 'Analysis paused', body: 'Part of your match could not be analysed. Open it to resume - finished parts are kept.',
      reference: { entityType: 'match_analysis', entityId: jobId, label: 'Match analysis' } });
    return 'failed';
  }
  const processingSec = typeof res.processingSec === 'number' && Number.isFinite(res.processingSec) && res.processingSec >= 0
    ? res.processingSec : undefined;
  // Mark done and decide the next step atomically, so concurrent segments agree on who triggers what.
  const next = await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(ref)).data() as TrackingProgress | undefined;
    if (!fresh || fresh.generation !== generation) return null;
    const segments = { ...fresh.segments, [String(index)]: { status: 'done' as const, attempts: attempt + 1, doneAt: at,
      ...(processingSec !== undefined ? { processingSec } : {}) } };
    const done = doneCount({ segments });
    const total = fresh.plan.length;
    let resolve: 'preliminary' | 'full' | null = null;
    if (done >= total) resolve = 'full';
    else if (fresh.resolving === null && shouldResolvePreliminary(done, total, fresh.preliminary?.moments ?? null)) resolve = 'preliminary';
    tx.set(ref, { segments, updatedAt: at, ...(resolve ? { resolving: resolve } : {}) }, { merge: true });
    return resolve;
  });
  if (next) await enqueue('resolveTrackingTask', { jobId, feedbackRevision: 0, scope: next });
  return res.status === 'cached' ? 'cached' : 'done';
}

export type DiscoverOutcome = 'done' | 'stale' | 'cancelled' | 'retry' | 'failed' | 'unavailable' | 'rejected';

export const DISCOVERY_COLLECTION_DOC = 'discovery';

/**
 * One chunk of the early discovery pass. Sightings (target number read) are validated, their
 * thumbnails stored owner-only and merged into tracking/discovery immediately, so the player can
 * watch them while the full pass has not even started. The last chunk queues extraction with
 * segments containing sightings first.
 */
export async function processDiscoverTask(db: Firestore, jobId: string, generation: number, index: number, attempt: number,
  client: TrackingWorkerClient | null, enqueue: Enqueue, env: NodeJS.ProcessEnv = process.env,
  sourceUrl: (path: string) => Promise<string> = async (p) => (await readableSourceFor(p, 60 * 60 * 1000)).url,
  now: () => Date = () => new Date(), notify?: TrackingNotifier, storeImage: ImageStore = storageImageStore): Promise<DiscoverOutcome> {
  const ref = progressRef(db, jobId);
  const job = (await db.collection(MATCH_COLLECTION).doc(jobId).get()).data() as MatchJobDoc | undefined;
  const prog = (await ref.get()).data() as TrackingProgress | undefined;
  const d = prog?.discovery;
  if (!job || !prog || !d || prog.generation !== generation || prog.outcome) return 'stale';
  if (job.cancelRequested) {
    await ref.set({ outcome: 'cancelled', updatedAt: now().toISOString() }, { merge: true });
    return 'cancelled';
  }
  const chunk = d.chunks.find((c) => c.index === index);
  if (!chunk || d.state[String(index)]?.status !== 'queued') return 'stale';
  if (!client || !trackingV3Enabled(env) || cvWorkerStatus(env) !== 'available' || !job.videoStoragePath) return 'unavailable';
  const number = job.targeting?.jerseyNumber ?? '';
  const res = await client({
    contractVersion: 3, jobId, chunkIndex: index, startSec: chunk.startSec, endSec: chunk.endSec,
    source: { url: await sourceUrl(job.videoStoragePath) },
    target: { jerseyNumber: number, kitPrimaryColor: job.targeting?.kitPrimaryColor ?? '' },
    privacy: { retainNonTargetIdentities: false, faceRecognition: false, persistMedia: false },
  }) as { status?: string; moments?: unknown; processingSec?: unknown } | null;
  const at = now().toISOString();
  const lastAttempt = attempt + 1 >= EXTRACT_MAX_ATTEMPTS;
  let moments: TrackingMoment[] | null = null;
  if (res && (res.status === 'complete' || res.status === 'no_number')) {
    moments = parseDiscoveryMoments(res.moments ?? [], chunk, prog.durationSec, number);
    if (!moments) return finishDiscovery(db, jobId, generation, index, 'failed', [], at, enqueue, null, notify, job.playerId, 'rejected');
  } else if (!lastAttempt) {
    await ref.set({ discovery: { state: { [String(index)]: { status: 'queued', attempts: attempt + 1 } } }, updatedAt: at }, { merge: true });
    return 'retry';
  }
  const raw = new Map<string, unknown>(((res?.moments ?? []) as Array<{ id?: unknown; imageJpegBase64?: unknown }>)
    .map((m) => [String(m?.id), m?.imageJpegBase64]));
  for (const m of moments ?? []) {
    const jpeg = decodeReviewImage(raw.get(m.id));
    if (!jpeg) continue;
    const path = reviewImagePath(job.playerId, jobId, `${m.id}_g${generation}`);
    await storeImage(path, jpeg);
    m.imagePath = path;
  }
  const processingSec = typeof res?.processingSec === 'number' && Number.isFinite(res.processingSec) ? res.processingSec : undefined;
  return finishDiscovery(db, jobId, generation, index, moments ? 'done' : 'failed', moments ?? [], at, enqueue, processingSec ?? null,
    notify, job.playerId, moments ? 'done' : 'failed');
}

async function finishDiscovery(db: Firestore, jobId: string, generation: number, index: number, status: 'done' | 'failed',
  moments: TrackingMoment[], at: string, enqueue: Enqueue, processingSec: number | null, notify: TrackingNotifier | undefined,
  playerId: string, outcome: DiscoverOutcome): Promise<DiscoverOutcome> {
  const ref = progressRef(db, jobId);
  const docRef = db.collection(MATCH_COLLECTION).doc(jobId).collection(TRACKING_COLLECTION).doc(DISCOVERY_COLLECTION_DOC);
  const next = await db.runTransaction(async (tx) => {
    const prog = (await tx.get(ref)).data() as TrackingProgress | undefined;
    const cur = (await tx.get(docRef)).data() as { moments?: TrackingMoment[] } | undefined;
    if (!prog?.discovery || prog.generation !== generation) return null;
    const d: DiscoveryProgress = { ...prog.discovery, state: { ...prog.discovery.state,
      [String(index)]: { status, attempts: (prog.discovery.state[String(index)]?.attempts ?? 0) + 1, doneAt: at,
        moments: moments.length, ...(processingSec !== null ? { processingSec } : {}) } } };
    const merged = [...(cur?.moments ?? []).filter((m) => !moments.some((n) => n.id === m.id)), ...moments]
      .sort((a, b) => a.clipStart - b.clipStart);
    const first = d.firstMomentAt === null && merged.length > 0;
    if (first) d.firstMomentAt = at;
    d.sightingTimes = merged.map((m) => m.start);
    const finished = discoveryFinished(d);
    const queueExtraction = finished && !d.extractionQueued;
    if (queueExtraction) d.extractionQueued = true;
    tx.set(docRef, { moments: merged, generation, updatedAt: at });
    tx.set(ref, { discovery: d, updatedAt: at }, { merge: true });
    const pending = prog.plan.map((s) => s.index).filter((i) => prog.segments[String(i)]?.status !== 'done');
    return { first, queueExtraction, order: prioritisedSegments(prog.plan, d.sightingTimes).filter((i) => pending.includes(i)) };
  });
  if (!next) return 'stale';
  if (next.first) {
    await (notify ?? ((id, input) => writeSystemActivity(db, id, input)))(notificationId('first_moments', jobId, generation), {
      recipientId: playerId, recipientRole: 'player', type: 'analysis_first_moments', category: 'analysis',
      title: 'Your first moments are ready', body: 'We found you on video. Watch your first moments while the rest of the match is analysed.',
      reference: { entityType: 'match_analysis', entityId: jobId, label: 'Match analysis' } });
  }
  if (next.queueExtraction) {
    for (const i of next.order) await enqueue('extractTrackingSegmentTask', { jobId, generation, index: i });
  }
  return outcome;
}

export const discoverTrackingTask = onTaskDispatched(
  { retryConfig: { maxAttempts: EXTRACT_MAX_ATTEMPTS, minBackoffSeconds: 30 }, rateLimits: { maxConcurrentDispatches: 6 },
    timeoutSeconds: 1800, memory: '512MiB' },
  async (request) => {
    const d = request.data as { jobId?: unknown; generation?: unknown; index?: unknown };
    if (typeof d.jobId !== 'string' || !JOB_ID.test(d.jobId) || !Number.isSafeInteger(d.generation)
      || !Number.isSafeInteger(d.index)) return;
    const url = cvWorkerUrl();
    const outcome = await processDiscoverTask(getFirestore(), d.jobId, d.generation as number, d.index as number,
      request.retryCount ?? 0, url ? httpTrackingClient(url, process.env, 'discover', 28 * 60 * 1000) : null, cloudTasksEnqueue);
    if (outcome === 'retry') throw new Error('discovery chunk failed; retrying');
  },
);

export const startPlayerAnalysis = onCall(createCallableOptions(), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const jobId = (request.data as { jobId?: unknown } | undefined)?.jobId;
  if (typeof jobId !== 'string') throw new HttpsError('invalid-argument', 'Invalid analysis.');
  await assertCallableRateLimit(uid, PLAYER_ANALYSIS_START_LIMIT);
  return startAnalysis(getFirestore(), uid, jobId, cloudTasksEnqueue);
});

export const extractTrackingSegmentTask = onTaskDispatched(
  { retryConfig: { maxAttempts: EXTRACT_MAX_ATTEMPTS, minBackoffSeconds: 60 }, rateLimits: { maxConcurrentDispatches: 6 },
    timeoutSeconds: 1800, memory: '512MiB' },
  async (request) => {
    const d = request.data as { jobId?: unknown; generation?: unknown; index?: unknown };
    if (typeof d.jobId !== 'string' || !JOB_ID.test(d.jobId) || !Number.isSafeInteger(d.generation)
      || !Number.isSafeInteger(d.index)) return;
    const url = cvWorkerUrl();
    const outcome = await processExtractTask(getFirestore(), d.jobId, d.generation as number, d.index as number,
      request.retryCount ?? 0, url ? httpTrackingClient(url, process.env, 'extract', 28 * 60 * 1000) : null, cloudTasksEnqueue);
    // Throwing hands the retry (with backoff) to Cloud Tasks; finished segments are cached on the worker.
    if (outcome === 'retry') throw new Error('segment extraction failed; retrying');
  },
);
