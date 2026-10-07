"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateHighlightReelPlan = void 0;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const callableOptions_1 = require("./callableOptions");
const outputValidator_1 = require("./ai/outputValidator");
exports.generateHighlightReelPlan = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const auth = request.auth;
    if (!auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication is required to generate a highlight reel.');
    }
    const body = (request.data ?? {});
    const jobId = body.jobId;
    const preset = body.preset ?? 'best-of';
    const targetDurationSec = Math.max(30, body.targetDurationSec ?? 45);
    if (!jobId) {
        return {
            status: 'insufficient-evidence',
            preset,
            title: 'No match analysis available',
            targetDurationSec,
            candidates: [],
        };
    }
    const jobSnapshot = await (0, firestore_1.getFirestore)().collection('matchAnalysisJobs').doc(jobId).get();
    if (!jobSnapshot.exists) {
        throw new https_1.HttpsError('not-found', 'Match analysis not found.');
    }
    const job = jobSnapshot.data();
    if (job?.playerId !== auth.uid) {
        throw new https_1.HttpsError('permission-denied', 'You can only build reels from your own matches.');
    }
    const reportConfidence = job.report?.confidence;
    // Only moments with a real timestamp and a model confidence become reel candidates.
    const moments = typeof reportConfidence === 'number'
        ? (job.report?.moments ?? [])
            .filter((moment) => typeof moment.timestampSec === 'number' && Number.isFinite(moment.timestampSec))
            .map((moment, index) => ({
            id: `moment-${index}`,
            title: (0, outputValidator_1.cleanModelText)(moment.label, 80) || 'Match moment',
            eventType: moment.label?.toLowerCase().includes('goal') ? 'Goal' : 'Match action',
            confidence: reportConfidence,
            timestampSec: moment.timestampSec,
        }))
        : [];
    if (!moments.length) {
        return {
            status: 'insufficient-evidence',
            preset,
            title: 'No reliable moments detected',
            targetDurationSec,
            candidates: [],
        };
    }
    return {
        status: 'ready',
        preset,
        title: preset === 'social' ? 'Social short-form reel' : 'Evidence-based match story',
        targetDurationSec,
        candidates: moments.slice(0, 6),
    };
});
//# sourceMappingURL=highlightReelStudio.js.map