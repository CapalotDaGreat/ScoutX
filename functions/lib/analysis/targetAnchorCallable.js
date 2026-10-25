"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveAnalysisTargetAnchor = void 0;
exports.targetAnchorsEnabled = targetAnchorsEnabled;
exports.applyTargetAnchor = applyTargetAnchor;
const node_crypto_1 = require("node:crypto");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const callableOptions_1 = require("../callableOptions");
const frameAnalysis_1 = require("./frameAnalysis");
const identityCallable_1 = require("./identityCallable");
const videoConsent_1 = require("./videoConsent");
const targetAnchors_1 = require("./targetAnchors");
function targetAnchorsEnabled(env = process.env) {
    return env.EXPERIMENTAL_TARGET_ANCHORS === 'true';
}
async function applyTargetAnchor(db, uid, request) {
    if (!targetAnchorsEnabled())
        throw new https_1.HttpsError('failed-precondition', 'Target selection is not enabled.');
    const parsed = (0, targetAnchors_1.parseTargetAnchorRequest)(request);
    if (!parsed)
        throw new https_1.HttpsError('invalid-argument', 'Invalid target anchor.');
    const digest = (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(parsed)).digest('hex');
    const ref = db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(parsed.jobId);
    const consentRef = db.collection(videoConsent_1.VIDEO_CONSENT_COLLECTION).doc(parsed.jobId);
    return db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const consent = await tx.get(consentRef);
        const priorEvidence = await tx.get(ref.collection('identityEvidence').doc('current'));
        const priorStaging = await tx.get(ref.collection('identityEvidenceStaging').doc('current'));
        if (!snapshot.exists)
            throw new https_1.HttpsError('not-found', 'Analysis not found.');
        const job = snapshot.data();
        if (job.playerId !== uid)
            throw new https_1.HttpsError('permission-denied', 'Only the owner can select a target.');
        if (!consent.exists || consent.get('uid') !== uid || consent.get('revokedAt') !== null
            || consent.get('policyVersion') !== videoConsent_1.VIDEO_CONSENT_VERSION) {
            throw new https_1.HttpsError('failed-precondition', 'Current video consent is required.');
        }
        if (job.status !== 'complete' || job.cancelRequested || job.videoStoragePath !== `profiles/${uid}/matchFootage/${parsed.jobId}/video.mp4`) {
            throw new https_1.HttpsError('failed-precondition', 'Select a target in a completed, retained cloud analysis.');
        }
        const current = job.experimentalTargetIdentity;
        const generation = job.pipelineGeneration ?? 0;
        if (!Number.isSafeInteger(generation) || generation < 0 || generation >= Number.MAX_SAFE_INTEGER
            || (current && (current.sourcePath !== job.videoStoragePath || current.schemaVersion !== 1
                || !Number.isSafeInteger(current.revision) || current.revision < 0 || current.revision >= Number.MAX_SAFE_INTEGER))) {
            throw new https_1.HttpsError('failed-precondition', 'Invalid target identity scope.');
        }
        if (current?.lastOperationId === parsed.operationId) {
            if (current.lastOperationDigest !== digest)
                throw new https_1.HttpsError('already-exists', 'Operation ID was reused.');
            return { revision: current.revision, generation };
        }
        if (generation !== parsed.expectedGeneration || (current?.revision ?? 0) !== parsed.expectedRevision) {
            throw new https_1.HttpsError('aborted', 'The analysis changed. Reload before selecting the target.');
        }
        const frame = job.frames.find((item) => (item.id ?? `frame_${item.index}`) === parsed.frameId);
        const duration = job.measuredDurationSec ?? job.durationSec;
        const framePrefix = `profiles/${uid}/matchFootage/${parsed.jobId}/frames/`;
        if (!frame || frame.source !== 'server' || !Number.isFinite(frame.timestampSec) || frame.timestampSec < 0
            || !Number.isFinite(duration) || duration <= 0 || frame.timestampSec >= duration
            || !frame.storagePath.startsWith(framePrefix) || !/^frame_[0-9]+\.jpg$/.test(frame.storagePath.slice(framePrefix.length))) {
            throw new https_1.HttpsError('invalid-argument', 'Select a retained server frame from this analysis.');
        }
        let anchors;
        try {
            anchors = (0, targetAnchors_1.editTargetAnchors)(current?.anchors ?? [], parsed, frame.timestampSec);
        }
        catch {
            throw new https_1.HttpsError('invalid-argument', 'The target anchor limit or geometry is invalid.');
        }
        const now = new Date().toISOString();
        const identity = {
            schemaVersion: 1, targetId: `target_${parsed.jobId}`, sourcePath: job.videoStoragePath,
            revision: (current?.revision ?? 0) + 1, anchors, updatedAt: now,
            lastOperationId: parsed.operationId, lastOperationDigest: digest,
        };
        tx.update(ref, {
            experimentalTargetIdentity: identity,
            pipelineGeneration: generation + 1,
            identityConfirmation: { state: 'pending', frameIds: [], confirmedAt: null },
            identityRejection: null,
            pendingCoaching: null, lease: null, updatedAt: now,
            ...(0, identityCallable_1.invalidatedTargetData)(job.report),
        });
        (0, identityCallable_1.clearIdentityArtifacts)(tx, ref, priorEvidence.get('payloadParts'), priorStaging.get('payloadParts'));
        return { revision: identity.revision, generation: generation + 1 };
    });
}
exports.saveAnalysisTargetAnchor = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    const parsed = (0, targetAnchors_1.parseTargetAnchorRequest)(request.data);
    if (!parsed)
        throw new https_1.HttpsError('invalid-argument', 'Invalid target anchor.');
    return applyTargetAnchor((0, firestore_1.getFirestore)(), uid, parsed);
});
//# sourceMappingURL=targetAnchorCallable.js.map