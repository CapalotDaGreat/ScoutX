"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.revokeVideoProcessingConsent = exports.recordVideoProcessingConsent = exports.VIDEO_CONSENT_ACKNOWLEDGEMENTS = exports.VIDEO_CONSENT_VERSION = exports.VIDEO_CONSENT_COLLECTION = void 0;
exports.parseConsentRequest = parseConsentRequest;
exports.providersFor = providersFor;
exports.assertVideoConsent = assertVideoConsent;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const callableOptions_1 = require("../callableOptions");
const providerConfig_1 = require("../ai/providerConfig");
const sessions_1 = require("../uploads/sessions");
const cvConfig_1 = require("./cvConfig");
const mode_1 = require("./mode");
exports.VIDEO_CONSENT_COLLECTION = 'videoProcessingConsents';
/** Bump when the consent sheet text changes; older records then need a fresh consent. */
exports.VIDEO_CONSENT_VERSION = '2026-10-video-v1';
exports.VIDEO_CONSENT_ACKNOWLEDGEMENTS = ['processing', 'rights', 'retention', 'provider'];
const JOB_ID = /^[A-Za-z0-9_-]{6,80}$/;
function parseConsentRequest(data) {
    if (!data || typeof data !== 'object')
        return null;
    const input = data;
    if (typeof input.jobId !== 'string' || !JOB_ID.test(input.jobId))
        return null;
    const acks = input.acknowledgements;
    if (!acks || !exports.VIDEO_CONSENT_ACKNOWLEDGEMENTS.every((key) => acks[key] === true))
        return null;
    return {
        jobId: input.jobId,
        acknowledgements: { processing: true, rights: true, retention: true, provider: true },
        retainSource: input.retainSource === true,
        keepForRetry: input.keepForRetry === true,
        evidenceClips: input.evidenceClips === true,
    };
}
/** Providers the footage (or frames of it) can reach for this job; recorded in the consent. */
function providersFor(processingMode, cvAvailable) {
    const providers = ['openrouter_zdr'];
    if (processingMode === 'cloud_video')
        providers.unshift('pitchproof_cloud');
    if (processingMode === 'cloud_video' && cvAvailable)
        providers.push('pitchproof_cv_worker');
    return providers;
}
/** Throws unless a current, unrevoked consent exists for this job and processing mode. */
async function assertVideoConsent(db, uid, jobId, processingMode) {
    const snap = await db.collection(exports.VIDEO_CONSENT_COLLECTION).doc(jobId).get();
    const consent = snap.data();
    const valid = consent
        && consent.uid === uid
        && consent.revokedAt === null
        && consent.policyVersion === exports.VIDEO_CONSENT_VERSION
        && (!processingMode || consent.processingMode === processingMode);
    if (!valid) {
        throw new https_1.HttpsError('failed-precondition', 'Confirm how your video is processed before analysis starts.', {
            reason: 'video_consent_required',
        });
    }
    return consent;
}
/**
 * Records explicit consent for one job. Picking a video is not consent: the app calls this only
 * after the player ticked every acknowledgement on the consent sheet.
 */
exports.recordVideoProcessingConsent = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    const parsed = parseConsentRequest(request.data);
    if (!parsed) {
        throw new https_1.HttpsError('invalid-argument', 'Every acknowledgement must be confirmed.', { reason: 'video_consent_incomplete' });
    }
    if (!(0, providerConfig_1.isFootageProcessingApproved)()) {
        throw new https_1.HttpsError('failed-precondition', 'Video analysis is not available yet.', {
            reason: 'ai_privacy_configuration_required',
        });
    }
    const db = (0, firestore_1.getFirestore)();
    const jobRef = db.collection('matchAnalysisJobs').doc(parsed.jobId);
    const job = await jobRef.get();
    if (!job.exists || job.get('playerId') !== uid)
        throw new https_1.HttpsError('not-found', 'Match analysis job not found.');
    if (job.get('status') !== 'uploading') {
        throw new https_1.HttpsError('failed-precondition', 'Consent can only be given before processing starts.');
    }
    const durationSec = Number(job.get('durationSec'));
    const analysisMode = (0, mode_1.selectAnalysisMode)(durationSec, (0, mode_1.parseIntent)(job.get('analysisIntent')));
    if (!analysisMode) {
        throw new https_1.HttpsError('invalid-argument', `Videos can be up to ${mode_1.MODE_LIMITS.maxDurationSec / 60} minutes long.`, {
            reason: 'duration',
        });
    }
    const processingMode = (0, mode_1.processingModeFor)(analysisMode, durationSec);
    const now = new Date().toISOString();
    const consent = {
        uid,
        jobId: parsed.jobId,
        purpose: 'match_analysis',
        analysisMode,
        processingMode,
        providers: providersFor(processingMode, (0, cvConfig_1.cvWorkerStatus)() === 'available'),
        policyVersion: exports.VIDEO_CONSENT_VERSION,
        // Device-frame jobs never upload the video, so there is nothing to keep or cut.
        retainSource: processingMode === 'cloud_video' && parsed.retainSource,
        keepForRetry: processingMode === 'cloud_video' && parsed.keepForRetry,
        evidenceClips: processingMode === 'cloud_video' && parsed.evidenceClips,
        consentedAt: now,
        revokedAt: null,
    };
    const clipContext = job.get('clipContext');
    await db.collection(exports.VIDEO_CONSENT_COLLECTION).doc(parsed.jobId).set(consent);
    await jobRef.update({
        analysisMode,
        processingMode,
        retainSource: consent.retainSource,
        keepForRetry: consent.keepForRetry,
        evidenceClipsRequested: consent.evidenceClips,
        clipContext: (0, mode_1.isClipContext)(clipContext) ? clipContext : 'auto',
        consentVersion: exports.VIDEO_CONSENT_VERSION,
        consentedAt: now,
        updatedAt: now,
    });
    return { jobId: parsed.jobId, analysisMode, processingMode, providers: consent.providers };
});
/** Withdraws consent for a job: processing stops and temporary media is removed. */
exports.revokeVideoProcessingConsent = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    const jobId = request.data?.jobId;
    if (typeof jobId !== 'string' || !JOB_ID.test(jobId))
        throw new https_1.HttpsError('invalid-argument', 'jobId is required.');
    const db = (0, firestore_1.getFirestore)();
    const ref = db.collection(exports.VIDEO_CONSENT_COLLECTION).doc(jobId);
    const snap = await ref.get();
    if (!snap.exists || snap.get('uid') !== uid)
        throw new https_1.HttpsError('not-found', 'Consent not found.');
    const now = new Date().toISOString();
    await ref.update({ revokedAt: now });
    const jobRef = db.collection('matchAnalysisJobs').doc(jobId);
    const job = await jobRef.get();
    if (job.exists && !['complete', 'cancelled', 'expired'].includes(String(job.get('status')))) {
        await jobRef.update({
            cancelRequested: true,
            status: 'cancelled',
            pipelineState: 'cancelled',
            mediaCleanupState: 'pending',
            mediaCleanupDueAt: now,
            cancelledAt: now,
            updatedAt: now,
        });
        await (0, sessions_1.discardUploadsForJob)(db, uid, jobId);
    }
    return { jobId, revokedAt: now };
});
//# sourceMappingURL=videoConsent.js.map