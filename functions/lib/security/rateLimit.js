"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VIDEO_SOURCE_INSPECT_LIMIT = exports.DISCOVERY_VIEW_LIMIT = exports.AI_INSIGHT_LIMIT = exports.ASK_THIS_MATCH_LIMIT = exports.MEDIA_PLAYBACK_LIMIT = exports.DISCOVERY_SEARCH_LIMIT = void 0;
exports.rateLimitDocId = rateLimitDocId;
exports.assertCallableRateLimit = assertCallableRateLimit;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
function bucketKey(window, now = new Date()) {
    const iso = now.toISOString();
    if (window === 'day') {
        return iso.slice(0, 10);
    }
    return iso.slice(0, 13);
}
function rateLimitDocId(uid, action, window, now = new Date()) {
    return `${uid}_${action}_${bucketKey(window, now)}`;
}
/**
 * Increments the caller's counter for `policy.action` and refuses when the window max is exceeded.
 * Fail-closed: a missing uid is the caller's problem (call after auth checks).
 */
async function assertCallableRateLimit(uid, policy) {
    if (!uid || !policy.action || policy.max < 1) {
        throw new https_1.HttpsError('failed-precondition', 'Rate limit is misconfigured.');
    }
    const db = (0, firestore_1.getFirestore)();
    const ref = db.collection('callableRateLimits').doc(rateLimitDocId(uid, policy.action, policy.window));
    await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(ref);
        const count = snap.get('count') ?? 0;
        if (count >= policy.max) {
            throw new https_1.HttpsError('resource-exhausted', 'Too many requests. Please try again later.', {
                reason: 'rate_limited',
                action: policy.action,
            });
        }
        transaction.set(ref, {
            uid,
            action: policy.action,
            window: policy.window,
            bucket: bucketKey(policy.window),
            count: count + 1,
            updatedAt: new Date().toISOString(),
        }, { merge: true });
    });
}
/** Discovery search is scrapable; keep pages cheap but bound enumeration. */
exports.DISCOVERY_SEARCH_LIMIT = { action: 'discovery_search', max: 60, window: 'hour' };
/** Signed playback URLs are short-lived; still bound minting per account. */
exports.MEDIA_PLAYBACK_LIMIT = { action: 'media_playback', max: 120, window: 'hour' };
/** Local ask-this-match is cheap but unbounded loops waste Functions time. */
exports.ASK_THIS_MATCH_LIMIT = { action: 'ask_this_match', max: 40, window: 'hour' };
/** Text AI coaching is metered by quota elsewhere; this bounds burst spend. */
exports.AI_INSIGHT_LIMIT = { action: 'ai_insight', max: 30, window: 'hour' };
/** View counters should not be a free write amplifier. */
exports.DISCOVERY_VIEW_LIMIT = { action: 'discovery_view', max: 200, window: 'hour' };
/** Video link inspection performs outbound DNS/HEAD requests: bounded per user. */
exports.VIDEO_SOURCE_INSPECT_LIMIT = { action: 'video_source_inspect', max: 30, window: 'hour' };
//# sourceMappingURL=rateLimit.js.map