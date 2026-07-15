import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createCallableOptions } from './callableOptions';

type PortfolioAnalyticsDoc = {
  totalViews: number;
  viewsThisWeek: number;
  scoutViews: number;
  scoutViewsThisWeek: number;
  weekStartedAt: string;
  lastViewedAt: string | null;
};

function currentWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString();
}

function emptyAnalytics(): PortfolioAnalyticsDoc {
  return {
    totalViews: 0,
    viewsThisWeek: 0,
    scoutViews: 0,
    scoutViewsThisWeek: 0,
    weekStartedAt: currentWeekStart(),
    lastViewedAt: null,
  };
}

export const recordPortfolioView = onCall(createCallableOptions(), async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required to record portfolio views.');
  }

  const data = request.data as { playerId?: string; isScoutView?: boolean };
  const playerId = data.playerId?.trim();
  if (!playerId) {
    throw new HttpsError('invalid-argument', 'playerId is required.');
  }

  if (request.auth.uid === playerId) {
    return { success: true, skipped: true };
  }

  const isScoutView = data.isScoutView === true;
  const db = getFirestore();
  const ref = db.collection('portfolioAnalytics').doc(playerId);
  const weekStart = currentWeekStart();
  const now = new Date().toISOString();

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists
      ? (snapshot.data() as Partial<PortfolioAnalyticsDoc>)
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

  return { success: true };
});
