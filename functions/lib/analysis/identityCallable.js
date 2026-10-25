"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.confirmAnalysisIdentity = exports.MAX_IDENTITY_FRAMES = void 0;
exports.clearIdentityArtifacts = clearIdentityArtifacts;
exports.parseIdentityRequest = parseIdentityRequest;
exports.releasePendingCoaching = releasePendingCoaching;
exports.invalidatedTargetData = invalidatedTargetData;
exports.markIdentityRejected = markIdentityRejected;
exports.applyIdentityDecision = applyIdentityDecision;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const callableOptions_1 = require("../callableOptions");
const frameAnalysis_1 = require("./frameAnalysis");
const reportSections_1 = require("./reportSections");
const technique_1 = require("./technique");
const videoConsent_1 = require("./videoConsent");
exports.MAX_IDENTITY_FRAMES = 6;
function clearIdentityArtifacts(tx, ref, parts, stagingParts) {
    tx.delete(ref.collection('identityEvidence').doc('current'));
    tx.delete(ref.collection('identityCoordination').doc('current'));
    tx.delete(ref.collection('identityEvidenceStaging').doc('current'));
    for (const group of [parts, stagingParts])
        if (Array.isArray(group) && group.length <= 64) {
            for (const id of group)
                if (typeof id === 'string' && /^part_[a-f0-9]{16}_[0-9]{1,2}$/.test(id)) {
                    tx.delete(ref.collection('identityEvidence').doc(id));
                }
        }
}
function parseIdentityRequest(data) {
    if (!data || typeof data !== 'object')
        return null;
    const input = data;
    if (typeof input.jobId !== 'string' || !/^[A-Za-z0-9_-]{6,80}$/.test(input.jobId))
        return null;
    if (input.decision !== 'confirmed' && input.decision !== 'rejected')
        return null;
    for (const key of ['expectedGeneration', 'expectedAnchorRevision']) {
        if (input[key] !== undefined && (!Number.isSafeInteger(input[key]) || Number(input[key]) < 0))
            return null;
    }
    const frameIds = Array.isArray(input.frameIds)
        ? [...new Set(input.frameIds.filter((id) => typeof id === 'string' && /^frame_[0-9]{1,6}$/.test(id)))]
        : [];
    if (input.decision === 'confirmed' && (frameIds.length === 0 || frameIds.length > exports.MAX_IDENTITY_FRAMES))
        return null;
    return { jobId: input.jobId, decision: input.decision, frameIds: input.decision === 'confirmed' ? frameIds : [],
        ...(input.expectedGeneration !== undefined ? { expectedGeneration: Number(input.expectedGeneration) } : {}),
        ...(input.expectedAnchorRevision !== undefined ? { expectedAnchorRevision: Number(input.expectedAnchorRevision) } : {}),
    };
}
/** Merges held-back coaching into the report once the player confirmed which person they are. */
function releasePendingCoaching(report, pending, job) {
    const next = { ...report };
    if (pending) {
        next.strengths = pending.strengths;
        next.improvements = pending.improvements;
        next.coachingNotes = pending.coachingNotes;
        if (pending.techniqueAssessment)
            next.techniqueAssessment = pending.techniqueAssessment;
        if (pending.opportunities.length)
            next.opportunities = pending.opportunities;
        if (pending.decisionMoments.length)
            next.decisionMoments = pending.decisionMoments;
        if (pending.clipCoaching && report.clip && typeof report.clip === 'object') {
            next.clip = { ...report.clip, ...pending.clipCoaching, identityBasis: 'confirmed' };
        }
    }
    const evidence = Array.isArray(report.evidence) ? report.evidence : [];
    const technique = next.techniqueAssessment;
    const clip = next.clip;
    const decisions = Array.isArray(next.decisionMoments) ? next.decisionMoments.length : clip?.decision ? 1 : 0;
    next.sections = (0, reportSections_1.buildSections)({
        identityConfirmed: true,
        targetSeenFrames: evidence.filter((item) => item.kind === 'observation').length,
        ratedTechniqueCount: technique?.ratedCount ?? 0,
        decisionMoments: decisions,
        isGoalkeeper: (0, frameAnalysis_1.isGoalkeeperJob)(job),
        goalkeeperNotes: clip?.goalkeeper ? 1 : 0,
        validatedEventCount: 0,
    });
    return next;
}
const INSUFFICIENT_IDENTITY_DIMENSIONS = {
    videoQuality: 'Insufficient', playerIdentity: 'Insufficient', cameraCoverage: 'Insufficient',
    trackingStability: 'Insufficient', eventConfidence: 'Insufficient', overallCoverage: 'Insufficient',
};
function invalidatedTargetData(report) {
    return {
        experimentalIdentityCoordination: null,
        events: [], availability: [], confidenceDimensions: { ...INSUFFICIENT_IDENTITY_DIMENSIONS },
        ...(report ? { report: markIdentityRejected(report) } : {}),
    };
}
function markIdentityRejected(report) {
    const sections = Array.isArray(report.sections) ? report.sections : [];
    return {
        ...report,
        identityRejected: true,
        confidenceDimensions: { ...INSUFFICIENT_IDENTITY_DIMENSIONS },
        headline: 'Target identity rejected - a new review is required',
        strengths: [], improvements: [], coachingNotes: '', opportunities: [], decisionMoments: [],
        evidence: [], events: [], possibleEvents: [], moments: [], coachingMoments: [], segmentSummaries: [],
        eventCounts: null, estimatedStats: (0, frameAnalysis_1.emptyStats)(), clip: null, segments: [], availability: [],
        techniqueAssessment: (0, technique_1.normalizeTechniqueAssessment)(null, new Set(), false, (0, technique_1.parseSelfReportedStars)(null)),
        coverage: { visiblePct: 0, likelyOffCameraPct: 0, unknownPct: 100, confidenceLabel: 'Insufficient', note: 'Target identity was rejected. Dependent observations require a new review.' },
        sampledCoverage: null,
        tacticalSummary: '',
        sections: sections.map((section) => ({ ...section, availability: 'INSUFFICIENT_EVIDENCE', reason: 'identity_unconfirmed' })),
    };
}
async function applyIdentityDecision(db, uid, request) {
    const ref = db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(request.jobId);
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const consent = await tx.get(db.collection(videoConsent_1.VIDEO_CONSENT_COLLECTION).doc(request.jobId));
        const priorEvidence = await tx.get(ref.collection('identityEvidence').doc('current'));
        const priorStaging = await tx.get(ref.collection('identityEvidenceStaging').doc('current'));
        if (!snap.exists)
            throw new https_1.HttpsError('not-found', 'Match analysis job not found.');
        const job = snap.data();
        if (job.playerId !== uid)
            throw new https_1.HttpsError('permission-denied', 'You can only confirm your own analysis.');
        if (!consent.exists || consent.get('uid') !== uid || consent.get('revokedAt') !== null
            || consent.get('policyVersion') !== videoConsent_1.VIDEO_CONSENT_VERSION) {
            throw new https_1.HttpsError('failed-precondition', 'Current video consent is required.');
        }
        const revision = snap.get('experimentalTargetIdentity.revision') ?? 0;
        if ((revision > 0 && (request.expectedGeneration === undefined || request.expectedAnchorRevision === undefined))
            || (request.expectedGeneration !== undefined && request.expectedGeneration !== (job.pipelineGeneration ?? 0))
            || (request.expectedAnchorRevision !== undefined && request.expectedAnchorRevision !== revision)) {
            throw new https_1.HttpsError('aborted', 'The target selection changed. Reload before confirming identity.');
        }
        const rejectionIsCurrent = snap.get('identityRejection.generation') === (job.pipelineGeneration ?? 0)
            && snap.get('identityRejection.targetRevision') === revision;
        if (request.decision === 'confirmed' && (job.identityConfirmation?.state === 'rejected' || rejectionIsCurrent)) {
            throw new https_1.HttpsError('failed-precondition', 'A rejected identity requires a new target review or analysis.');
        }
        const known = new Set((job.frames ?? []).map((frame) => frame.id || `frame_${frame.index}`));
        if (request.frameIds.some((id) => !known.has(id))) {
            throw new https_1.HttpsError('invalid-argument', 'Pick frames from this analysis.');
        }
        const now = new Date().toISOString();
        const identityConfirmation = request.decision === 'confirmed'
            ? { state: 'confirmed', frameIds: request.frameIds, confirmedAt: now }
            : { state: 'rejected', frameIds: [], confirmedAt: null };
        const update = { identityConfirmation, pendingCoaching: null, updatedAt: now };
        if (request.decision === 'rejected') {
            clearIdentityArtifacts(tx, ref, priorEvidence.get('payloadParts'), priorStaging.get('payloadParts'));
            Object.assign(update, invalidatedTargetData(job.report));
            update.pipelineGeneration = (job.pipelineGeneration ?? 0) + 1;
            update.identityRejection = { generation: update.pipelineGeneration, targetRevision: revision };
            update.lease = null;
            if (job.status !== 'complete') {
                update.cancelRequested = true;
                update.status = 'cancelled';
                update.pipelineState = 'cancelled';
            }
        }
        let released = false;
        if (job.status === 'complete' && job.report) {
            if (request.decision === 'confirmed') {
                update.report = releasePendingCoaching(job.report, job.pendingCoaching ?? null, job);
                released = Boolean(job.pendingCoaching);
            }
        }
        tx.update(ref, update);
        return { state: identityConfirmation.state, released };
    });
}
exports.confirmAnalysisIdentity = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    const parsed = parseIdentityRequest(request.data);
    if (!parsed)
        throw new https_1.HttpsError('invalid-argument', `Pick between 1 and ${exports.MAX_IDENTITY_FRAMES} frames that show you.`);
    return applyIdentityDecision((0, firestore_1.getFirestore)(), uid, parsed);
});
//# sourceMappingURL=identityCallable.js.map