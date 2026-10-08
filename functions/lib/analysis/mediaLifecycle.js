"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mediaLifecycleSweep = exports.onMatchJobDeleted = exports.onMatchJobMediaLifecycle = exports.ffmpegClipCutter = exports.LIFECYCLE = void 0;
exports.isTerminalStatus = isTerminalStatus;
exports.jobMediaPrefix = jobMediaPrefix;
exports.citedFrameIds = citedFrameIds;
exports.planEvidenceClips = planEvidenceClips;
exports.planMediaLifecycle = planMediaLifecycle;
exports.cleanupDueAt = cleanupDueAt;
exports.setClipCutter = setClipCutter;
exports.applyMediaLifecycle = applyMediaLifecycle;
exports.onJobStatusChanged = onJobStatusChanged;
exports.sweepMediaLifecycle = sweepMediaLifecycle;
exports.purgeDeletedJob = purgeDeletedJob;
const node_child_process_1 = require("node:child_process");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const ffmpeg_static_1 = __importDefault(require("ffmpeg-static"));
const firestore_1 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_2 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const firebase_functions_1 = require("firebase-functions");
const mediaSource_1 = require("../uploads/mediaSource");
const model_1 = require("../uploads/model");
/**
 * Media lifecycle for match analysis. Source videos and extracted frames are temporary:
 *  - the source video is deleted after analysis unless the player chose "Keep match video";
 *  - every frame or intermediate that no generated observation cites is deleted;
 *  - only the minimal owner-private evidence frames that substantiate the report remain;
 *  - short evidence clips are cut only when the player explicitly asked for them.
 */
exports.LIFECYCLE = {
    failedRetryHours: 24,
    keepForRetryDays: 7,
    maxIdentityFrames: 6,
    maxEvidenceClips: 6,
    clipHalfWindowSec: 4,
    clipMinGapSec: 10,
    sweepBatch: 50,
    abandonedUploadDays: 7,
};
const TERMINAL = ['complete', 'failed', 'cancelled', 'expired'];
function isTerminalStatus(status) {
    return typeof status === 'string' && TERMINAL.includes(status);
}
function jobMediaPrefix(uid, jobId) {
    return `profiles/${uid}/matchFootage/${jobId}/`;
}
function frameIdOf(frame) {
    if (typeof frame.id === 'string' && frame.id)
        return frame.id;
    return typeof frame.index === 'number' ? `frame_${frame.index}` : null;
}
/** Every frame id the report cites, at any depth (evidence, ratings, clip claims, coaching). */
function citedFrameIds(report) {
    const cited = new Set();
    const visit = (value, depth) => {
        if (depth > 8 || value === null || typeof value !== 'object')
            return;
        if (Array.isArray(value)) {
            for (const item of value)
                visit(item, depth + 1);
            return;
        }
        for (const [key, child] of Object.entries(value)) {
            if ((key === 'frameIds' || key === 'evidenceFrameIds') && Array.isArray(child)) {
                for (const id of child)
                    if (typeof id === 'string' && id)
                        cited.add(id);
            }
            else if (key === 'frameId' && typeof child === 'string' && child) {
                cited.add(child);
            }
            else {
                visit(child, depth + 1);
            }
        }
    };
    visit(report, 0);
    return cited;
}
/** Frames the player confirmed as "this is me" substantiate identity; a few are enough. */
function identityFrameIds(job) {
    const confirmation = job.identityConfirmation;
    if (confirmation?.state !== 'confirmed' || !Array.isArray(confirmation.frameIds))
        return [];
    return confirmation.frameIds.filter((id) => typeof id === 'string').slice(0, exports.LIFECYCLE.maxIdentityFrames);
}
/** Clip windows around the strongest cited observations, de-duplicated and bounded. */
function planEvidenceClips(job) {
    if (!job.evidenceClipsRequested || job.status !== 'complete' || !job.videoStoragePath)
        return [];
    const duration = job.measuredDurationSec ?? job.durationSec ?? 0;
    if (!(duration > 0))
        return [];
    const evidence = Array.isArray(job.report?.evidence) ? job.report?.evidence : [];
    const clips = [];
    for (const item of evidence) {
        if (clips.length >= exports.LIFECYCLE.maxEvidenceClips)
            break;
        if (item.kind !== 'observation' || typeof item.timestampSec !== 'number' || !Number.isFinite(item.timestampSec))
            continue;
        const at = item.timestampSec;
        if (clips.some((clip) => Math.abs(clip.timestampSec - at) < exports.LIFECYCLE.clipMinGapSec))
            continue;
        const startSec = Math.max(0, at - exports.LIFECYCLE.clipHalfWindowSec);
        const endSec = Math.min(duration, at + exports.LIFECYCLE.clipHalfWindowSec);
        if (endSec - startSec < 1)
            continue;
        const frameIds = Array.isArray(item.frameIds) ? item.frameIds.filter((id) => typeof id === 'string') : [];
        clips.push({ index: clips.length, startSec, durationSec: endSec - startSec, timestampSec: at, frameIds });
    }
    return clips;
}
/** Pure: what to delete and what to keep once a job is settled. */
function planMediaLifecycle(job) {
    const known = new Set((job.frames ?? []).map(frameIdOf).filter((id) => Boolean(id)));
    const keep = new Set();
    if (job.status === 'complete') {
        for (const id of citedFrameIds([job.report, job.pendingCoaching]))
            if (known.has(id))
                keep.add(id);
        for (const id of identityFrameIds(job))
            if (known.has(id))
                keep.add(id);
    }
    return {
        deleteSource: job.retainSource !== true,
        keepFrameIds: [...keep].sort(),
        clips: planEvidenceClips(job),
    };
}
/** When a settled job's media may be cleaned: now, or after a short window to allow a retry. */
function cleanupDueAt(job, now) {
    if (job.status !== 'failed')
        return now;
    const hours = job.keepForRetry === true ? exports.LIFECYCLE.keepForRetryDays * 24 : exports.LIFECYCLE.failedRetryHours;
    return new Date(now.getTime() + hours * 3_600_000);
}
function runFfmpeg(args, cwd) {
    const binary = ffmpeg_static_1.default;
    if (!binary)
        return Promise.reject(new Error('ffmpeg binary unavailable'));
    return new Promise((resolve, reject) => {
        (0, node_child_process_1.execFile)(binary, args, { cwd, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 }, (error) => {
            if (error)
                reject(new Error(`ffmpeg failed (${error.code ?? 'signal'})`));
            else
                resolve();
        });
    });
}
/** Short, silent 480p clips; only the requested window is streamed from storage. */
exports.ffmpegClipCutter = {
    async cut({ videoPath, clip, destination, ownerId, jobId }) {
        const workDir = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'scoutx-clip-'));
        try {
            const source = await (0, mediaSource_1.readableSourceFor)(videoPath, 15 * 60 * 1000);
            const output = (0, node_path_1.join)(workDir, 'clip.mp4');
            await runFfmpeg([
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
            ], workDir);
            await (0, storage_1.getStorage)().bucket().upload(output, {
                destination,
                contentType: 'video/mp4',
                metadata: { metadata: { ownerId, jobId } },
            });
        }
        finally {
            await (0, promises_1.rm)(workDir, { recursive: true, force: true });
        }
    },
};
let activeClipCutter = exports.ffmpegClipCutter;
function setClipCutter(cutter) {
    activeClipCutter = cutter;
}
/**
 * Applies the plan. Idempotent: storage deletes ignore missing objects, clips that already
 * exist are not re-cut, and a job already marked `done` is left alone.
 */
async function applyMediaLifecycle(db, jobId) {
    const ref = db.collection('matchAnalysisJobs').doc(jobId);
    const snap = await ref.get();
    if (!snap.exists)
        return null;
    const job = snap.data();
    if (!isTerminalStatus(job.status) || job.mediaCleanupState === 'done' || typeof job.playerId !== 'string')
        return null;
    const plan = planMediaLifecycle(job);
    const bucket = (0, storage_1.getStorage)().bucket();
    const prefix = jobMediaPrefix(job.playerId, jobId);
    const sourcePath = typeof job.videoStoragePath === 'string' && job.videoStoragePath.startsWith(prefix) ? job.videoStoragePath : null;
    const clipRecords = [];
    if (sourcePath) {
        for (const clip of plan.clips) {
            const destination = `${prefix}clips/clip_${clip.index}.mp4`;
            try {
                const [exists] = await bucket.file(destination).exists();
                if (!exists) {
                    await activeClipCutter.cut({ videoPath: sourcePath, clip, destination, ownerId: job.playerId, jobId });
                }
                clipRecords.push({ ...clip, storagePath: destination });
            }
            catch (error) {
                firebase_functions_1.logger.warn('Evidence clip could not be cut', { jobId, clip: clip.index, message: error instanceof Error ? error.message : 'unknown' });
            }
        }
    }
    const keepFrames = (job.frames ?? []).filter((frame) => {
        const id = frameIdOf(frame);
        return id !== null && plan.keepFrameIds.includes(id);
    });
    const keepPaths = new Set([
        ...keepFrames.map((frame) => frame.storagePath).filter((path) => typeof path === 'string'),
        ...clipRecords.map((clip) => clip.storagePath),
        ...(sourcePath && !plan.deleteSource ? [sourcePath] : []),
    ]);
    const [files] = await bucket.getFiles({ prefix });
    let deleted = 0;
    for (const file of files) {
        if (keepPaths.has(file.name))
            continue;
        await file.delete({ ignoreNotFound: true });
        deleted += 1;
    }
    if (plan.deleteSource) {
        await db.collection('players').doc(job.playerId).collection('media').doc((0, model_1.footageMediaId)(jobId)).delete();
    }
    const now = new Date().toISOString();
    const result = {
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
async function onJobStatusChanged(db, jobId, before, after, now = new Date()) {
    if (before?.status === after.status)
        return 'ignored';
    const ref = db.collection('matchAnalysisJobs').doc(jobId);
    if (!isTerminalStatus(after.status)) {
        if (after.mediaCleanupState === 'retry_window') {
            await ref.update({ mediaCleanupState: null, mediaCleanupDueAt: null });
            return 'reset';
        }
        return 'ignored';
    }
    if (after.mediaCleanupState === 'done')
        return 'ignored';
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
async function sweepMediaLifecycle(db, now = new Date()) {
    let cleaned = 0;
    // Jobs abandoned before upload or device-frame analysis finished expire, so their frames go too.
    const staleBefore = new Date(now.getTime() - exports.LIFECYCLE.abandonedUploadDays * 86_400_000).toISOString();
    const stale = await db
        .collection('matchAnalysisJobs')
        .where('status', '==', 'uploading')
        .where('updatedAt', '<=', staleBefore)
        .limit(exports.LIFECYCLE.sweepBatch)
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
    for (const state of ['pending', 'retry_window']) {
        const due = await db
            .collection('matchAnalysisJobs')
            .where('mediaCleanupState', '==', state)
            .where('mediaCleanupDueAt', '<=', now.toISOString())
            .limit(exports.LIFECYCLE.sweepBatch)
            .get();
        for (const doc of due.docs) {
            try {
                if (await applyMediaLifecycle(db, doc.id))
                    cleaned += 1;
            }
            catch (error) {
                firebase_functions_1.logger.error('Media cleanup failed', { jobId: doc.id, message: error instanceof Error ? error.message : 'unknown' });
            }
        }
    }
    return cleaned;
}
/** Removes every stored object and server subcollection of a deleted job. */
async function purgeDeletedJob(db, jobId, uid) {
    await (0, storage_1.getStorage)().bucket().deleteFiles({ prefix: jobMediaPrefix(uid, jobId), force: true });
    await db.collection('players').doc(uid).collection('media').doc((0, model_1.footageMediaId)(jobId)).delete();
    await db.recursiveDelete(db.collection('matchAnalysisJobs').doc(jobId));
}
exports.onMatchJobMediaLifecycle = (0, firestore_1.onDocumentUpdated)({ document: 'matchAnalysisJobs/{jobId}', memory: '1GiB', timeoutSeconds: 540 }, async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after || typeof after.playerId !== 'string')
        return;
    try {
        await onJobStatusChanged((0, firestore_2.getFirestore)(), event.params.jobId, before, after);
    }
    catch (error) {
        firebase_functions_1.logger.error('Media lifecycle failed; the sweep will retry', {
            jobId: event.params.jobId,
            message: error instanceof Error ? error.message : 'unknown',
        });
    }
});
exports.onMatchJobDeleted = (0, firestore_1.onDocumentDeleted)('matchAnalysisJobs/{jobId}', async (event) => {
    const uid = event.data?.get('playerId');
    if (typeof uid !== 'string' || !uid)
        return;
    await purgeDeletedJob((0, firestore_2.getFirestore)(), event.params.jobId, uid);
});
exports.mediaLifecycleSweep = (0, scheduler_1.onSchedule)({ schedule: 'every 60 minutes', memory: '1GiB', timeoutSeconds: 540 }, async () => {
    const cleaned = await sweepMediaLifecycle((0, firestore_2.getFirestore)());
    if (cleaned > 0)
        firebase_functions_1.logger.info('Media lifecycle sweep', { cleaned });
});
//# sourceMappingURL=mediaLifecycle.js.map