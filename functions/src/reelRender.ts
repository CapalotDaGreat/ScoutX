import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { createCallableOptions } from './callableOptions';
import { consumeQuota, releaseQuota } from './entitlements/quotaService';
import {
  buildRenderPlan,
  classifyFfmpegError,
  concatArgs,
  coverArgs,
  isMissingAudio,
  RENDER_DEADLINE_MS,
  segmentArgs,
  type ReelAspect,
  type ReelExportErrorCode,
  type RenderSegmentInput,
  type RenderSource,
} from './reelRenderPlan';

const MAX_EXPORTS_PER_HOUR = 6;
const ACTIVE = new Set(['queued', 'rendering', 'ready']);

type ReelDoc = {
  ownerId?: string;
  version?: number;
  segments?: RenderSegmentInput[];
  aspectRatio?: ReelAspect;
  coverMediaId?: string | null;
};

class RenderError extends Error {
  constructor(public readonly code: ReelExportErrorCode) {
    super(code);
  }
}

function isAspect(value: unknown): value is ReelAspect {
  return value === '9:16' || value === '16:9' || value === '1:1';
}

function readSegments(value: unknown): RenderSegmentInput[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
    if (!row || typeof row.mediaId !== 'string' || typeof row.inSec !== 'number' || typeof row.outSec !== 'number') return [];
    return [{ mediaId: row.mediaId, inSec: row.inSec, outSec: row.outSec, caption: typeof row.caption === 'string' ? row.caption : undefined }];
  });
}

/** Only media stored under the owner's own profile prefix can be rendered. */
async function loadSources(db: Firestore, ownerId: string, segments: readonly RenderSegmentInput[]) {
  const sources = new Map<string, RenderSource | null>();
  for (const mediaId of new Set(segments.map((segment) => segment.mediaId))) {
    const snap = await db.collection('players').doc(ownerId).collection('media').doc(mediaId).get();
    const storagePath = snap.get('storagePath');
    const durationSec = snap.get('durationSec');
    const usable =
      snap.exists &&
      snap.get('uploadState') === 'ready' &&
      typeof storagePath === 'string' &&
      storagePath.startsWith(`profiles/${ownerId}/`) &&
      !storagePath.includes('..');
    sources.set(mediaId, usable ? { storagePath, durationSec: typeof durationSec === 'number' ? durationSec : 0 } : null);
  }
  return sources;
}

function runFfmpeg(args: string[], deadlineAt: number): Promise<void> {
  const binary = ffmpegPath;
  if (!binary) return Promise.reject(new RenderError('render_failed'));
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) return Promise.reject(new RenderError('timeout'));
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, remaining);
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.on('error', () => {
      clearTimeout(timer);
      reject(new RenderError('render_failed'));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) reject(new RenderError('timeout'));
      else if (code === 0) resolve();
      else reject(Object.assign(new RenderError(classifyFfmpegError(stderr)), { stderr }));
    });
  });
}

/** Player asks for a rendered reel. Validation happens before a job is queued. */
export const exportReel = onCall(createCallableOptions(), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Authentication is required.');
  const reelId = typeof request.data?.reelId === 'string' ? request.data.reelId : '';
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(reelId)) throw new HttpsError('invalid-argument', 'reelId is required.');

  const db = getFirestore();
  const snap = await db.collection('reels').doc(reelId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Reel not found.');
  const reel = snap.data() as ReelDoc;
  if (reel.ownerId !== uid) throw new HttpsError('permission-denied', 'You can only export your own reels.');

  const segments = readSegments(reel.segments);
  const aspectRatio = isAspect(reel.aspectRatio) ? reel.aspectRatio : '9:16';
  const plan = buildRenderPlan(
    { segments, aspectRatio, coverMediaId: reel.coverMediaId ?? null },
    await loadSources(db, uid, segments),
  );
  if (!plan.ok) {
    return { exportId: null, status: 'failed' as const, errorCode: plan.code, segmentIndex: plan.segmentIndex ?? null };
  }

  const version = typeof reel.version === 'number' ? reel.version : 0;
  const existing = await db.collection('reelExports').where('ownerId', '==', uid).limit(100).get();
  const reuse = existing.docs.find(
    (doc) => doc.get('reelId') === reelId && doc.get('reelVersion') === version && ACTIVE.has(String(doc.get('status'))),
  );
  if (reuse) return { exportId: reuse.id, status: String(reuse.get('status')), errorCode: null, segmentIndex: null };

  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const recent = existing.docs.filter((doc) => String(doc.get('createdAt') ?? '') > hourAgo).length;
  if (recent >= MAX_EXPORTS_PER_HOUR) throw new HttpsError('resource-exhausted', 'Too many exports. Try again later.');

  const quotaRef = `${reelId}:v${version}`;
  await consumeQuota(db, uid, 'reel_export', quotaRef);

  const now = new Date().toISOString();
  const ref = db.collection('reelExports').doc();
  await ref.set({
    id: ref.id,
    ownerId: uid,
    quotaRef,
    reelId,
    reelVersion: version,
    aspectRatio,
    status: 'queued',
    errorCode: null,
    storagePath: null,
    coverPath: null,
    durationSec: null,
    sizeBytes: null,
    createdAt: now,
    updatedAt: now,
  });
  return { exportId: ref.id, status: 'queued' as const, errorCode: null, segmentIndex: null };
});

/**
 * Files a ready reel export into the owner's private media library so it can follow the normal
 * library flow (rights confirmation, then Passport). Rights are confirmed only when every source
 * clip was already confirmed; a moderated source blocks the save.
 */
export const saveReelToLibrary = onCall(createCallableOptions(), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Authentication is required.');
  const exportId = typeof request.data?.exportId === 'string' ? request.data.exportId : '';
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(exportId)) throw new HttpsError('invalid-argument', 'exportId is required.');

  const db = getFirestore();
  const exportSnap = await db.collection('reelExports').doc(exportId).get();
  if (!exportSnap.exists || exportSnap.get('ownerId') !== uid) throw new HttpsError('not-found', 'Export not found.');
  const storagePath = exportSnap.get('storagePath');
  if (
    exportSnap.get('status') !== 'ready' ||
    typeof storagePath !== 'string' ||
    !storagePath.startsWith(`profiles/${uid}/reelExports/${exportId}/`)
  ) {
    throw new HttpsError('failed-precondition', 'The reel is not ready yet.', { reason: 'export_not_ready' });
  }

  const reelId = String(exportSnap.get('reelId') ?? '');
  const reelSnap = await db.collection('reels').doc(reelId).get();
  const reel = reelSnap.data() as (ReelDoc & { title?: unknown }) | undefined;
  if (!reel || reel.ownerId !== uid) throw new HttpsError('not-found', 'Reel not found.');

  const sourceIds = [...new Set(readSegments(reel.segments).map((segment) => segment.mediaId))];
  const sources = await Promise.all(
    sourceIds.map((id) => db.collection('players').doc(uid).collection('media').doc(id).get()),
  );
  if (sources.some((snap) => snap.exists && (snap.get('moderationState') ?? 'none') !== 'none')) {
    throw new HttpsError('failed-precondition', 'A clip in this reel is under review.', { reason: 'source_moderated' });
  }
  const allConfirmed =
    sources.length > 0 && sources.every((snap) => snap.exists && snap.get('rightsState') === 'user_confirmed');

  const mediaRef = db.collection('players').doc(uid).collection('media').doc(`reel_${exportId}`);
  const existing = await mediaRef.get();
  if (existing.exists) return { mediaId: mediaRef.id, created: false };

  const now = new Date().toISOString();
  const coverPath = exportSnap.get('coverPath');
  await mediaRef.set({
    id: mediaRef.id,
    ownerId: uid,
    type: 'reel',
    storagePath,
    thumbnailPath: typeof coverPath === 'string' ? coverPath : null,
    durationSec: Number(exportSnap.get('durationSec') ?? 0),
    sourceMatchId: null,
    sourceJobId: null,
    sourceReelId: reelId,
    visibility: 'private',
    rightsState: allConfirmed ? 'user_confirmed' : 'unconfirmed',
    moderationState: 'none',
    uploadState: 'ready',
    processingState: 'ready',
    favorite: false,
    tags: [],
    goalIds: [],
    title: typeof reel.title === 'string' && reel.title.trim() ? reel.title.trim().slice(0, 120) : 'Highlight reel',
    createdAt: now,
    updatedAt: now,
  });
  return { mediaId: mediaRef.id, created: true };
});

export const onReelExportQueued = onDocumentCreated(
  { document: 'reelExports/{exportId}', memory: '2GiB', timeoutSeconds: 540 },
  async (event) => {
    const ref = event.data?.ref;
    if (!ref || event.data?.get('status') !== 'queued') return;
    const db = getFirestore();
    const ownerId = String(event.data.get('ownerId') ?? '');
    const reelId = String(event.data.get('reelId') ?? '');
    const deadlineAt = Date.now() + RENDER_DEADLINE_MS;
    await ref.update({ status: 'rendering', startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

    let workDir: string | null = null;
    try {
      const reelSnap = await db.collection('reels').doc(reelId).get();
      const reel = reelSnap.data() as ReelDoc | undefined;
      if (!reel || reel.ownerId !== ownerId) throw new RenderError('missing_source');
      const segments = readSegments(reel.segments);
      const result = buildRenderPlan(
        { segments, aspectRatio: isAspect(reel.aspectRatio) ? reel.aspectRatio : '9:16', coverMediaId: reel.coverMediaId ?? null },
        await loadSources(db, ownerId, segments),
      );
      if (!result.ok) throw new RenderError(result.code);
      const { plan } = result;

      const bucket = getStorage().bucket();
      workDir = await mkdtemp(join(tmpdir(), 'reel-'));
      const local = new Map<string, string>();
      for (const [index, storagePath] of [...new Set(plan.segments.map((s) => s.storagePath))].entries()) {
        const file = bucket.file(storagePath);
        const [exists] = await file.exists();
        if (!exists) throw new RenderError('missing_source');
        const target = join(workDir, `src_${index}`);
        await file.download({ destination: target });
        local.set(storagePath, target);
      }

      const parts: string[] = [];
      for (const segment of plan.segments) {
        const input = local.get(segment.storagePath) ?? '';
        const output = join(workDir, `seg_${segment.index}.mp4`);
        try {
          await runFfmpeg(segmentArgs(input, output, segment, plan, true), deadlineAt);
        } catch (error) {
          const stderr = (error as { stderr?: string }).stderr ?? '';
          if (!isMissingAudio(stderr)) throw error;
          await runFfmpeg(segmentArgs(input, output, segment, plan, false), deadlineAt);
        }
        parts.push(output);
      }

      const listFile = join(workDir, 'list.txt');
      await writeFile(listFile, parts.map((part) => `file '${part.replace(/'/g, "'\\''")}'`).join('\n'));
      let srtFile: string | null = null;
      if (plan.srt) {
        srtFile = join(workDir, 'captions.srt');
        await writeFile(srtFile, plan.srt);
      }
      const output = join(workDir, 'reel.mp4');
      await runFfmpeg(concatArgs(listFile, srtFile, output), deadlineAt);
      const cover = join(workDir, 'cover.jpg');
      await runFfmpeg(coverArgs(parts[plan.coverIndex], 0.5, cover), deadlineAt);

      const prefix = `profiles/${ownerId}/reelExports/${ref.id}`;
      await bucket.upload(output, { destination: `${prefix}/reel.mp4`, contentType: 'video/mp4' });
      await bucket.upload(cover, { destination: `${prefix}/cover.jpg`, contentType: 'image/jpeg' });
      const [exists] = await bucket.file(`${prefix}/reel.mp4`).exists();
      if (!exists) throw new RenderError('render_failed');
      const [metadata] = await bucket.file(`${prefix}/reel.mp4`).getMetadata();

      const now = new Date().toISOString();
      await ref.update({
        status: 'ready',
        storagePath: `${prefix}/reel.mp4`,
        coverPath: `${prefix}/cover.jpg`,
        durationSec: plan.totalSec,
        sizeBytes: Number(metadata.size ?? 0),
        hasCaptions: plan.srt !== null,
        completedAt: now,
        updatedAt: now,
      });
    } catch (error) {
      const code: ReelExportErrorCode = error instanceof RenderError ? error.code : 'render_failed';
      const now = new Date().toISOString();
      await ref.update({ status: 'failed', errorCode: code, failedAt: now, updatedAt: now });
      const quotaRef = String(event.data.get('quotaRef') ?? '');
      if (quotaRef) await releaseQuota(db, ownerId, 'reel_export', quotaRef).catch(() => false);
    } finally {
      if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  },
);
