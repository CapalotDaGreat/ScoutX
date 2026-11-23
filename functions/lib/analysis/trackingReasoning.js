"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.explainTrackingMoment = void 0;
exports.explainMoment = explainMoment;
/**
 * 5.0 callable: explain one confirmed clip (see videoReasoning.ts for the rules). Returns
 *   { status: 'answered', answer, cached }       - validated model answer (or cached one)
 *   { status: 'unavailable', reason }            - a gate failed; nothing was sent anywhere
 *   { status: 'rejected', reason }               - the model's answer failed validation; not shown
 * The app always keeps the clip and the deterministic evidence; this is an optional extra.
 */
const firestore_1 = require("firebase-admin/firestore");
const params_1 = require("firebase-functions/params");
const https_1 = require("firebase-functions/v2/https");
const consentGate_1 = require("../ai/consentGate");
const openRouter_1 = require("../ai/openRouter");
const providerConfig_1 = require("../ai/providerConfig");
const callableOptions_1 = require("../callableOptions");
const rateLimit_1 = require("../security/rateLimit");
const cvConfig_1 = require("./cvConfig");
const frameAnalysis_1 = require("./frameAnalysis");
const trackingCallables_1 = require("./trackingCallables");
const trackingV3_1 = require("./trackingV3");
const mediaSource_1 = require("../uploads/mediaSource");
const videoConsent_1 = require("./videoConsent");
const videoReasoning_1 = require("./videoReasoning");
const openRouterApiKey = (0, params_1.defineSecret)('OPENROUTER_API_KEY');
const JOB_ID = /^[A-Za-z0-9_-]{1,80}$/;
const MOMENT_ID = /^[A-Za-z0-9_-]{1,40}$/;
/**
 * Identical explanations that are already being computed in this instance (a double tap, or a client retry while
 * the first request is still running) share one worker frame extraction and one provider request. Callers join only
 * after their own gate and owner checks passed, and the key is job-scoped, so nothing crosses an account boundary
 * or outlives a revoked consent. Other instances may still compute the same answer once each.
 */
const inFlight = new WeakMap();
async function explainMoment(uid, jobId, momentId, kind, deps) {
    const { db } = deps;
    const jobSnap = await db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId).get();
    if (!jobSnap.exists)
        throw new https_1.HttpsError('not-found', 'Analysis not found.');
    const job = jobSnap.data();
    if (job.playerId !== uid)
        throw new https_1.HttpsError('permission-denied', 'Only the owner can use this.');
    const base = db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId).collection(trackingV3_1.TRACKING_COLLECTION);
    const cur = await base.doc('current').get();
    const report = (cur.get('report') ?? null);
    const version = Number(cur.get('version') ?? 0);
    if (!report || cur.get('stale') === true)
        return { status: 'unavailable', reason: 'report_not_current' };
    const moment = (report.moments ?? []).find((m) => m.id === momentId) ?? null;
    const vc = await db.collection(videoConsent_1.VIDEO_CONSENT_COLLECTION).doc(jobId).get();
    const gate = (0, videoReasoning_1.reasoningGate)({
        env: deps.env,
        footageApproved: (0, providerConfig_1.isFootageProcessingApproved)(deps.env),
        aiConsent: await deps.aiConsent(uid).catch(() => false),
        videoConsent: vc.exists && vc.get('uid') === uid
            ? { providers: Array.isArray(vc.get('providers')) ? vc.get('providers') : [], revokedAt: vc.get('revokedAt') ?? null,
                current: vc.get('policyVersion') === videoConsent_1.VIDEO_CONSENT_VERSION }
            : null,
        moment,
    });
    if (!gate.ok)
        return { status: 'unavailable', reason: gate.reason };
    const m = moment;
    const clip = (0, videoReasoning_1.clipWindow)(m);
    // Frame extraction and the provider call take seconds: consent may be revoked or a correction published meanwhile.
    // Checked before the frames go to the provider and again before anything is stored; a failed check drops the work.
    const stillAllowed = async () => {
        const [vcNow, curNow, jobNow, aiOk] = await Promise.all([
            db.collection(videoConsent_1.VIDEO_CONSENT_COLLECTION).doc(jobId).get(),
            base.doc('current').get(),
            db.collection(frameAnalysis_1.MATCH_COLLECTION).doc(jobId).get(),
            deps.aiConsent(uid).catch(() => false),
        ]);
        if (!jobNow.exists || jobNow.get('playerId') !== uid || jobNow.get('cancelRequested') === true) {
            return { status: 'unavailable', reason: 'analysis_unavailable' };
        }
        const currentGate = (0, videoReasoning_1.reasoningGate)({
            env: deps.env, footageApproved: (0, providerConfig_1.isFootageProcessingApproved)(deps.env), aiConsent: aiOk,
            videoConsent: vcNow.exists && vcNow.get('uid') === uid
                ? { providers: Array.isArray(vcNow.get('providers')) ? vcNow.get('providers') : [],
                    revokedAt: vcNow.get('revokedAt') ?? null, current: vcNow.get('policyVersion') === videoConsent_1.VIDEO_CONSENT_VERSION }
                : null,
            moment: m,
        });
        if (!currentGate.ok)
            return { status: 'unavailable', reason: currentGate.reason };
        if (!curNow.get('report') || Number(curNow.get('version') ?? 0) !== version || curNow.get('stale') === true) {
            return { status: 'unavailable', reason: 'report_not_current' };
        }
        return null;
    };
    const cacheRef = base.doc((0, videoReasoning_1.reasoningCacheId)(version, momentId, kind));
    const cached = await cacheRef.get();
    if (cached.exists && cached.get('status') === 'answered') {
        return await stillAllowed() ?? { status: 'answered', answer: cached.get('answer'), cached: true, clip };
    }
    let flights = inFlight.get(db);
    if (!flights) {
        flights = new Map();
        inFlight.set(db, flights);
    }
    const flightKey = `${uid}:${jobId}:${(0, videoReasoning_1.reasoningCacheId)(version, momentId, kind)}`;
    const running = flights.get(flightKey);
    if (running) {
        const answer = await running;
        return await stillAllowed() ?? answer;
    }
    const work = (async () => {
        const times = (0, videoReasoning_1.frameTimes)(clip, videoReasoning_1.MAX_FRAMES);
        if (!job.videoStoragePath)
            return { status: 'unavailable', reason: 'source_unavailable' };
        const sourceUrl = await deps.sourceUrl(job.videoStoragePath).catch(() => null);
        if (!sourceUrl)
            return { status: 'unavailable', reason: 'source_unavailable' };
        const raw = await deps.frames({ contractVersion: 3, jobId, source: { url: sourceUrl }, times, indicator: m.indicator ?? [], maxWidth: 640,
            privacy: { retainNonTargetIdentities: false, faceRecognition: false, persistMedia: false } });
        const frames = (raw?.frames ?? []).filter((f) => typeof f.id === 'string' && /^f\d$/.test(f.id) && typeof f.t === 'number' && f.t >= clip.start - 0.5 && f.t <= clip.end + 0.5
            && typeof f.jpegBase64 === 'string' && f.jpegBase64.length < 400_000).slice(0, videoReasoning_1.MAX_FRAMES);
        if (frames.length < 2)
            return { status: 'unavailable', reason: 'frames_unavailable' };
        const ctx = { number: report.target.number, kit: report.target.kit, position: report.target.position, kind, clip,
            frames: frames.map((f) => ({ id: f.id, t: f.t })), facts: (0, videoReasoning_1.clipFacts)(report, m, clip) };
        const blocked = await stillAllowed();
        if (blocked)
            return blocked;
        const result = await deps.chat((0, videoReasoning_1.buildReasoningMessages)(ctx, frames.map((f) => f.jpegBase64)));
        if (!result.ok)
            return { status: 'unavailable', reason: result.kind === 'upstream' ? 'provider_unavailable' : 'provider_empty' };
        const v = (0, videoReasoning_1.validateReasoning)(result.content, ctx);
        const dropped = await stillAllowed();
        if (dropped)
            return dropped;
        // Store the outcome (answer or rejection reason) - never the frames or the raw model text.
        await cacheRef.set({ status: v.ok ? 'answered' : 'rejected', answer: v.ok ? v.answer : null, reason: v.ok ? null : v.reason,
            kind, momentId, reportVersion: version, clip, provider: 'openrouter_zdr', createdAt: deps.now(), purpose: 'this_match_only' });
        return v.ok ? { status: 'answered', answer: v.answer, cached: false, clip } : { status: 'rejected', reason: v.reason };
    })();
    flights.set(flightKey, work);
    try {
        return await work;
    }
    finally {
        if (flights.get(flightKey) === work)
            flights.delete(flightKey);
    }
}
exports.explainTrackingMoment = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)({ secrets: [openRouterApiKey], timeoutSeconds: 180 }), async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in first.');
    const d = (request.data ?? {});
    if (typeof d.jobId !== 'string' || !JOB_ID.test(d.jobId) || typeof d.momentId !== 'string' || !MOMENT_ID.test(d.momentId)
        || !videoReasoning_1.REASONING_KINDS.includes(d.kind)) {
        throw new https_1.HttpsError('invalid-argument', 'Invalid request.');
    }
    await (0, rateLimit_1.assertCallableRateLimit)(uid, rateLimit_1.VIDEO_REASONING_LIMIT);
    const db = (0, firestore_1.getFirestore)();
    const workerUrl = (0, cvConfig_1.cvWorkerUrl)();
    return explainMoment(uid, d.jobId, d.momentId, d.kind, {
        db,
        env: process.env,
        aiConsent: async (u) => (0, consentGate_1.assertAiConsent)([u], db).then(() => true, () => false),
        frames: workerUrl ? (0, trackingCallables_1.httpTrackingClient)(workerUrl, process.env, 'clipFrames', 60_000) : async () => null,
        chat: async (messages) => {
            const apiKey = openRouterApiKey.value();
            if (!apiKey)
                return { ok: false, kind: 'upstream', status: 0 };
            return (0, openRouter_1.callChat)({ apiKey, model: (0, providerConfig_1.resolveModel)('vision'), messages, title: 'PitchProof clip explanation', temperature: 0.1 });
        },
        sourceUrl: async (p) => (await (0, mediaSource_1.readableSourceFor)(p, 10 * 60 * 1000)).url,
        now: () => new Date().toISOString(),
    });
});
//# sourceMappingURL=trackingReasoning.js.map