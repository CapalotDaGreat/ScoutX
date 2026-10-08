"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupAbandonedUploads = exports.cancelUploadSession = exports.declareUploadChecksum = exports.createUploadSession = void 0;
exports.discardUploadsForJob = discardUploadsForJob;
exports.expireAbandonedUploads = expireAbandonedUploads;
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const firebase_functions_1 = require("firebase-functions");
const callableOptions_1 = require("../callableOptions");
const providerConfig_1 = require("../ai/providerConfig");
const videoConsent_1 = require("../analysis/videoConsent");
const consent_1 = require("../legal/consent");
const userSafety_1 = require("../safety/userSafety");
const quotaService_1 = require("../entitlements/quotaService");
const model_1 = require("./model");
const redact_1 = require("../logging/redact");
const REQUEST_ERRORS = {
    purpose: 'Unsupported upload type.',
    job: 'This upload is not linked to a valid analysis.',
    content_type: 'Only MP4 and MOV videos can be uploaded.',
    too_small: 'This file is too small to be a video.',
    too_large: 'Videos can be up to 4 GB.',
    duration: 'Videos can be up to 150 minutes long.',
    fingerprint: 'The file could not be identified. Please pick it again.',
};
/** Browsers get CORS on the session only from allowed origins; the iOS app sends none. */
function sessionOrigin(request) {
    const origin = request.rawRequest?.headers?.origin;
    if (typeof origin !== 'string')
        return undefined;
    const allowed = (0, callableOptions_1.resolveCallableCors)();
    return allowed === true || (Array.isArray(allowed) && allowed.includes(origin)) ? origin : undefined;
}
async function assertMayUpload(uid, db) {
    const policy = await (0, userSafety_1.loadSafetyPolicy)(uid, db);
    if (!policy.youthFunctionalityActive) {
        throw new https_1.HttpsError('failed-precondition', 'Uploads are available once your account setup is complete.', {
            reason: 'not_allowed',
        });
    }
    if (!(await (0, consent_1.hasCurrentConsent)(uid, 'media_upload', db))) {
        throw new https_1.HttpsError('failed-precondition', 'Please acknowledge the Video and Recording Policy before uploading.', {
            reason: 'consent_required',
        });
    }
}
async function sessionUriFor(db, uploadId) {
    const uri = (await db.collection('mediaUploadSessions').doc(uploadId).get()).get('sessionUri');
    return typeof uri === 'string' ? uri : null;
}
/**
 * Opens a GCS resumable session bound to the quarantine path, content type and exact length.
 * The client streams 8 MiB chunks from disk into it. Re-picking the same file resumes the
 * existing upload instead of starting over.
 */
exports.createUploadSession = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)({ timeoutSeconds: 60 }), async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in to upload.');
    const parsed = (0, model_1.parseUploadRequest)((request.data ?? {}));
    if (!parsed.ok) {
        throw new https_1.HttpsError('invalid-argument', REQUEST_ERRORS[parsed.error], { reason: parsed.error });
    }
    const input = parsed.value;
    const db = (0, firestore_1.getFirestore)();
    await assertMayUpload(uid, db);
    const job = await db.collection('matchAnalysisJobs').doc(input.jobId).get();
    if (!job.exists || job.get('playerId') !== uid) {
        throw new https_1.HttpsError('failed-precondition', REQUEST_ERRORS.job);
    }
    if (!(0, providerConfig_1.isFootageProcessingApproved)()) {
        throw new https_1.HttpsError('failed-precondition', 'Video analysis is not available yet.', {
            reason: 'ai_privacy_configuration_required',
        });
    }
    await (0, videoConsent_1.assertVideoConsent)(db, uid, input.jobId, 'cloud_video');
    const plan = await (0, quotaService_1.planFor)(db, uid);
    if (input.sizeBytes > plan.maxVideoBytes || input.declaredDurationSec > plan.maxVideoDurationSec) {
        throw new https_1.HttpsError('failed-precondition', 'This video is longer or larger than your plan allows.', {
            reason: 'plan_limit',
            plan: plan.id,
            maxVideoBytes: plan.maxVideoBytes,
            maxVideoDurationSec: plan.maxVideoDurationSec,
        });
    }
    // Charged before the upload so nobody uploads gigabytes only to hit a limit; refunded if the
    // video is rejected or the job is cancelled before analysis starts.
    await (0, quotaService_1.consumeQuota)(db, uid, 'full_match_analysis', input.jobId);
    const duplicates = await db
        .collection('mediaUploads')
        .where('ownerId', '==', uid)
        .where('fingerprint', '==', input.fingerprint)
        .limit(10)
        .get();
    const reusable = duplicates.docs.find((doc) => doc.get('sizeBytes') === input.sizeBytes
        && doc.get('jobId') === input.jobId
        && model_1.REUSABLE_UPLOAD_STATES.includes(doc.get('state')));
    if (reusable) {
        const state = reusable.get('state');
        const sessionUri = state === 'uploading' ? await sessionUriFor(db, reusable.id) : null;
        if (state !== 'uploading' || sessionUri) {
            return { uploadId: reusable.id, sessionUri, state, chunkBytes: model_1.UPLOAD_LIMITS.chunkBytes, reused: true };
        }
    }
    const active = await db
        .collection('mediaUploads')
        .where('ownerId', '==', uid)
        .where('state', 'in', [...model_1.ACTIVE_UPLOAD_STATES])
        .limit(model_1.UPLOAD_LIMITS.maxActivePerUser + 1)
        .get();
    if (active.docs.filter((doc) => doc.get('jobId') !== input.jobId).length >= model_1.UPLOAD_LIMITS.maxActivePerUser) {
        throw new https_1.HttpsError('resource-exhausted', 'Finish or cancel your current uploads before starting another.', {
            reason: 'limit_reached',
        });
    }
    const now = new Date();
    const limitRef = db.collection('uploadSessionLimits').doc(`${uid}_${(0, model_1.dayKey)(now)}`);
    await db.runTransaction(async (transaction) => {
        const count = (await transaction.get(limitRef)).get('count') ?? 0;
        if (count >= model_1.UPLOAD_LIMITS.maxSessionsPerDay) {
            throw new https_1.HttpsError('resource-exhausted', 'You have started the maximum number of uploads for today.', {
                reason: 'limit_reached',
            });
        }
        transaction.set(limitRef, { ownerId: uid, count: count + 1, updatedAt: now.toISOString() }, { merge: true });
    });
    const uploadRef = db.collection('mediaUploads').doc();
    const storagePath = (0, model_1.quarantinePath)(uid, uploadRef.id);
    const [sessionUri] = await (0, storage_1.getStorage)()
        .bucket()
        .file(storagePath)
        .createResumableUpload({
        metadata: {
            contentType: input.contentType,
            contentLength: input.sizeBytes,
            metadata: { ownerId: uid, uploadId: uploadRef.id },
        },
        origin: sessionOrigin(request),
    });
    const createdAt = now.toISOString();
    await uploadRef.set({
        id: uploadRef.id,
        ownerId: uid,
        purpose: input.purpose,
        jobId: input.jobId,
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        declaredDurationSec: input.declaredDurationSec,
        fingerprint: input.fingerprint,
        integrityMode: input.integrity,
        state: 'uploading',
        storagePath,
        createdAt,
        updatedAt: createdAt,
    });
    await db.collection('mediaUploadSessions').doc(uploadRef.id).set({ ownerId: uid, sessionUri, createdAt });
    return { uploadId: uploadRef.id, sessionUri, state: 'uploading', chunkBytes: model_1.UPLOAD_LIMITS.chunkBytes, reused: false };
});
async function discardUpload(db, uploadId, data, state) {
    const sessionUri = await sessionUriFor(db, uploadId);
    if (sessionUri) {
        // Cancels the GCS session so no further bytes are accepted (GCS answers 499).
        await fetch(sessionUri, { method: 'DELETE' }).catch(() => undefined);
    }
    await (0, storage_1.getStorage)().bucket().file(data.storagePath).delete({ ignoreNotFound: true });
    await db.collection('mediaUploadSessions').doc(uploadId).delete();
    const now = new Date().toISOString();
    await db.collection('mediaUploads').doc(uploadId).update({ state, updatedAt: now });
    if (state === 'expired') {
        await (0, quotaService_1.releaseQuota)(db, data.ownerId, 'full_match_analysis', data.jobId).catch(() => false);
        const jobRef = db.collection('matchAnalysisJobs').doc(data.jobId);
        const job = await jobRef.get();
        if (job.exists && job.get('playerId') === data.ownerId && job.get('status') === 'uploading') {
            await jobRef.update({ status: 'expired', pipelineState: 'expired', updatedAt: now });
        }
    }
}
/** Stops every unfinished upload attached to a job (used when the job is cancelled). */
async function discardUploadsForJob(db, uid, jobId) {
    const snapshot = await db.collection('mediaUploads').where('ownerId', '==', uid).where('jobId', '==', jobId).get();
    let discarded = 0;
    for (const doc of snapshot.docs) {
        const data = doc.data();
        if (!model_1.ACTIVE_UPLOAD_STATES.includes(data.state))
            continue;
        await discardUpload(db, doc.id, data, 'cancelled');
        discarded += 1;
    }
    return discarded;
}
/**
 * Records the CRC32C the client computed from the file on its disk, just before it sends the
 * final chunk. Quarantine compares it with the CRC32C Cloud Storage computed for the stored
 * object; only equality counts as verified.
 */
exports.declareUploadChecksum = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    const body = (request.data ?? {});
    const uploadId = typeof body.uploadId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(body.uploadId) ? body.uploadId : '';
    if (!(0, model_1.isCrc32cBase64)(body.crc32c))
        throw new https_1.HttpsError('invalid-argument', 'Invalid checksum.');
    const db = (0, firestore_1.getFirestore)();
    const ref = uploadId ? db.collection('mediaUploads').doc(uploadId) : null;
    const snap = ref ? await ref.get() : null;
    if (!ref || !snap?.exists || snap.get('ownerId') !== uid)
        throw new https_1.HttpsError('not-found', 'Upload not found.');
    if (snap.get('state') !== 'uploading') {
        throw new https_1.HttpsError('failed-precondition', 'This upload is no longer open.', { reason: 'session_closed' });
    }
    await ref.update({ declaredCrc32c: body.crc32c, checksumDeclaredAt: new Date().toISOString() });
    return { uploadId, declared: true };
});
exports.cancelUploadSession = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    const uploadId = typeof request.data?.uploadId === 'string'
        ? request.data.uploadId
        : '';
    const db = (0, firestore_1.getFirestore)();
    const snap = uploadId ? await db.collection('mediaUploads').doc(uploadId).get() : null;
    const data = snap?.data();
    if (!data || data.ownerId !== uid)
        throw new https_1.HttpsError('not-found', 'Upload not found.');
    if (!model_1.ACTIVE_UPLOAD_STATES.includes(data.state))
        return { uploadId, state: data.state };
    await discardUpload(db, uploadId, data, 'cancelled');
    return { uploadId, state: 'cancelled' };
});
/** Expires uploads that never reached ready within the retention window and deletes their bytes. */
async function expireAbandonedUploads(db, now = new Date()) {
    const snapshot = await db.collection('mediaUploads').where('state', 'in', [...model_1.ACTIVE_UPLOAD_STATES]).limit(200).get();
    let expired = 0;
    for (const doc of snapshot.docs) {
        const data = doc.data();
        if (!(0, model_1.isAbandoned)(data.createdAt, now))
            continue;
        try {
            await discardUpload(db, doc.id, data, 'expired');
            expired += 1;
        }
        catch (error) {
            firebase_functions_1.logger.warn('Upload cleanup failed', { uploadId: doc.id, ...(0, redact_1.logSafeError)(error) });
        }
    }
    return expired;
}
exports.cleanupAbandonedUploads = (0, scheduler_1.onSchedule)('every 24 hours', async () => {
    const expired = await expireAbandonedUploads((0, firestore_1.getFirestore)());
    firebase_functions_1.logger.info('Abandoned uploads expired', { expired });
});
//# sourceMappingURL=sessions.js.map