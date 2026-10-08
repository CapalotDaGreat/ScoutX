import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

const WEEKLY_REPORT_ACTIVITY_TYPE = 'weekly_report_ready';

function currentWeekKey(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

export const scheduleWeeklyFootballReports = onSchedule(
  {
    schedule: 'every monday 08:00',
    timeZone: 'Europe/Zurich',
  },
  async () => {
    const db = getFirestore();
    const weekKey = currentWeekKey();
    const profilesSnapshot = await db.collection('profiles').limit(500).get();

    let created = 0;

    for (const profileDoc of profilesSnapshot.docs) {
      const profile = profileDoc.data();
      const playerId = profileDoc.id;
      const playerName = typeof profile.fullName === 'string' ? profile.fullName : 'Player';
      const lastWeekKey =
        typeof profile.lastWeeklyReportWeek === 'string' ? profile.lastWeeklyReportWeek : null;

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
        actorName: 'PitchProof',
        actorRole: 'system',
        reference: { entityType: 'player', entityId: playerId, label: playerName },
        read: false,
        createdAt: new Date().toISOString(),
      });

      await profileDoc.ref.set(
        {
          lastWeeklyReportWeek: weekKey,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      created += 1;
    }

    logger.info('Weekly football report activities created', { weekKey, created });
  },
);
