"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onActivityCreatedPush = exports.persistAppleAuthorizationCode = exports.deleteAuthenticatedAccount = exports.recordPortfolioView = exports.resolveVerificationRequest = exports.listAdminReviewQueue = exports.archiveContentReport = exports.scheduleWeeklyFootballReports = exports.generateHighlightReelPlan = exports.analyzeMatchFootage = exports.generateAiInsight = void 0;
require("./authSecurityPolicy");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("firebase-functions/v2/firestore");
const firebase_functions_1 = require("firebase-functions");
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
var appleAuth_1 = require("./appleAuth");
Object.defineProperty(exports, "deleteAuthenticatedAccount", { enumerable: true, get: function () { return appleAuth_1.deleteAuthenticatedAccount; } });
Object.defineProperty(exports, "persistAppleAuthorizationCode", { enumerable: true, get: function () { return appleAuth_1.persistAppleAuthorizationCode; } });
(0, app_1.initializeApp)();
const HOUR_MS = 60 * 60 * 1000;
/** Minimum gap between pushes of the same type to one recipient, to prevent notification spam. */
const PUSH_COOLDOWN_MS = {
    portfolio_viewed: 6 * HOUR_MS,
    recommendation_received: 0.25 * HOUR_MS,
    milestone_earned: 1 * HOUR_MS,
    weekly_report_ready: 24 * HOUR_MS,
    trial_invitation: 0,
};
const PUSH_THROTTLE_COLLECTION = 'pushThrottle';
/** Atomically claims a push slot; returns false when the recipient was notified too recently. */
async function claimPushSlot(recipientId, type) {
    const cooldown = PUSH_COOLDOWN_MS[type] ?? 0;
    if (cooldown <= 0) {
        return true;
    }
    const db = (0, firestore_1.getFirestore)();
    const ref = db.collection(PUSH_THROTTLE_COLLECTION).doc(recipientId);
    return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const lastSent = snapshot.data()?.[type] ?? 0;
        const now = Date.now();
        if (now - lastSent < cooldown) {
            return false;
        }
        transaction.set(ref, { [type]: now }, { merge: true });
        return true;
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
    if (!activity.type || !(activity.type in PUSH_COOLDOWN_MS)) {
        return;
    }
    if (activity.type === 'portfolio_viewed' && activity.actorId === activity.recipientId) {
        return;
    }
    if (!(await claimPushSlot(activity.recipientId, activity.type))) {
        firebase_functions_1.logger.info('Push throttled', { recipientId: activity.recipientId, type: activity.type });
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
        await sendExpoPush(tokenData.token, activity.title, activity.body);
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