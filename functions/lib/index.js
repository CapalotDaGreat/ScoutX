"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onActivityCreatedPush = exports.recordPortfolioView = exports.resolveVerificationRequest = exports.listAdminReviewQueue = exports.archiveContentReport = exports.scheduleWeeklyFootballReports = exports.generateAiInsight = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const firestore_2 = require("firebase-functions/v2/firestore");
const firebase_functions_1 = require("firebase-functions");
var aiCoach_1 = require("./aiCoach");
Object.defineProperty(exports, "generateAiInsight", { enumerable: true, get: function () { return aiCoach_1.generateAiInsight; } });
var weeklyReportScheduler_1 = require("./weeklyReportScheduler");
Object.defineProperty(exports, "scheduleWeeklyFootballReports", { enumerable: true, get: function () { return weeklyReportScheduler_1.scheduleWeeklyFootballReports; } });
var adminReview_1 = require("./adminReview");
Object.defineProperty(exports, "archiveContentReport", { enumerable: true, get: function () { return adminReview_1.archiveContentReport; } });
Object.defineProperty(exports, "listAdminReviewQueue", { enumerable: true, get: function () { return adminReview_1.listAdminReviewQueue; } });
Object.defineProperty(exports, "resolveVerificationRequest", { enumerable: true, get: function () { return adminReview_1.resolveVerificationRequest; } });
var portfolioAnalytics_1 = require("./portfolioAnalytics");
Object.defineProperty(exports, "recordPortfolioView", { enumerable: true, get: function () { return portfolioAnalytics_1.recordPortfolioView; } });
(0, app_1.initializeApp)();
const PUSHABLE_ACTIVITY_TYPES = new Set([
    'portfolio_viewed',
    'recommendation_received',
    'milestone_earned',
    'weekly_report_ready',
    'trial_invitation',
]);
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
    if (activity.type && !PUSHABLE_ACTIVITY_TYPES.has(activity.type)) {
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