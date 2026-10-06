"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onActivityCreatedPush = exports.persistAppleAuthorizationCode = exports.deleteAuthenticatedAccount = exports.exportReel = exports.getMediaPlaybackUrl = exports.askThisMatch = exports.onVerificationWrittenSyncTrust = exports.requestEvidence = exports.onPassportSummaryWrittenNotifyWatchers = exports.onRecruitmentEntryWritten = exports.searchDiscoverablePlayers = exports.recordDiscoverableView = exports.onPassportSummaryWrittenProjectDiscovery = exports.onProfileWrittenProjectDiscovery = exports.refreshPublicPassport = exports.onProfileWrittenProjectPassport = exports.confirmRole = exports.recordPortfolioView = exports.resolveVerificationRequest = exports.listAdminReviewQueue = exports.archiveContentReport = exports.scheduleWeeklyFootballReports = exports.generateHighlightReelPlan = exports.analyzeMatchFootage = exports.generateAiInsight = void 0;
require("./authSecurityPolicy");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("firebase-functions/v2/firestore");
const firebase_functions_1 = require("firebase-functions");
const notificationPolicy_1 = require("./notificationPolicy");
var aiCoach_1 = require("./aiCoach");
Object.defineProperty(exports, "generateAiInsight", { enumerable: true, get: function () { return aiCoach_1.generateAiInsight; } });
var matchAnalysis_1 = require("./matchAnalysis");
Object.defineProperty(exports, "analyzeMatchFootage", { enumerable: true, get: function () { return matchAnalysis_1.analyzeMatchFootage; } });
var highlightReelStudio_1 = require("./highlightReelStudio");
Object.defineProperty(exports, "generateHighlightReelPlan", { enumerable: true, get: function () { return highlightReelStudio_1.generateHighlightReelPlan; } });
var weeklyReportScheduler_1 = require("./weeklyReportScheduler");
Object.defineProperty(exports, "scheduleWeeklyFootballReports", { enumerable: true, get: function () { return weeklyReportScheduler_1.scheduleWeeklyFootballReports; } });
var adminReview_1 = require("./adminReview");
Object.defineProperty(exports, "archiveContentReport", { enumerable: true, get: function () { return adminReview_1.archiveContentReport; } });
Object.defineProperty(exports, "listAdminReviewQueue", { enumerable: true, get: function () { return adminReview_1.listAdminReviewQueue; } });
Object.defineProperty(exports, "resolveVerificationRequest", { enumerable: true, get: function () { return adminReview_1.resolveVerificationRequest; } });
var portfolioAnalytics_1 = require("./portfolioAnalytics");
Object.defineProperty(exports, "recordPortfolioView", { enumerable: true, get: function () { return portfolioAnalytics_1.recordPortfolioView; } });
var roleClaims_1 = require("./roleClaims");
Object.defineProperty(exports, "confirmRole", { enumerable: true, get: function () { return roleClaims_1.confirmRole; } });
var publicPassport_1 = require("./publicPassport");
Object.defineProperty(exports, "onProfileWrittenProjectPassport", { enumerable: true, get: function () { return publicPassport_1.onProfileWrittenProjectPassport; } });
Object.defineProperty(exports, "refreshPublicPassport", { enumerable: true, get: function () { return publicPassport_1.refreshPublicPassport; } });
var discoveryProjection_1 = require("./discoveryProjection");
Object.defineProperty(exports, "onProfileWrittenProjectDiscovery", { enumerable: true, get: function () { return discoveryProjection_1.onProfileWrittenProjectDiscovery; } });
Object.defineProperty(exports, "onPassportSummaryWrittenProjectDiscovery", { enumerable: true, get: function () { return discoveryProjection_1.onPassportSummaryWrittenProjectDiscovery; } });
Object.defineProperty(exports, "recordDiscoverableView", { enumerable: true, get: function () { return discoveryProjection_1.recordDiscoverableView; } });
Object.defineProperty(exports, "searchDiscoverablePlayers", { enumerable: true, get: function () { return discoveryProjection_1.searchDiscoverablePlayers; } });
var watchlist_1 = require("./watchlist");
Object.defineProperty(exports, "onRecruitmentEntryWritten", { enumerable: true, get: function () { return watchlist_1.onRecruitmentEntryWritten; } });
Object.defineProperty(exports, "onPassportSummaryWrittenNotifyWatchers", { enumerable: true, get: function () { return watchlist_1.onPassportSummaryWrittenNotifyWatchers; } });
var evidenceRequests_1 = require("./evidenceRequests");
Object.defineProperty(exports, "requestEvidence", { enumerable: true, get: function () { return evidenceRequests_1.requestEvidence; } });
var trustSync_1 = require("./trustSync");
Object.defineProperty(exports, "onVerificationWrittenSyncTrust", { enumerable: true, get: function () { return trustSync_1.onVerificationWrittenSyncTrust; } });
var askThisMatch_1 = require("./askThisMatch");
Object.defineProperty(exports, "askThisMatch", { enumerable: true, get: function () { return askThisMatch_1.askThisMatch; } });
var mediaAccess_1 = require("./mediaAccess");
Object.defineProperty(exports, "getMediaPlaybackUrl", { enumerable: true, get: function () { return mediaAccess_1.getMediaPlaybackUrl; } });
Object.defineProperty(exports, "exportReel", { enumerable: true, get: function () { return mediaAccess_1.exportReel; } });
var appleAuth_1 = require("./appleAuth");
Object.defineProperty(exports, "deleteAuthenticatedAccount", { enumerable: true, get: function () { return appleAuth_1.deleteAuthenticatedAccount; } });
Object.defineProperty(exports, "persistAppleAuthorizationCode", { enumerable: true, get: function () { return appleAuth_1.persistAppleAuthorizationCode; } });
(0, app_1.initializeApp)();
/**
 * Push copy is fixed server-side: activity title/body are client-written and must not be
 * relayed to another user's lock screen (phishing / harassment vector).
 */
const PUSH_COPY = {
    portfolio_viewed: {
        title: 'Football Passport viewed',
        body: 'Someone viewed your Football Passport. Open ScoutX to see details.',
    },
    recommendation_received: {
        title: 'New recommendation',
        body: 'You received a new recommendation on your Football Passport.',
    },
    trial_invitation: {
        title: 'Trial invitation',
        body: 'You have a new trial invitation. Open ScoutX to respond.',
    },
};
/** Self-addressed system activities may use their own copy (the author is the recipient). */
function resolvePushCopy(activity) {
    const type = activity.type ?? '';
    if (PUSH_COPY[type]) {
        return PUSH_COPY[type];
    }
    if (activity.actorId === 'system' && activity.title && activity.body) {
        return { title: activity.title.slice(0, 120), body: activity.body.slice(0, 300) };
    }
    return null;
}
async function isGenuineTrialInvitation(activity) {
    const trialId = activity.reference?.entityId;
    if (!trialId || typeof trialId !== 'string') {
        return false;
    }
    const trial = await (0, firestore_1.getFirestore)().collection('trialInvitations').doc(trialId).get();
    const data = trial.data();
    return data?.scoutId === activity.actorId && data?.playerId === activity.recipientId;
}
const HOUR_MS = 60 * 60 * 1000;
/** Minimum gap between pushes of the same type to one recipient, to prevent notification spam. */
const PUSH_COOLDOWN_MS = {
    portfolio_viewed: 6 * HOUR_MS,
    recommendation_received: 0.25 * HOUR_MS,
    milestone_earned: 1 * HOUR_MS,
    weekly_report_ready: 24 * HOUR_MS,
    trial_invitation: 2 * 60 * 1000,
};
const PUSH_THROTTLE_COLLECTION = 'pushThrottle';
/**
 * Atomically applies the recipient's stored preferences, the per-type cooldown and the hourly
 * cap, then claims a push slot. Returns the reason when the push must not be sent.
 */
async function claimPushSlot(recipientId, type) {
    const db = (0, firestore_1.getFirestore)();
    const throttleRef = db.collection(PUSH_THROTTLE_COLLECTION).doc(recipientId);
    const preferencesRef = db.collection('notificationPreferences').doc(recipientId);
    return db.runTransaction(async (transaction) => {
        const [throttle, preferencesSnapshot] = await Promise.all([
            transaction.get(throttleRef),
            transaction.get(preferencesRef),
        ]);
        const now = Date.now();
        const data = throttle.data() ?? {};
        const recent = Array.isArray(data.recent)
            ? data.recent.filter((value) => typeof value === 'number')
            : [];
        const decision = (0, notificationPolicy_1.decidePush)(type, (0, notificationPolicy_1.parseStoredPreferences)(preferencesSnapshot.data()), recent, now);
        if (!decision.send) {
            return decision;
        }
        const cooldown = PUSH_COOLDOWN_MS[type] ?? 0;
        const lastSent = typeof data[type] === 'number' ? data[type] : 0;
        if (cooldown > 0 && now - lastSent < cooldown) {
            return { send: false, reason: 'cooldown' };
        }
        const keep = recent.filter((time) => now - time < HOUR_MS).slice(-notificationPolicy_1.MAX_PUSHES_PER_HOUR);
        transaction.set(throttleRef, { [type]: now, recent: [...keep, now] }, { merge: true });
        return decision;
    });
}
async function sendExpoPush(token, title, body) {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            to: token,
            sound: 'default',
            title,
            body,
            priority: 'high',
        }),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Expo push failed (${response.status}): ${text}`);
    }
}
exports.onActivityCreatedPush = (0, firestore_2.onDocumentCreated)('activities/{activityId}', async (event) => {
    const activity = event.data?.data();
    if (!activity?.recipientId || !activity.title || !activity.body) {
        return;
    }
    if (!activity.type || !(activity.type in notificationPolicy_1.ACTIVITY_CATEGORY)) {
        return;
    }
    if (activity.type === 'portfolio_viewed' && activity.actorId === activity.recipientId) {
        return;
    }
    const copy = resolvePushCopy(activity);
    if (!copy) {
        return;
    }
    if (activity.type === 'trial_invitation' && !(await isGenuineTrialInvitation(activity))) {
        firebase_functions_1.logger.warn('Skipping push for unverified trial invitation activity', {
            recipientId: activity.recipientId,
        });
        return;
    }
    const decision = await claimPushSlot(activity.recipientId, activity.type);
    if (!decision.send) {
        firebase_functions_1.logger.info('Push suppressed', {
            recipientId: activity.recipientId,
            type: activity.type,
            reason: decision.reason,
        });
        return;
    }
    const tokenSnapshot = await (0, firestore_1.getFirestore)()
        .collection('pushTokens')
        .doc(activity.recipientId)
        .get();
    const tokenData = tokenSnapshot.data();
    if (!tokenData?.token) {
        firebase_functions_1.logger.info('No push token for recipient', { recipientId: activity.recipientId });
        return;
    }
    try {
        await sendExpoPush(tokenData.token, copy.title, copy.body);
        firebase_functions_1.logger.info('Push notification sent', {
            recipientId: activity.recipientId,
            type: activity.type,
        });
    }
    catch (error) {
        firebase_functions_1.logger.error('Failed to send push notification', {
            recipientId: activity.recipientId,
            error,
        });
    }
});
//# sourceMappingURL=index.js.map