import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { onDocumentDeleted, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { readableSourceFor } from '../uploads/mediaSource';
import { footageMediaId } from '../uploads/model';

/**
 * Media lifecycle for match analysis. Source videos and extracted frames are temporary:
 *  - the source video is deleted after analysis unless the player chose "Keep match video";
 *  - every frame or intermediate that no generated observation cites is deleted;
 *  - only the minimal owner-private evidence frames that substantiate the report remain;
 *  - short evidence clips are cut only when the player explicitly asked for them.
 */

export const LIFECYCLE = {
  failedRetryHours: 24,
  keepForRetryDays: 7,
  maxIdentityFrames: 6,
  maxEvidenceClips: 6,
  clipHalfWindowSec: 4,
  clipMinGapSec: 10,
  sweepBatch: 50,
  abandonedUploadDays: 7,
} as const;

const TERMINAL = ['complete', 'failed', 'cancelled', 'expired'] as const;
export type CleanupState = 'retry_window' | 'pending' | 'done';

type FrameRef = { id?: string; index?: number; timestampSec?: number; storagePath?: string };

export type LifecycleJob = {
  playerId: string;
  status: string;
  retainSource?: boolean;
  keepForRetry?: boolean;
  evidenceClipsRequested?: boolean;
  videoStoragePath?: string | null;
  measuredDurationSec?: number;
  durationSec?: number;
  frames?: FrameRef[];
  report?: Record<string, unknown> | null;
  pendingCoaching?: unknown;
  identityConfirmation?: { state?: string; frameIds?: string[] } | null;
};

export type ClipPlan = { index: number; startSec: number; durationSec: number; timestampSec: number; frameIds: string[] };

export type LifecyclePlan = {
  deleteSource: boolean;
  keepFrameIds: string[];
  clips: ClipPlan[];
};

export function isTerminalStatus(status: unknown): boolean {
  return typeof status === 'string' && (TERMINAL as readonly string[]).includes(status);
}

export function jobMediaPrefix(uid: string, jobId: string): string {
  return `profiles/${uid}/matchFootage/${jobId}/`;
}

function frameIdOf(frame: FrameRef): string | null {
  if (typeof frame.id === 'string' && frame.id) return frame.id;
  return typeof frame.index === 'number' ? `frame_${frame.index}` : null;
}

/** Every frame id the report cites, at any depth (evidence, ratings, clip claims, coaching). */
export function citedFrameIds(report: unknown): Set<string> {
  const cited = new Set<string>();
  const visit = (value: unknown, depth: number): void => {
    if (depth > 8 || value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if ((key === 'frameIds' || key === 'evidenceFrameIds') && Array.isArray(child)) {
        for (const id of child) if (typeof id === 'string' && id) cited.add(id);
      } else if (key === 'frameId' && typeof child === 'string' && child) {
        cited.add(child);
      } else {
        visit(child, depth + 1);
      }
    }
  };
  visit(report, 0);
  return cited;
}

/** Frames the player confirmed as "this is me" substantiate identity; a few are enough. */
function identityFrameIds(job: LifecycleJob): string[] {
  const confirmation = job.identityConfirmation;
  if (confirmation?.state !== 'confirmed' || !Array.isArray(confirmation.frameIds)) return [];
  return confirmation.frameIds.filter((id) => typeof id === 'string').slice(0, LIFECYCLE.maxIdentityFrames);
}

type EvidenceItem = { kind?: unknown; timestampSec?: unknown; frameIds?: unknown };

/** Clip windows around the strongest cited observations, de-duplicated and bounded. */
export function planEvidenceClips(job: LifecycleJob): ClipPlan[] {
  if (!job.evidenceClipsRequested || job.status !== 'complete' || !job.videoStoragePath) return [];
  const duration = job.measuredDurationSec ?? job.durationSec ?? 0;
  if (!(duration > 0)) return [];
  const evidence = Array.isArray(job.report?.evidence) ? (job.report?.evidence as EvidenceItem[]) : [];
  const clips: ClipPlan[] = [];
  for (const item of evidence) {
    if (clips.length >= LIFECYCLE.maxEvidenceClips) break;
    if (item.kind !== 'observation' || typeof item.timestampSec !== 'number' || !Number.isFinite(item.timestampSec)) continue;
    const at = item.timestampSec;
    if (clips.some((clip) => Math.abs(clip.timestampSec - at) < LIFECYCLE.clipMinGapSec)) continue;
    const startSec = Math.max(0, at - LIFECYCLE.clipHalfWindowSec);
    const endSec = Math.min(duration, at + LIFECYCLE.clipHalfWindowSec);
    if (endSec - startSec < 1) continue;
    const frameIds = Array.isArray(item.frameIds) ? item.frameIds.filter((id): id is string => typeof id === 'string') : [];
    clips.push({ index: clips.length, startSec, durationSec: endSec - startSec, timestampSec: at, frameIds });
  }
  return clips;
}

/** Pure: what to delete and what to keep once a job is settled. */
export function planMediaLifecycle(job: LifecycleJob): LifecyclePlan {
  const known = new Set((job.frames ?? []).map(frameIdOf).filter((id): id is string => Boolean(id)));
  const keep = new Set<string>();
  if (job.status === 'complete') {
    for (const id of citedFrameIds([job.report, job.pendingCoaching])) if (known.has(id)) keep.add(id);
    for (const id of identityFrameIds(job)) if (known.has(id)) keep.add(id);
  }
  return {
    deleteSource: job.retainSource !== true,
    keepFrameIds: [...keep].sort(),
    clips: planEvidenceClips(job),
  };
}

/** When a settled job's media may be cleaned: now, or after a short window to allow a retry. */
export function cleanupDueAt(job: Pick<LifecycleJob, 'status' | 'keepForRetry'>, now: Date): Date {
  if (job.status !== 'failed') return now;
  const hours = job.keepForRetry === true ? LIFECYCLE.keepForRetryDays * 24 : LIFECYCLE.failedRetryHours;
  return new Date(now.getTime() + hours * 3_600_000);
}

export interface ClipCutter {
  cut(params: { videoPath: string; clip: ClipPlan; destination: string; ownerId: string; jobId: string }): Promise<void>;
}

function runFfmpeg(args: string[], cwd: string): Promise<void> {
  const binary = ffmpegStatic;
  if (!binary) return Promise.reject(new Error('ffmpeg binary unavailable'));
  return new Promise((resolve, reject) => {
    execFile(binary, args, { cwd, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 }, (error) => {
      if (error) reject(new Error(`ffmpeg failed (${error.code ?? 'signal'})`));
      else resolve();
    });
  });
}

/** Short, silent 480p clips; only the requested window is streamed from storage. */
export const ffmpegClipCutter: ClipCutter = {
  async cut({ videoPath, clip, destination, ownerId, jobId }) {
    const workDir = await mkdtemp(join(tmpdir(), 'scoutx-clip-'));
    try {
      const source = await readableSourceFor(videoPath, 15 * 60 * 1000);
      const output = join(workDir, 'clip.mp4');
      await runFfmpeg(
        [
          '-hide_banner', '-loglevel', 'error',
          '-protocol_whitelist', 'http,https,tcp,tls',
          ...(source.headers ? ['-headers', source.headers] : []),
          '-ss', String(clip.startSec),
          '-t', String(clip.durationSec),
          '-i', source.url,
          '-an', '-sn', '-dn',
          '-map_metadata', '-1',
          '-vf', 'scale=-2:480',
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
          '-movflags', '+faststart',
          output,
        ],
        workDir,
      );
      await getStorage().bucket().upload(output, {
        destination,
        contentType: 'video/mp4',
        metadata: { metadata: { ownerId, jobId } },
      });
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  },
};

let activeClipCutter: ClipCutter = ffmpegClipCutter;

export function setClipCutter(cutter: ClipCutter): void {
  activeClipCutter = cutter;
}

export type LifecycleResult = {
  source: 'deleted' | 'retained' | 'absent';
  citedFramesKept: number;
  deletedObjectCount: number;
  evidenceClips: number;
};

/**
 * Applies the plan. Idempotent: storage deletes ignore missing objects, clips that already
 * exist are not re-cut, and a job already marked `done` is left alone.
 */
export async function applyMediaLifecycle(db: Firestore, jobId: string): Promise<LifecycleResult | null> {
  const ref = db.collection('matchAnalysisJobs').doc(jobId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const job = snap.data() as LifecycleJob & { mediaCleanupState?: CleanupState; mediaLifecycle?: { attempts?: number } };
  if (!isTerminalStatus(job.status) || job.mediaCleanupState === 'done' || typeof job.playerId !== 'string') return null;

  const plan = planMediaLifecycle(job);
  const bucket = getStorage().bucket();
  const prefix = jobMediaPrefix(job.playerId, jobId);
  const sourcePath = typeof job.videoStoragePath === 'string' && job.videoStoragePath.startsWith(prefix) ? job.videoStoragePath : null;

  const clipRecords: Array<ClipPlan & { storagePath: string }> = [];
  if (sourcePath) {
    for (const clip of plan.clips) {
      const destination = `${prefix}clips/clip_${clip.index}.mp4`;
      try {
        const [exists] = await bucket.file(destination).exists();
        if (!exists) {
          await activeClipCutter.cut({ videoPath: sourcePath, clip, destination, ownerId: job.playerId, jobId });
        }
        clipRecords.push({ ...clip, storagePath: destination });
      } catch (error) {
        logger.warn('Evidence clip could not be cut', { jobId, clip: clip.index, message: error instanceof Error ? error.message : 'unknown' });
      }
    }
  }

  const keepFrames = (job.frames ?? []).filter((frame) => {
    const id = frameIdOf(frame);
    return id !== null && plan.keepFrameIds.includes(id);
  });
  const keepPaths = new Set<string>([
    ...keepFrames.map((frame) => frame.storagePath).filter((path): path is string => typeof path === 'string'),
    ...clipRecords.map((clip) => clip.storagePath),
    ...(sourcePath && !plan.deleteSource ? [sourcePath] : []),
  ]);

  const [files] = await bucket.getFiles({ prefix });
  let deleted = 0;
  for (const file of files) {
    if (keepPaths.has(file.name)) continue;
    await file.delete({ ignoreNotFound: true });
    deleted += 1;
  }
  if (plan.deleteSource) {
    await db.collection('players').doc(job.playerId).collection('media').doc(footageMediaId(jobId)).delete();
  }

  const now = new Date().toISOString();
  const result: LifecycleResult = {
    source: !sourcePath ? 'absent' : plan.deleteSource ? 'deleted' : 'retained',
    citedFramesKept: keepFrames.length,
    deletedObjectCount: deleted,
    evidenceClips: clipRecords.length,
  };
  await ref.update({
    frames: keepFrames,
    videoStoragePath: plan.deleteSource ? null : (job.videoStoragePath ?? null),
    evidenceClips: clipRecords.map(({ index, startSec, durationSec, timestampSec, frameIds, storagePath }) => ({
      index, startSec, durationSec, timestampSec, frameIds, storagePath,
    })),
    mediaCleanupState: 'done',
    mediaCleanupDueAt: null,
    mediaLifecycle: { ...result, cleanedAt: now, attempts: (job.mediaLifecycle?.attempts ?? 0) + 1 },
    updatedAt: now,
  });
  return result;
}

/** Decides what a status change means for the job's media and schedules or runs cleanup. */
export async function onJobStatusChanged(
  db: Firestore,
  jobId: string,
  before: { status?: unknown; mediaCleanupState?: unknown } | undefined,
  after: LifecycleJob & { mediaCleanupState?: unknown },
  now: Date = new Date(),
): Promise<'cleaned' | 'scheduled' | 'reset' | 'ignored'> {
  if (before?.status === after.status) return 'ignored';
  const ref = db.collection('matchAnalysisJobs').doc(jobId);
  if (!isTerminalStatus(after.status)) {
    if (after.mediaCleanupState === 'retry_window') {
      await ref.update({ mediaCleanupState: null, mediaCleanupDueAt: null });
      return 'reset';
    }
    return 'ignored';
  }
  if (after.mediaCleanupState === 'done') return 'ignored';
  const due = cleanupDueAt(after, now);
  if (due.getTime() > now.getTime()) {
    await ref.update({ mediaCleanupState: 'retry_window', mediaCleanupDueAt: due.toISOString() });
    return 'scheduled';
  }
  // Marked first so the hourly sweep finishes the job if this invocation dies mid-way.
  await ref.update({ mediaCleanupState: 'pending', mediaCleanupDueAt: now.toISOString() });
  await applyMediaLifecycle(db, jobId);
  return 'cleaned';
}

export async function sweepMediaLifecycle(db: Firestore, now: Date = new Date()): Promise<number> {
  let cleaned = 0;
  // Jobs abandoned before upload or device-frame analysis finished expire, so their frames go too.
  const staleBefore = new Date(now.getTime() - LIFECYCLE.abandonedUploadDays * 86_400_000).toISOString();
  const stale = await db
    .collection('matchAnalysisJobs')
    .where('status', '==', 'uploading')
    .where('updatedAt', '<=', staleBefore)
    .limit(LIFECYCLE.sweepBatch)
    .get();
  for (const doc of stale.docs) {
    await doc.ref.update({
      status: 'expired',
      pipelineState: 'expired',
      mediaCleanupState: 'pending',
      mediaCleanupDueAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }
  for (const state of ['pending', 'retry_window'] as const) {
    const due = await db
      .collection('matchAnalysisJobs')
      .where('mediaCleanupState', '==', state)
      .where('mediaCleanupDueAt', '<=', now.toISOString())
      .limit(LIFECYCLE.sweepBatch)
      .get();
    for (const doc of due.docs) {
      try {
        if (await applyMediaLifecycle(db, doc.id)) cleaned += 1;
      } catch (error) {
        logger.error('Media cleanup failed', { jobId: doc.id, message: error instanceof Error ? error.message : 'unknown' });
      }
    }
  }
  return cleaned;
}

/** Removes every stored object and server subcollection of a deleted job. */
export async function purgeDeletedJob(db: Firestore, jobId: string, uid: string): Promise<void> {
  await getStorage().bucket().deleteFiles({ prefix: jobMediaPrefix(uid, jobId), force: true });
  await db.collection('players').doc(uid).collection('media').doc(footageMediaId(jobId)).delete();
  await db.recursiveDelete(db.collection('matchAnalysisJobs').doc(jobId));
}

export const onMatchJobMediaLifecycle = onDocumentUpdated(
  { document: 'matchAnalysisJobs/{jobId}', memory: '1GiB', timeoutSeconds: 540 },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data() as (LifecycleJob & { mediaCleanupState?: unknown }) | undefined;
    if (!after || typeof after.playerId !== 'string') return;
    try {
      await onJobStatusChanged(getFirestore(), event.params.jobId, before, after);
    } catch (error) {
      logger.error('Media lifecycle failed; the sweep will retry', {
        jobId: event.params.jobId,
        message: error instanceof Error ? error.message : 'unknown',
      });
    }
  },
);

export const onMatchJobDeleted = onDocumentDeleted('matchAnalysisJobs/{jobId}', async (event) => {
  const uid = event.data?.get('playerId');
  if (typeof uid !== 'string' || !uid) return;
  await purgeDeletedJob(getFirestore(), event.params.jobId, uid);
});

export const mediaLifecycleSweep = onSchedule({ schedule: 'every 60 minutes', memory: '1GiB', timeoutSeconds: 540 }, async () => {
  const cleaned = await sweepMediaLifecycle(getFirestore());
  if (cleaned > 0) logger.info('Media lifecycle sweep', { cleaned });
});
