"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitAnalysisCorrection = exports.correctionTargetKey = exports.CORRECTION_REASONS = exports.CORRECTION_ACTIONS = exports.CORRECTION_TARGET_KINDS = exports.MAX_CORRECTIONS_PER_JOB = exports.CORRECTIONS_SUBCOLLECTION = void 0;
exports.parseCorrectionRequest = parseCorrectionRequest;
exports.correctionTargetExists = correctionTargetExists;
exports.latestCorrections = latestCorrections;
exports.submitCorrection = submitCorrection;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const callableOptions_1 = require("../callableOptions");
const frameAnalysis_1 = require("./frameAnalysis");
const videoConsent_1 = require("./videoConsent");
const identityCallable_1 = require("./identityCallable");
/**
 * Player feedback on a finished analysis. Each correction is an append-only record
 * (actor, time, target, action, reason) in
 * matchAnalysisJobs/{jobId}/corrections. Corrections never turn into confirmed statistics, and
 * they are not used to train any model. Identity rejection additionally invalidates the
 * current report's dependent claims; withdrawing feedback cannot resurrect them.
 */
exports.CORRECTIONS_SUBCOLLECTION = 'corrections';
exports.MAX_CORRECTIONS_PER_JOB = 300;
exports.CORRECTION_TARGET_KINDS = ['possible_event', 'event', 'observation', 'identity_frame'];
exports.CORRECTION_ACTIONS = ['confirm', 'dispute', 'dismiss_false_event', 'is_me', 'not_me', 'withdraw'];
exports.CORRECTION_REASONS = ['not_me', 'did_not_happen', 'wrong_type', 'wrong_time', 'other'];
const ALLOWED_ACTIONS = {
    possible_event: ['confirm', 'dispute', 'dismiss_false_event', 'withdraw'],
    event: ['confirm', 'dispute', 'dismiss_false_event', 'withdraw'],
    observation: ['confirm', 'dispute', 'withdraw'],
    identity_frame: ['is_me', 'not_me', 'withdraw'],
};
const JOB_ID = /^[A-Za-z0-9_-]{6,80}$/;
const TARGET_ID = /^[A-Za-z0-9_.:-]{1,80}$/;
const oneOf = (values, value) => typeof value === 'string' && values.includes(value);
function parseCorrectionRequest(data) {
    if (!data || typeof data !== 'object')
        return null;
    const input = data;
    if (typeof input.jobId !== 'string' || !JOB_ID.test(input.jobId))
        return null;
    if (input.expectedAnchorRevision !== undefined && (!Number.isSafeInteger(input.expectedAnchorRevision) || Number(input.expectedAnchorRevision) < 0))
        return null;
    if (!oneOf(exports.CORRECTION_TARGET_KINDS, input.targetKind))
        return null;
    if (typeof input.targetId !== 'string' || !TARGET_ID.test(input.targetId))
        return null;
    if (!oneOf(exports.CORRECTION_ACTIONS, input.action) || !ALLOWED_ACTIONS[input.targetKind].includes(input.action))
        return null;
    const reason = input.reason == null ? null : oneOf(exports.CORRECTION_REASONS, input.reason) ? input.reason : undefined;
    if (reason === undefined)
        return null;
    const note = typeof input.note === 'string' ? input.note.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 280) || null : null;
    return { jobId: input.jobId, targetKind: input.targetKind, targetId: input.targetId, action: input.action, reason, note,
        ...(input.expectedAnchorRevision !== undefined ? { expectedAnchorRevision: Number(input.expectedAnchorRevision) } : {}),
    };
}
/** A correction must point at something the player was actually shown in this analysis. */
function correctionTargetExists(report, frames, kind, id) {
    switch (kind) {
        case 'possible_event':
            return (report?.possibleEvents ?? []).some((item) => item.id === id);
        case 'event':
            return (report?.events ?? []).some((item) => item.eventId === id);
        case 'observation':
            return (report?.evidence ?? []).some((item) => item.id === id);
        case 'identity_frame':
            return (frames ?? []).some((frame) => (frame.id ?? `frame_${String(frame.index)}`) === id);
    }
}
const correctionTargetKey = (kind, id) => `${kind}:${id}`;
exports.correctionTargetKey = correctionTargetKey;
/** Latest non-withdrawn correction per target, by creation time then id. */
function latestCorrections(records) {
    const sorted = [...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const latest = new Map();
    for (const record of sorted) {
        const key = (0, exports.correctionTargetKey)(record.targetKind, record.targetId);
        if (record.action === 'withdraw')
            latest.delete(key);
        else
            latest.set(key, record);
    }
    return latest;
}
async function submitCorrection(db, uid, request, now = new Date()) {
    const jobRef = db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(request.jobId);
    const job = await jobRef.get();
    if (!job.exists || job.get('playerId') !== uid)
        throw new https_1.HttpsError('not-found', 'Match analysis job not found.');
    if (job.get('status') !== 'complete' || !job.get('report')) {
        throw new https_1.HttpsError('failed-precondition', 'Feedback is possible once the analysis is complete.', { reason: 'not_complete' });
    }
    const consent = await db.collection(videoConsent_1.VIDEO_CONSENT_COLLECTION).doc(request.jobId).get();
    if (consent.exists && (consent.get('uid') !== uid || consent.get('revokedAt') != null)) {
        throw new https_1.HttpsError('failed-precondition', 'Consent for this analysis was withdrawn.', { reason: 'consent_withdrawn' });
    }
    if (!correctionTargetExists(job.get('report'), job.get('frames'), request.targetKind, request.targetId)) {
        throw new https_1.HttpsError('invalid-argument', 'This item is not part of the analysis.', { reason: 'unknown_target' });
    }
    const corrections = jobRef.collection(exports.CORRECTIONS_SUBCOLLECTION);
    return db.runTransaction(async (tx) => {
        const latest = await tx.get(jobRef);
        const latestConsent = await tx.get(db.collection(videoConsent_1.VIDEO_CONSENT_COLLECTION).doc(request.jobId));
        const priorEvidence = await tx.get(jobRef.collection('identityEvidence').doc('current'));
        const priorStaging = await tx.get(jobRef.collection('identityEvidenceStaging').doc('current'));
        if (!latest.exists || latest.get('playerId') !== uid || latest.get('status') !== 'complete') {
            throw new https_1.HttpsError('failed-precondition', 'The analysis changed. Reload before adding feedback.');
        }
        const targetRevision = latest.get('experimentalTargetIdentity.revision') ?? 0;
        if ((targetRevision > 0 && request.expectedAnchorRevision === undefined)
            || (request.expectedAnchorRevision !== undefined && request.expectedAnchorRevision !== targetRevision)) {
            throw new https_1.HttpsError('aborted', 'The target selection changed. Reload before adding feedback.');
        }
        if (latestConsent.exists && (latestConsent.get('uid') !== uid || latestConsent.get('revokedAt') != null)) {
            throw new https_1.HttpsError('failed-precondition', 'Consent for this analysis was withdrawn.', { reason: 'consent_withdrawn' });
        }
        if (!correctionTargetExists(latest.get('report'), latest.get('frames'), request.targetKind, request.targetId)) {
            throw new https_1.HttpsError('invalid-argument', 'This item is not part of the current analysis.', { reason: 'unknown_target' });
        }
        const existing = await tx.get(corrections.orderBy('createdAt', 'desc').limit(exports.MAX_CORRECTIONS_PER_JOB));
        const records = existing.docs.map((doc) => ({ ...doc.data(), id: doc.id }))
            .filter((record) => (record.targetRevision ?? 0) === targetRevision);
        const key = (0, exports.correctionTargetKey)(request.targetKind, request.targetId);
        const current = latestCorrections(records).get(key) ?? null;
        if (request.action === 'withdraw' ? current === null : current?.action === request.action && current.reason === request.reason) {
            if (request.action === 'not_me' || (request.action === 'dispute' && request.reason === 'not_me')) {
                (0, identityCallable_1.clearIdentityArtifacts)(tx, jobRef, priorEvidence.get('payloadParts'), priorStaging.get('payloadParts'));
                tx.update(jobRef, {
                    ...(0, identityCallable_1.invalidatedTargetData)(latest.get('report')),
                    identityConfirmation: { state: 'rejected', frameIds: [], confirmedAt: null },
                    identityRejection: { generation: latest.get('pipelineGeneration') ?? 0, targetRevision },
                    pendingCoaching: null, lease: null, updatedAt: now.toISOString(),
                });
            }
            const last = records.find((record) => (0, exports.correctionTargetKey)(record.targetKind, record.targetId) === key);
            return { correctionId: last?.id ?? '', deduplicated: true };
        }
        if (existing.size >= exports.MAX_CORRECTIONS_PER_JOB) {
            throw new https_1.HttpsError('resource-exhausted', 'Too much feedback on this analysis.', { reason: 'limit_reached' });
        }
        const ref = corrections.doc();
        const versions = latest.get('report.versions');
        const record = {
            ...request,
            id: ref.id,
            actorId: uid,
            createdAt: now.toISOString(),
            reportVersion: typeof versions?.analysisVersion === 'number' ? versions.analysisVersion : null,
            usedForTraining: false,
            targetRevision,
        };
        tx.create(ref, record);
        if (request.action === 'not_me' || (request.action === 'dispute' && request.reason === 'not_me')) {
            (0, identityCallable_1.clearIdentityArtifacts)(tx, jobRef, priorEvidence.get('payloadParts'), priorStaging.get('payloadParts'));
            tx.update(jobRef, {
                ...(0, identityCallable_1.invalidatedTargetData)(latest.get('report')),
                identityConfirmation: { state: 'rejected', frameIds: [], confirmedAt: null },
                pendingCoaching: null,
                pipelineGeneration: (latest.get('pipelineGeneration') ?? 0) + 1,
                identityRejection: { generation: (latest.get('pipelineGeneration') ?? 0) + 1, targetRevision },
                lease: null,
                updatedAt: now.toISOString(),
            });
        }
        return { correctionId: ref.id, deduplicated: false };
    });
}
exports.submitAnalysisCorrection = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    const parsed = parseCorrectionRequest(request.data);
    if (!parsed)
        throw new https_1.HttpsError('invalid-argument', 'Invalid feedback.');
    return submitCorrection((0, firestore_1.getFirestore)(), uid, parsed);
});
//# sourceMappingURL=corrections.js.map