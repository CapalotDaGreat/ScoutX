"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordPortfolioView = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const callableOptions_1 = require("./callableOptions");
const notificationProducers_1 = require("./notificationProducers");
function currentWeekStart() {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString();
}
function emptyAnalytics() {
    return {
        totalViews: 0,
        viewsThisWeek: 0,
        scoutViews: 0,
        scoutViewsThisWeek: 0,
        weekStartedAt: currentWeekStart(),
        lastViewedAt: null,
    };
}
exports.recordPortfolioView = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    if (!request.auth?.uid) {
        throw new https_1.HttpsError('unauthenticated', 'Sign in required to record portfolio views.');
    }
    const data = request.data;
    const playerId = data.playerId?.trim();
    if (!playerId) {
        throw new https_1.HttpsError('invalid-argument', 'playerId is required.');
    }
    if (request.auth.uid === playerId) {
        return { success: true, skipped: true };
    }
    const role = request.auth.token.role;
    const isScoutView = typeof role === 'string' && ['scout', 'coach', 'club'].includes(role);
    const db = (0, firestore_1.getFirestore)();
    const ref = db.collection('portfolioAnalytics').doc(playerId);
    const weekStart = currentWeekStart();
    // Day precision only, so a player cannot match a view to an individual visitor's timing.
    const now = new Date().toISOString().slice(0, 10);
    await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const existing = snapshot.exists
            ? snapshot.data()
            : emptyAnalytics();
        const resetWeek = existing.weekStartedAt !== weekStart;
        const totalViews = (existing.totalViews ?? 0) + 1;
        const viewsThisWeek = resetWeek ? 1 : (existing.viewsThisWeek ?? 0) + 1;
        const scoutViews = isScoutView ? (existing.scoutViews ?? 0) + 1 : (existing.scoutViews ?? 0);
        const scoutViewsThisWeek = isScoutView
            ? resetWeek
                ? 1
                : (existing.scoutViewsThisWeek ?? 0) + 1
            : resetWeek
                ? 0
                : (existing.scoutViewsThisWeek ?? 0);
        transaction.set(ref, {
            totalViews,
            viewsThisWeek,
            scoutViews,
            scoutViewsThisWeek,
            weekStartedAt: weekStart,
            lastViewedAt: now,
        });
    });
    await (0, notificationProducers_1.notifyPassportViewed)(db, playerId);
    return { success: true };
});
//# sourceMappingURL=portfolioAnalytics.js.map