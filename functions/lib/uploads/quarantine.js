"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onQuarantineObjectFinalized = void 0;
exports.processQuarantinedObject = processQuarantinedObject;
const node_child_process_1 = require("node:child_process");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const ffprobe_static_1 = __importDefault(require("ffprobe-static"));
const storage_1 = require("firebase-functions/v2/storage");
const firestore_1 = require("firebase-admin/firestore");
const storage_2 = require("firebase-admin/storage");
const firebase_functions_1 = require("firebase-functions");
const pipeline_1 = require("../analysis/pipeline");
const quotaService_1 = require("../entitlements/quotaService");
const mediaSource_1 = require("./mediaSource");
const mediaScanner_1 = require("./mediaScanner");
const model_1 = require("./model");
const probe_1 = require("./probe");
const PROBE_TIMEOUT_MS = 180_000;
/** Runs ffprobe with an argument array (no shell) and network-only protocols. */
async function runFfprobe(source, cwd) {
    const binary = ffprobe_static_1.default.path;
    const args = [
        '-v', 'error',
        '-protocol_whitelist', 'http,https,tcp,tls',
        '-rw_timeout', '30000000',
        ...(source.headers ? ['-headers', source.headers] : []),
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        source.url,
    ];
    return new Promise((resolve) => {
        (0, node_child_process_1.execFile)(binary, args, { cwd, timeout: PROBE_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
            resolve(error ? null : stdout);
        });
    });
}
async function readHead(path) {
    const [buffer] = await (0, storage_2.getStorage)().bucket().file(path).download({ start: 0, end: 15 });
    return new Uint8Array(buffer);
}
async function reject(db, uploadId, data, reason) {
    await (0, storage_2.getStorage)().bucket().file(data.storagePath).delete({ ignoreNotFound: true });
    const now = new Date().toISOString();
    await db.collection('mediaUploads').doc(uploadId).update({ state: 'rejected', rejectionReason: reason, rejectedAt: now, updatedAt: now });
    await (0, quotaService_1.releaseQuota)(db, data.ownerId, 'full_match_analysis', data.jobId).catch(() => false);
    const jobRef = db.collection('matchAnalysisJobs').doc(data.jobId);
    const job = await jobRef.get();
    if (job.exists && job.get('playerId') === data.ownerId && job.get('videoUploadId') == null) {
        await jobRef.update({
            status: 'failed',
            pipelineState: 'failed',
            errorCode: 'video_rejected',
            error: null,
            updatedAt: now,
        });
    }
    firebase_functions_1.logger.info('Upload rejected', { uploadId, reason });
    return 'rejected';
}
/** Validated footage becomes a private library item so highlights and reels can reference it. */
async function fileFootageInLibrary(db, data, storagePath, durationSec, now) {
    const ref = db.collection('players').doc(data.ownerId).collection('media').doc((0, model_1.footageMediaId)(data.jobId));
    if ((await ref.get()).exists)
        return;
    await ref.set({
        id: ref.id,
        ownerId: data.ownerId,
        type: 'matchFootage',
        storagePath,
        thumbnailPath: null,
        durationSec,
        sourceMatchId: null,
        sourceJobId: data.jobId,
        visibility: 'private',
        rightsState: 'unconfirmed',
        moderationState: 'none',
        uploadState: 'ready',
        processingState: 'none',
        favorite: false,
        tags: [],
        goalIds: [],
        title: 'Match footage',
        createdAt: now,
        updatedAt: now,
    });
}
async function promote(db, uploadId, data, summary) {
    const jobRef = db.collection('matchAnalysisJobs').doc(data.jobId);
    const job = await jobRef.get();
    if (!job.exists || job.get('playerId') !== data.ownerId)
        return reject(db, uploadId, data, 'job_missing');
    const bucket = (0, storage_2.getStorage)().bucket();
    const destination = (0, model_1.matchFootagePath)(data.ownerId, data.jobId);
    await bucket.file(data.storagePath).copy(bucket.file(destination), {
        contentType: summary.container === 'mov' ? 'video/quicktime' : 'video/mp4',
        metadata: { ownerId: data.ownerId, uploadId },
    });
    await bucket.file(data.storagePath).delete({ ignoreNotFound: true });
    const now = new Date().toISOString();
    await jobRef.update({
        videoStoragePath: destination,
        videoUploadId: uploadId,
        videoProbe: summary,
        fileSizeBytes: summary.sizeBytes,
        measuredDurationSec: summary.durationSec,
        videoValidatedAt: now,
        updatedAt: now,
        ...(job.get('cancelRequested') === true ? {} : { pipelineState: 'validating' }),
    });
    await db.collection('mediaUploads').doc(uploadId).update({
        state: 'ready',
        promotedPath: destination,
        readyAt: now,
        updatedAt: now,
    });
    await fileFootageInLibrary(db, data, destination, summary.durationSec, now);
    await (0, pipeline_1.startMatchPipeline)(db, data.jobId);
    return 'ready';
}
/**
 * QUARANTINED → VALIDATED | REJECTED → READY. Only objects that pass magic-byte, ffprobe and
 * limit checks leave quarantine; everything else is deleted. Safe to re-run after a crash.
 */
async function processQuarantinedObject(db, path, sizeBytes) {
    const parsed = (0, model_1.parseQuarantinePath)(path);
    if (!parsed)
        return null;
    const ref = db.collection('mediaUploads').doc(parsed.uploadId);
    const data = (await ref.get()).data();
    if (!data || data.ownerId !== parsed.uid || !['uploading', 'quarantined', 'validated'].includes(data.state)) {
        await (0, storage_2.getStorage)().bucket().file(path).delete({ ignoreNotFound: true });
        firebase_functions_1.logger.warn('Quarantine object without an open upload was deleted', { uploadId: parsed.uploadId });
        return null;
    }
    const now = new Date().toISOString();
    if (data.state === 'uploading') {
        await db.collection('mediaUploadSessions').doc(parsed.uploadId).delete();
        await ref.update({ state: 'quarantined', receivedBytes: sizeBytes, quarantinedAt: now, updatedAt: now });
    }
    if (sizeBytes !== data.sizeBytes)
        return reject(db, parsed.uploadId, data, 'size_mismatch');
    if (!(0, probe_1.hasVideoMagicBytes)(await readHead(path)))
        return reject(db, parsed.uploadId, data, 'not_video');
    const workDir = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'scoutx-probe-'));
    let output;
    try {
        output = await runFfprobe(await (0, mediaSource_1.readableSourceFor)(path), workDir);
    }
    finally {
        await (0, promises_1.rm)(workDir, { recursive: true, force: true });
    }
    const evaluation = (0, probe_1.evaluateProbe)(output ? (0, probe_1.parseProbeJson)(output) : null, data.sizeBytes);
    if (!evaluation.ok)
        return reject(db, parsed.uploadId, data, evaluation.reason);
    const plan = await (0, quotaService_1.planFor)(db, data.ownerId);
    if (evaluation.summary.durationSec > plan.maxVideoDurationSec)
        return reject(db, parsed.uploadId, data, 'too_long');
    const scan = await (0, mediaScanner_1.getMediaScanner)().scan(path);
    if (scan.status === 'flagged')
        return reject(db, parsed.uploadId, data, 'scanner_flagged');
    await ref.update({ state: 'validated', probe: evaluation.summary, scan, validatedAt: new Date().toISOString() });
    return promote(db, parsed.uploadId, data, evaluation.summary);
}
exports.onQuarantineObjectFinalized = (0, storage_1.onObjectFinalized)({ memory: '4GiB', timeoutSeconds: 540, concurrency: 1, cpu: 2, retry: false }, async (event) => {
    const path = event.data.name;
    if (!path?.startsWith('quarantine/'))
        return;
    const db = (0, firestore_1.getFirestore)();
    try {
        await processQuarantinedObject(db, path, Number(event.data.size ?? 0));
    }
    catch (error) {
        firebase_functions_1.logger.error('Upload validation failed', { path, message: error instanceof Error ? error.message : 'unknown' });
        const parsed = (0, model_1.parseQuarantinePath)(path);
        const data = parsed ? (await db.collection('mediaUploads').doc(parsed.uploadId).get()).data() : undefined;
        if (parsed && data && data.state !== 'ready' && data.state !== 'rejected') {
            await reject(db, parsed.uploadId, data, 'probe_failed');
        }
    }
});
//# sourceMappingURL=quarantine.js.map