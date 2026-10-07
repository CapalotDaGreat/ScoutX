import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { readableSourceFor } from '../uploads/mediaSource';
import { planFor } from '../entitlements/quotaService';
import {
  failJob,
  MATCH_COLLECTION,
  MIN_ANALYSIS_FRAMES,
  pipelineStateOf,
  runFrameAnalysis,
  type JobFrame,
  type MatchJobDoc,
} from './frameAnalysis';
import {
  extractionArgs,
  frameIndexFor,
  parseShowinfoTimes,
  planSegments,
  segmentsSettled,
  type SegmentPlan,
  type SegmentRecord,
} from './segments';
import { initialStages, parseStages, updateStage } from './stages';
import { canTransitionPipeline } from './stateMachine';
import { getTaskDispatcher, parseAnalysisTask, type AnalysisTask, type TaskDispatcher } from './taskDispatcher';

const openRouterApiKey = defineSecret('OPENROUTER_API_KEY');

/** Jobs beyond the plan's concurrent-job cap wait in the queue and are re-delivered later. */
export const CONCURRENCY_RETRY_DELAY_SEC = 120;
export const TASK_MAX_ATTEMPTS = 3;
const EXTRACT_TIMEOUT_MS = 8 * 60 * 1000;

export interface FrameExtractor {
  extract(params: { uid: string; jobId: string; videoPath: string; segment: SegmentPlan }): Promise<JobFrame[]>;
}

function runFfmpeg(args: string[], cwd: string): Promise<string> {
  const binary = ffmpegStatic;
  if (!binary) return Promise.reject(new Error('ffmpeg binary unavailable'));
  return new Promise((resolve, reject) => {
    execFile(binary, args, { cwd, timeout: EXTRACT_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 }, (error, _stdout, stderr) => {
      if (error) reject(new Error(`ffmpeg failed (${error.code ?? 'signal'})`));
      else resolve(String(stderr));
    });
  });
}

/** Scene-adaptive key-frame extraction streamed from storage; frames go to the owner's private path. */
export const ffmpegFrameExtractor: FrameExtractor = {
  async extract({ uid, jobId, videoPath, segment }) {
    const workDir = await mkdtemp(join(tmpdir(), 'scoutx-frames-'));
    try {
      const source = await readableSourceFor(videoPath, 30 * 60 * 1000);
      const stderr = await runFfmpeg(
        extractionArgs({
          sourceUrl: source.url,
          headers: source.headers,
          startSec: segment.startSec,
          durationSec: segment.endSec - segment.startSec,
          outputPattern: join(workDir, 'f_%03d.jpg'),
        }),
        workDir,
      );
      const times = parseShowinfoTimes(stderr);
      const files = (await readdir(workDir)).filter((name) => name.endsWith('.jpg')).sort();
      const bucket = getStorage().bucket();
      const frames: JobFrame[] = [];
      for (const [position, name] of files.entries()) {
        const index = frameIndexFor(segment.index, position);
        const storagePath = `profiles/${uid}/matchFootage/${jobId}/frames/frame_${index}.jpg`;
        await bucket.upload(join(workDir, name), {
          destination: storagePath,
          contentType: 'image/jpeg',
          metadata: { metadata: { ownerId: uid, jobId } },
        });
        const offset = times[position] ?? 0;
        frames.push({
          id: `frame_${index}`,
          index,
          timestampSec: Math.min(segment.endSec, Math.round(segment.startSec + offset)),
          storagePath,
          downloadUrl: '',
          source: 'server',
        });
      }
      return frames;
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  },
};

let activeExtractor: FrameExtractor = ffmpegFrameExtractor;

export function setFrameExtractor(extractor: FrameExtractor): void {
  activeExtractor = extractor;
}

/**
 * VALIDATING → QUEUED: plans 10-minute segments and enqueues one extraction task each.
 * Called after the video leaves quarantine and for retries; ignored for jobs in other states.
 */
export async function startMatchPipeline(
  db: Firestore,
  jobId: string,
  dispatcher: TaskDispatcher = getTaskDispatcher(),
): Promise<'queued' | 'skipped' | 'failed'> {
  const jobRef = db.collection(MATCH_COLLECTION).doc(jobId);
  const planned = await db.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef);
    if (!snap.exists) return null;
    const job = snap.data() as MatchJobDoc;
    const state = pipelineStateOf(job);
    if (job.cancelRequested || !job.videoStoragePath || !canTransitionPipeline(state, 'queued') || state === 'queued') {
      return null;
    }
    const duration = job.measuredDurationSec ?? job.durationSec ?? 0;
    const plans = planSegments(duration);
    if (plans.length === 0) return null;
    const generation = (job.pipelineGeneration ?? 0) + 1;
    const now = new Date().toISOString();
    const segments: SegmentRecord[] = plans.map((plan) => ({ ...plan, state: 'pending', frameCount: 0, attempts: 0, error: null }));
    tx.update(jobRef, {
      status: 'queued',
      pipelineState: 'queued',
      pipelineGeneration: generation,
      extractionSegments: segments,
      frames: [],
      attempts: 0,
      lease: null,
      error: null,
      errorCode: null,
      pipelineStages: updateStage(initialStages(), 'video-ingestion', 'complete', now),
      queuedAt: now,
      updatedAt: now,
    });
    return { generation, segments };
  });
  if (!planned) return 'skipped';
  try {
    for (const segment of planned.segments) {
      await dispatcher.enqueue({ kind: 'extract_segment', jobId, generation: planned.generation, segmentIndex: segment.index });
    }
    return 'queued';
  } catch (error) {
    logger.error('Could not enqueue analysis tasks', { jobId, message: error instanceof Error ? error.message : 'unknown' });
    await failJob(db, jobId, 'queue_unavailable');
    return 'failed';
  }
}

type ClaimResult =
  | { kind: 'run'; job: MatchJobDoc; segment: SegmentRecord }
  | { kind: 'deferred' }
  | { kind: 'skip' };

async function claimSegment(db: Firestore, task: Extract<AnalysisTask, { kind: 'extract_segment' }>): Promise<ClaimResult> {
  const jobRef = db.collection(MATCH_COLLECTION).doc(task.jobId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef);
    if (!snap.exists) return { kind: 'skip' };
    const job = snap.data() as MatchJobDoc;
    if (job.pipelineGeneration !== task.generation) return { kind: 'skip' };
    const now = new Date().toISOString();
    if (job.cancelRequested) {
      if (job.status !== 'cancelled') tx.update(jobRef, { status: 'cancelled', pipelineState: 'cancelled', updatedAt: now });
      return { kind: 'skip' };
    }
    const state = pipelineStateOf(job);
    let stages = parseStages(job.pipelineStages);
    if (state === 'queued') {
      const plan = await planFor(db, job.playerId, tx);
      const active = await tx.get(
        db.collection(MATCH_COLLECTION)
          .where('playerId', '==', job.playerId)
          .where('pipelineState', 'in', ['extracting', 'analyzing']),
      );
      if (active.docs.filter((doc) => doc.id !== task.jobId).length >= plan.maxConcurrentJobs) return { kind: 'deferred' };
      stages = updateStage(stages, 'frame-extraction', 'active', now);
    } else if (state !== 'extracting') {
      return { kind: 'skip' };
    }
    const segments = [...(job.extractionSegments ?? [])];
    const segment = segments[task.segmentIndex];
    if (!segment || segment.state === 'complete' || segment.state === 'failed') return { kind: 'skip' };
    const running: SegmentRecord = { ...segment, state: 'running', attempts: segment.attempts + 1, error: null };
    segments[task.segmentIndex] = running;
    tx.update(jobRef, {
      status: 'processing',
      pipelineState: 'extracting',
      extractionSegments: segments,
      pipelineStages: stages,
      updatedAt: now,
    });
    return { kind: 'run', job, segment: running };
  });
}

/**
 * Records a segment outcome. When every segment is settled the job moves to ANALYZING (enough
 * frames) or FAILED (extraction_failed); returns true when the analysis task should be queued.
 */
async function settleSegment(
  db: Firestore,
  task: Extract<AnalysisTask, { kind: 'extract_segment' }>,
  outcome: { state: 'complete'; frames: JobFrame[] } | { state: 'failed' | 'pending'; error: string },
): Promise<boolean> {
  const jobRef = db.collection(MATCH_COLLECTION).doc(task.jobId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef);
    if (!snap.exists) return false;
    const job = snap.data() as MatchJobDoc;
    if (job.pipelineGeneration !== task.generation || pipelineStateOf(job) !== 'extracting') return false;
    const segments = [...(job.extractionSegments ?? [])];
    const segment = segments[task.segmentIndex];
    if (!segment) return false;
    const now = new Date().toISOString();
    let frames = Array.isArray(job.frames) ? job.frames : [];
    if (outcome.state === 'complete') {
      const low = frameIndexFor(task.segmentIndex, 0);
      frames = [...frames.filter((frame) => frame.index < low || frame.index >= low + 100), ...outcome.frames]
        .sort((a, b) => a.timestampSec - b.timestampSec);
      segments[task.segmentIndex] = { ...segment, state: 'complete', frameCount: outcome.frames.length, error: null };
    } else {
      segments[task.segmentIndex] = { ...segment, state: outcome.state, error: outcome.error };
    }
    const update: Record<string, unknown> = { extractionSegments: segments, frames, updatedAt: now };
    let queueAnalysis = false;
    if (segmentsSettled(segments)) {
      const stages = parseStages(job.pipelineStages);
      if (frames.length >= MIN_ANALYSIS_FRAMES) {
        update.pipelineState = 'analyzing';
        update.pipelineStages = updateStage(stages, 'frame-extraction', 'complete', now);
        queueAnalysis = true;
      } else {
        update.status = 'failed';
        update.pipelineState = 'failed';
        update.errorCode = 'extraction_failed';
        update.error = 'Key frames could not be extracted from this video.';
        update.pipelineStages = updateStage(stages, 'frame-extraction', 'failed', now, { retryable: true });
      }
    }
    tx.update(jobRef, update);
    return queueAnalysis;
  });
}

export async function processExtractTask(
  db: Firestore,
  task: Extract<AnalysisTask, { kind: 'extract_segment' }>,
  options: { finalAttempt: boolean; dispatcher?: TaskDispatcher; extractor?: FrameExtractor },
): Promise<'done' | 'deferred' | 'skipped'> {
  const dispatcher = options.dispatcher ?? getTaskDispatcher();
  const claim = await claimSegment(db, task);
  if (claim.kind === 'skip') return 'skipped';
  if (claim.kind === 'deferred') {
    await dispatcher.enqueue(task, { delaySeconds: CONCURRENCY_RETRY_DELAY_SEC });
    return 'deferred';
  }
  let queueAnalysis: boolean;
  try {
    const frames = await (options.extractor ?? activeExtractor).extract({
      uid: claim.job.playerId,
      jobId: task.jobId,
      videoPath: claim.job.videoStoragePath ?? '',
      segment: claim.segment,
    });
    queueAnalysis = await settleSegment(db, task, { state: 'complete', frames });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    logger.warn('Segment extraction failed', { jobId: task.jobId, segment: task.segmentIndex, message });
    if (!options.finalAttempt) {
      await settleSegment(db, task, { state: 'pending', error: 'retrying' });
      throw error;
    }
    // Dead letter: the segment is marked failed and the job continues with the frames it has.
    queueAnalysis = await settleSegment(db, task, { state: 'failed', error: 'extraction_failed' });
  }
  if (queueAnalysis) {
    await dispatcher.enqueue({ kind: 'analyze_frames', jobId: task.jobId, generation: task.generation });
  }
  return 'done';
}

export async function processAnalyzeTask(
  db: Firestore,
  task: Extract<AnalysisTask, { kind: 'analyze_frames' }>,
  options: { finalAttempt: boolean; apiKey: string },
): Promise<'complete' | 'failed' | 'skipped'> {
  const snap = await db.collection(MATCH_COLLECTION).doc(task.jobId).get();
  if (!snap.exists) return 'skipped';
  const job = snap.data() as MatchJobDoc & { errorCode?: string };
  if (job.pipelineGeneration !== task.generation) return 'skipped';
  const state = pipelineStateOf(job);
  const retrying = state === 'failed' && job.errorCode === 'model_unavailable';
  if (job.cancelRequested || (state !== 'analyzing' && !retrying)) return 'skipped';
  if (!options.apiKey) {
    await failJob(db, task.jobId, 'model_unavailable');
    return 'failed';
  }
  try {
    await runFrameAnalysis({
      db,
      uid: job.playerId,
      jobId: task.jobId,
      requestId: `task:${task.jobId}:${task.generation}`,
      apiKey: options.apiKey,
    });
    return 'complete';
  } catch (error) {
    const transient = error instanceof HttpsError && error.code === 'unavailable';
    if (transient && !options.finalAttempt) throw error;
    return 'failed';
  }
}

const TASK_RETRY = { maxAttempts: TASK_MAX_ATTEMPTS, minBackoffSeconds: 30, maxBackoffSeconds: 600 };

export const extractMatchSegment = onTaskDispatched(
  {
    retryConfig: TASK_RETRY,
    rateLimits: { maxConcurrentDispatches: 6 },
    memory: '2GiB',
    cpu: 2,
    timeoutSeconds: 900,
  },
  async (request) => {
    const task = parseAnalysisTask(request.data);
    if (!task || task.kind !== 'extract_segment') return;
    await processExtractTask(getFirestore(), task, { finalAttempt: request.retryCount >= TASK_MAX_ATTEMPTS - 1 });
  },
);

export const analyzeMatchFrames = onTaskDispatched(
  {
    retryConfig: TASK_RETRY,
    rateLimits: { maxConcurrentDispatches: 4 },
    secrets: [openRouterApiKey],
    memory: '1GiB',
    timeoutSeconds: 300,
  },
  async (request) => {
    const task = parseAnalysisTask(request.data);
    if (!task || task.kind !== 'analyze_frames') return;
    await processAnalyzeTask(getFirestore(), task, {
      finalAttempt: request.retryCount >= TASK_MAX_ATTEMPTS - 1,
      apiKey: openRouterApiKey.value(),
    });
  },
);
