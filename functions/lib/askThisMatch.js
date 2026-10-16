"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.askThisMatch = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const callableOptions_1 = require("./callableOptions");
const askThisMatch_1 = require("./analysis/askThisMatch");
const outputValidator_1 = require("./ai/outputValidator");
const rateLimit_1 = require("./security/rateLimit");
function asRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value;
}
/**
 * Reasons only over stored events / evidence on an owned job.
 * Insufficient stored data returns a fixed state and never calls a language model.
 */
exports.askThisMatch = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)({}), async (request) => {
    if (!request.auth?.uid) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication is required.');
    }
    const data = asRecord(request.data);
    const jobId = typeof data?.jobId === 'string' ? data.jobId : '';
    const question = typeof data?.question === 'string' ? data.question.trim() : '';
    if (!jobId || !question) {
        throw new https_1.HttpsError('invalid-argument', 'jobId and question are required.');
    }
    if (question.length > 400) {
        throw new https_1.HttpsError('invalid-argument', 'Question is too long.');
    }
    await (0, rateLimit_1.assertCallableRateLimit)(request.auth.uid, rateLimit_1.ASK_THIS_MATCH_LIMIT);
    const snap = await (0, firestore_1.getFirestore)().collection('matchAnalysisJobs').doc(jobId).get();
    if (!snap.exists) {
        throw new https_1.HttpsError('not-found', 'Match analysis job not found.');
    }
    const job = snap.data();
    if (job.playerId !== request.auth.uid) {
        throw new https_1.HttpsError('permission-denied', 'You can only ask about your own analysis.');
    }
    const durationSec = job.measuredDurationSec ?? job.durationSec ?? 0;
    const events = Array.isArray(job.events) ? job.events : [];
    const evidence = Array.isArray(job.report?.evidence) ? job.report.evidence : [];
    const coachingMoments = Array.isArray(job.report?.coachingMoments)
        ? job.report.coachingMoments
        : [];
    const acceptedEvents = events.filter((item) => {
        const row = asRecord(item);
        return row?.validationStatus === 'accepted';
    });
    const observations = evidence.filter((item) => {
        const row = asRecord(item);
        return row?.kind === 'observation';
    });
    const moments = coachingMoments.filter((item) => {
        const row = asRecord(item);
        return Array.isArray(row?.evidenceRefs) && row.evidenceRefs.length > 0;
    });
    if (acceptedEvents.length === 0 && observations.length === 0 && moments.length === 0) {
        return {
            state: 'insufficient',
            answer: askThisMatch_1.NOT_ENOUGH_EVIDENCE,
            citations: [],
        };
    }
    const q = question.toLowerCase();
    const citations = [];
    const lines = [];
    for (const item of acceptedEvents) {
        const row = asRecord(item);
        if (!row) {
            continue;
        }
        const type = typeof row.type === 'string' ? row.type : 'event';
        const eventId = typeof row.eventId === 'string' ? row.eventId : type;
        const blob = `${type} ${typeof row.tacticalPhase === 'string' ? row.tacticalPhase : ''}`.toLowerCase();
        if (q.split(/\s+/).some((token) => token.length >= 3 && blob.includes(token))) {
            lines.push(`Recorded ${type}.`);
            citations.push({
                evidenceId: eventId,
                label: type,
                kind: 'event',
                timestampSec: (0, outputValidator_1.timestampWithin)(row.videoTimestampSec, durationSec),
            });
        }
    }
    for (const item of observations) {
        const row = asRecord(item);
        if (!row) {
            continue;
        }
        const label = (0, outputValidator_1.cleanModelText)(row.label, 80) || 'Observation';
        const detail = (0, outputValidator_1.cleanModelText)(row.detail, 400);
        const blob = `${label} ${detail}`.toLowerCase();
        if (q.split(/\s+/).some((token) => token.length >= 3 && blob.includes(token))) {
            lines.push(detail || label);
            citations.push({
                evidenceId: typeof row.id === 'string' ? row.id : label,
                label,
                kind: 'observation',
                timestampSec: (0, outputValidator_1.timestampWithin)(row.timestampSec, durationSec),
                detail: detail || label,
            });
        }
    }
    for (const item of moments) {
        const row = asRecord(item);
        if (!row) {
            continue;
        }
        const point = (0, outputValidator_1.cleanModelText)(row.coachingPoint, 400);
        const context = (0, outputValidator_1.cleanModelText)(row.context, 400);
        const blob = `${context} ${point}`.toLowerCase();
        if (point && q.split(/\s+/).some((token) => token.length >= 3 && blob.includes(token))) {
            lines.push(point);
            citations.push({
                evidenceId: typeof row.id === 'string' ? row.id : point.slice(0, 40),
                label: point.slice(0, 80),
                kind: 'coaching',
                timestampSec: (0, outputValidator_1.timestampWithin)(row.timestampSec, durationSec),
                detail: point,
            });
        }
    }
    if (lines.length === 0) {
        return {
            state: 'insufficient',
            answer: askThisMatch_1.NOT_ENOUGH_EVIDENCE,
            citations: [],
        };
    }
    return {
        state: 'answered',
        answer: lines.slice(0, 6).join(' '),
        citations: citations.slice(0, 8),
    };
});
//# sourceMappingURL=askThisMatch.js.map