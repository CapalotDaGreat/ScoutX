"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleWeeklyFootballReports = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-admin/firestore");
const firebase_functions_1 = require("firebase-functions");
const WEEKLY_REPORT_ACTIVITY_TYPE = 'weekly_report_ready';
function currentWeekKey() {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday.toISOString().slice(0, 10);
}
exports.scheduleWeeklyFootballReports = (0, scheduler_1.onSchedule)({
    schedule: 'every monday 08:00',
    timeZone: 'Europe/Zurich',
}, async () => {
    const db = (0, firestore_1.getFirestore)();
    const weekKey = currentWeekKey();
    const profilesSnapshot = await db.collection('profiles').limit(500).get();
    let created = 0;
    for (const profileDoc of profilesSnapshot.docs) {
        const profile = profileDoc.data();
        const playerId = profileDoc.id;
        const playerName = typeof profile.fullName === 'string' ? profile.fullName : 'Player';
        const lastWeekKey = typeof profile.lastWeeklyReportWeek === 'string' ? profile.lastWeeklyReportWeek : null;
        if (lastWeekKey === weekKey) {
            continue;
        }
        const matchCount = Array.isArray(profile.statisticsMatches)
            ? profile.statisticsMatches.length
            : 0;
        const portfolioPublic = profile.privacy?.publicPortfolioEnabled === true;
        if (matchCount === 0 && !portfolioPublic) {
            continue;
        }
        const activityId = `weekly-report-${playerId}-${weekKey}`;
        const activityRef = db.collection('activities').doc(activityId);
        const existing = await activityRef.get();
        if (existing.exists) {
            continue;
        }
        await activityRef.set({
            recipientId: playerId,
            recipientRole: 'player',
            type: WEEKLY_REPORT_ACTIVITY_TYPE,
            category: 'system',
            title: 'Weekly Football Report ready',
            body: `Your weekly football summary for ${weekKey} is ready on the Career tab.`,
            actorId: 'system',
            actorName: 'ScoutX',
            actorRole: 'system',
            reference: { entityType: 'player', entityId: playerId, label: playerName },
            read: false,
            createdAt: new Date().toISOString(),
        });
        await profileDoc.ref.set({
            lastWeeklyReportWeek: weekKey,
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
        created += 1;
    }
    firebase_functions_1.logger.info('Weekly football report activities created', { weekKey, created });
});
//# sourceMappingURL=weeklyReportScheduler.js.map