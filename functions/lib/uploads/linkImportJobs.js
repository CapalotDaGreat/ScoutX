"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processLinkImportTask = exports.startLinkImport = void 0;
exports.processLinkImport = processLinkImport;
const node_events_1 = require("node:events");
const promises_1 = require("node:stream/promises");
const firestore_1 = require("firebase-admin/firestore");
const functions_1 = require("firebase-admin/functions");
const storage_1 = require("firebase-admin/storage");
const firebase_functions_1 = require("firebase-functions");
const https_1 = require("firebase-functions/v2/https");
const tasks_1 = require("firebase-functions/v2/tasks");
const callableOptions_1 = require("../callableOptions");
const providerConfig_1 = require("../ai/providerConfig");
const videoConsent_1 = require("../analysis/videoConsent");
const videoProviders_1 = require("../analysis/videoProviders");
const quotaService_1 = require("../entitlements/quotaService");
const region_1 = require("../region");
const rateLimit_1 = require("../security/rateLimit");
const sessions_1 = require("./sessions");
const model_1 = require("./model");
const linkImport_1 = require("./linkImport");
const JOB_ID = /^[A-Za-z0-9_-]{6,80}$/;
const UPLOAD_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** The parts of inspection the app may see (never the media URL). */
function publicInspection(inspection) {
    const { mediaUrl: _hidden, ...safe } = inspection;
    return safe;
}
/**
 * "Import from link" step 2: starts a server-side import of a direct HTTPS video link into
 * quarantine for an existing, consented job. Same gates as a device upload: account setup,
 * media-upload consent, job ownership, video-processing consent (cloud), plan limits, quota
 * (charged per job, refunded on rejection), active/daily upload limits.
 */
exports.startLinkImport = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)({ timeoutSeconds: 60 }), async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in to import a video.');
    const body = (request.data ?? {});
    if (typeof body.jobId !== 'string' || !JOB_ID.test(body.jobId)) {
        throw new https_1.HttpsError('invalid-argument', 'This import is not linked to a valid analysis.', { reason: 'job' });
    }
    if (typeof body.url !== 'string' || body.url.length > 2048) {
        throw new https_1.HttpsError('invalid-argument', 'Provide a video link.', { reason: 'invalid' });
    }
    const jobId = body.jobId;
    await (0, rateLimit_1.assertCallableRateLimit)(uid, rateLimit_1.LINK_IMPORT_START_LIMIT);
    const db = (0, firestore_1.getFirestore)();
    await (0, sessions_1.assertMayUpload)(uid, db);
    const job = await db.collection('matchAnalysisJobs').doc(jobId).get();
    if (!job.exists || job.get('playerId') !== uid) {
        throw new https_1.HttpsError('failed-precondition', 'This import is not linked to a valid analysis.', { reason: 'job' });
    }
    if (job.get('cancelRequested') === true || ['cancelled', 'complete', 'expired'].includes(String(job.get('status')))) {
        throw new https_1.HttpsError('failed-precondition', 'This analysis is no longer open.', { reason: 'job_closed' });
    }
    if (!(0, providerConfig_1.isFootageProcessingApproved)()) {
        throw new https_1.HttpsError('failed-precondition', 'Video analysis is not available yet.', {
            reason: 'ai_privacy_configuration_required',
        });
    }
    await (0, videoConsent_1.assertVideoConsent)(db, uid, jobId, 'cloud_video');
    const plan = await (0, quotaService_1.planFor)(db, uid);
    const maxBytes = Math.min(plan.maxVideoBytes, model_1.UPLOAD_LIMITS.maxBytes);
    const inspection = await (0, videoProviders_1.inspectSource)(body.url, { maxBytes });
    if (inspection.status !== 'ready' || !inspection.mediaUrl) {
        throw new https_1.HttpsError('failed-precondition', 'This link cannot be imported.', {
            reason: inspection.reason,
            inspection: publicInspection(inspection),
        });
    }
    const bytes = Number(inspection.metadata.bytes);
    if (!Number.isInteger(bytes) || bytes < model_1.UPLOAD_LIMITS.minBytes) {
        throw new https_1.HttpsError('failed-precondition', 'This file is too small to be a video.', { reason: 'too_small' });
    }
    const host = String(inspection.metadata.host ?? '');
    const fingerprint = (0, linkImport_1.linkFingerprint)(uid, jobId, inspection.mediaUrl);
    const existing = await db.collection('mediaUploads').where('ownerId', '==', uid).where('fingerprint', '==', fingerprint)
        .limit(5).get();
    const open = existing.docs.find((doc) => ['uploading', 'quarantined', 'validated', 'ready'].includes(String(doc.get('state'))));
    if (open) {
        return { uploadId: open.id, state: open.get('state'), bytes, host, reused: true };
    }
    await (0, quotaService_1.consumeQuota)(db, uid, 'full_match_analysis', jobId);
    const now = new Date();
    await (0, sessions_1.reserveUploadSlot)(db, uid, jobId, now);
    const uploadRef = db.collection('mediaUploads').doc();
    const createdAt = now.toISOString();
    await uploadRef.set({
        id: uploadRef.id,
        ownerId: uid,
        purpose: 'match_footage',
        source: 'link',
        sourceHost: host,
        jobId,
        fileName: 'linked-video',
        contentType: (0, linkImport_1.importContentType)(String(inspection.metadata.contentType ?? '')),
        sizeBytes: bytes,
        declaredDurationSec: Number(job.get('durationSec')) || null,
        fingerprint,
        integrityMode: 'crc32c',
        state: 'uploading',
        receivedBytes: 0,
        storagePath: (0, model_1.quarantinePath)(uid, uploadRef.id),
        createdAt,
        updatedAt: createdAt,
    });
    // Server-only: the link may carry an access token. Deleted when the import ends.
    await db.collection(linkImport_1.IMPORT_SOURCES_COLLECTION).doc(uploadRef.id).set({ ownerId: uid, url: inspection.mediaUrl, createdAt });
    await (0, functions_1.getFunctions)().taskQueue((0, region_1.taskQueueName)('processLinkImport')).enqueue({ uploadId: uploadRef.id }, { dispatchDeadlineSeconds: 1800 });
    firebase_functions_1.logger.info('Link import queued', { uploadId: uploadRef.id, host });
    return { uploadId: uploadRef.id, state: 'uploading', bytes, host, reused: false };
});
/** GCS resumable write into the quarantine path; the checksum is declared before finalising. */
function gcsSink(upload, uploadId, db) {
    const file = (0, storage_1.getStorage)().bucket().file(upload.storagePath);
    const stream = file.createWriteStream({
        resumable: true,
        metadata: { contentType: upload.contentType, metadata: { ownerId: upload.ownerId, uploadId, source: 'link' } },
    });
    return {
        async write(chunk) {
            if (!stream.write(chunk))
                await (0, node_events_1.once)(stream, 'drain');
        },
        async beforeEnd(crc32c, bytes) {
            await db.collection('mediaUploads').doc(uploadId).update({
                declaredCrc32c: crc32c,
                checksumDeclaredAt: new Date().toISOString(),
                receivedBytes: bytes,
            });
        },
        async end() {
            stream.end();
            await (0, promises_1.finished)(stream);
        },
        async abort() {
            stream.destroy();
            await file.delete({ ignoreNotFound: true }).catch(() => undefined);
        },
    };
}
async function importCancelled(db, uploadId, upload) {
    const [current, job, consent] = await Promise.all([
        db.collection('mediaUploads').doc(uploadId).get(),
        db.collection('matchAnalysisJobs').doc(upload.jobId).get(),
        db.collection(videoConsent_1.VIDEO_CONSENT_COLLECTION).doc(upload.jobId).get(),
    ]);
    return current.get('state') !== 'uploading'
        || job.get('cancelRequested') === true
        || job.get('status') === 'cancelled'
        || !consent.exists
        || consent.get('uid') !== upload.ownerId
        || consent.get('revokedAt') != null;
}
async function failImport(db, uploadId, upload, reason) {
    const now = new Date().toISOString();
    const ref = db.collection('mediaUploads').doc(uploadId);
    if (reason === 'cancelled') {
        // The cancel path owns the state; make sure nothing is left behind.
        if ((await ref.get()).get('state') === 'uploading') {
            await ref.update({ state: 'cancelled', rejectionReason: 'link_cancelled', updatedAt: now });
            await (0, quotaService_1.releaseQuota)(db, upload.ownerId, 'full_match_analysis', upload.jobId).catch(() => false);
        }
        return;
    }
    await ref.update({ state: 'rejected', rejectionReason: `link_${reason}`, rejectedAt: now, updatedAt: now });
    await (0, quotaService_1.releaseQuota)(db, upload.ownerId, 'full_match_analysis', upload.jobId).catch(() => false);
    const jobRef = db.collection('matchAnalysisJobs').doc(upload.jobId);
    const job = await jobRef.get();
    if (job.exists && job.get('playerId') === upload.ownerId && job.get('videoUploadId') == null) {
        await jobRef.update({ status: 'failed', pipelineState: 'failed', errorCode: 'link_import_failed', error: null, updatedAt: now });
    }
}
/**
 * Task body. Returns what happened; the quarantine trigger takes over after a successful write.
 * Idempotent: only an upload still in `uploading` with its server-only source is imported.
 */
async function processLinkImport(db, uploadId, deps = {}) {
    const ref = db.collection('mediaUploads').doc(uploadId);
    const upload = (await ref.get()).data();
    if (!upload || upload.source !== 'link' || upload.state !== 'uploading')
        return 'skipped';
    const sourceRef = db.collection(linkImport_1.IMPORT_SOURCES_COLLECTION).doc(uploadId);
    const source = await sourceRef.get();
    const url = source.get('url');
    if (!source.exists || source.get('ownerId') !== upload.ownerId || typeof url !== 'string') {
        await failImport(db, uploadId, upload, 'invalid_url');
        return 'failed';
    }
    const plan = await (0, quotaService_1.planFor)(db, upload.ownerId);
    let lastProgressWrite = 0;
    const outcome = await (0, linkImport_1.downloadToQuarantine)({
        url,
        expectedBytes: upload.sizeBytes,
        maxBytes: Math.min(plan.maxVideoBytes, model_1.UPLOAD_LIMITS.maxBytes),
        sink: (deps.sinkFor ?? gcsSink)(upload, uploadId, db),
        open: deps.open,
        resolve: deps.resolve,
        now: deps.now,
        isCancelled: () => importCancelled(db, uploadId, upload),
        onProgress: async (bytes) => {
            const t = Date.now();
            if (t - lastProgressWrite < 5_000)
                return;
            lastProgressWrite = t;
            await ref.update({ receivedBytes: bytes, updatedAt: new Date(t).toISOString() });
        },
    });
    await sourceRef.delete().catch(() => undefined);
    if (!outcome.ok) {
        await failImport(db, uploadId, upload, outcome.reason);
        firebase_functions_1.logger.info('Link import failed', { uploadId, reason: outcome.reason });
        return 'failed';
    }
    firebase_functions_1.logger.info('Link import written to quarantine', { uploadId, bytes: outcome.bytes, host: outcome.finalHost });
    return 'imported';
}
exports.processLinkImportTask = (0, tasks_1.onTaskDispatched)({ retryConfig: { maxAttempts: 1 }, rateLimits: { maxConcurrentDispatches: 4 }, timeoutSeconds: 1800, memory: '1GiB' }, async (request) => {
    const uploadId = request.data?.uploadId;
    if (typeof uploadId !== 'string' || !UPLOAD_ID.test(uploadId))
        return;
    await processLinkImport((0, firestore_1.getFirestore)(), uploadId);
});
//# sourceMappingURL=linkImportJobs.js.map