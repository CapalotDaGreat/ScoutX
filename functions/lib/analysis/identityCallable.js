"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.confirmAnalysisIdentity = exports.MAX_IDENTITY_FRAMES = void 0;
exports.parseIdentityRequest = parseIdentityRequest;
exports.releasePendingCoaching = releasePendingCoaching;
exports.markIdentityRejected = markIdentityRejected;
exports.applyIdentityDecision = applyIdentityDecision;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const callableOptions_1 = require("../callableOptions");
const frameAnalysis_1 = require("./frameAnalysis");
const reportSections_1 = require("./reportSections");
exports.MAX_IDENTITY_FRAMES = 6;
function parseIdentityRequest(data) {
    if (!data || typeof data !== 'object')
        return null;
    const input = data;
    if (typeof input.jobId !== 'string' || !/^[A-Za-z0-9_-]{6,80}$/.test(input.jobId))
        return null;
    if (input.decision !== 'confirmed' && input.decision !== 'rejected')
        return null;
    const frameIds = Array.isArray(input.frameIds)
        ? [...new Set(input.frameIds.filter((id) => typeof id === 'string' && /^frame_[0-9]{1,6}$/.test(id)))]
        : [];
    if (input.decision === 'confirmed' && (frameIds.length === 0 || frameIds.length > exports.MAX_IDENTITY_FRAMES))
        return null;
    return { jobId: input.jobId, decision: input.decision, frameIds: input.decision === 'confirmed' ? frameIds : [] };
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
function markIdentityRejected(report) {
    const sections = Array.isArray(report.sections) ? report.sections : [];
    return {
        ...report,
        identityRejected: true,
        sections: sections.map((section) => section.id === 'identity' ? { ...section, availability: 'INSUFFICIENT_EVIDENCE', reason: 'target_not_seen' } : section),
    };
}
async function applyIdentityDecision(db, uid, request) {
    const ref = db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(request.jobId);
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists)
            throw new https_1.HttpsError('not-found', 'Match analysis job not found.');
        const job = snap.data();
        if (job.playerId !== uid)
            throw new https_1.HttpsError('permission-denied', 'You can only confirm your own analysis.');
        const known = new Set((job.frames ?? []).map((frame) => frame.id || `frame_${frame.index}`));
        if (request.frameIds.some((id) => !known.has(id))) {
            throw new https_1.HttpsError('invalid-argument', 'Pick frames from this analysis.');
        }
        const now = new Date().toISOString();
        const identityConfirmation = request.decision === 'confirmed'
            ? { state: 'confirmed', frameIds: request.frameIds, confirmedAt: now }
            : { state: 'rejected', frameIds: [], confirmedAt: null };
        const update = { identityConfirmation, pendingCoaching: null, updatedAt: now };
        let released = false;
        if (job.status === 'complete' && job.report) {
            if (request.decision === 'confirmed') {
                update.report = releasePendingCoaching(job.report, job.pendingCoaching ?? null, job);
                released = Boolean(job.pendingCoaching);
            }
            else {
                update.report = markIdentityRejected(job.report);
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