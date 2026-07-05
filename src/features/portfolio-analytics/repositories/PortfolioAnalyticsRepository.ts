import { doc, getDoc } from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import { createCallableFunction } from '@/firebase/callableFunctions';

export type PortfolioAnalytics = {
  totalViews: number;
  viewsThisWeek: number;
  scoutViews: number;
  scoutViewsThisWeek: number;
  weekStartedAt: string;
  lastViewedAt: string | null;
};

const COLLECTION = 'portfolioAnalytics';

function currentWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString();
}

function emptyAnalytics(): PortfolioAnalytics {
  return {
    totalViews: 0,
    viewsThisWeek: 0,
    scoutViews: 0,
    scoutViewsThisWeek: 0,
    weekStartedAt: currentWeekStart(),
    lastViewedAt: null,
  };
}

export class PortfolioAnalyticsRepository {
  private static instance: PortfolioAnalyticsRepository | null = null;

  private constructor() {}

  public static getInstance(): PortfolioAnalyticsRepository {
    if (!this.instance) {
      this.instance = new PortfolioAnalyticsRepository();
    }
    return this.instance;
  }

  public async fetchAnalytics(playerId: string): Promise<PortfolioAnalytics> {
    const db = getFirestoreDb();
    if (!db) {
      return emptyAnalytics();
    }

    try {
      const snapshot = await getDoc(doc(db, COLLECTION, playerId));
      if (!snapshot.exists()) {
        return emptyAnalytics();
      }
      const data = snapshot.data();
      const weekStartedAt =
        typeof data.weekStartedAt === 'string' ? data.weekStartedAt : currentWeekStart();
      const sameWeek = weekStartedAt === currentWeekStart();

      return {
        totalViews: typeof data.totalViews === 'number' ? data.totalViews : 0,
        viewsThisWeek:
          sameWeek && typeof data.viewsThisWeek === 'number' ? data.viewsThisWeek : 0,
        scoutViews: typeof data.scoutViews === 'number' ? data.scoutViews : 0,
        scoutViewsThisWeek:
          sameWeek && typeof data.scoutViewsThisWeek === 'number' ? data.scoutViewsThisWeek : 0,
        weekStartedAt,
        lastViewedAt: typeof data.lastViewedAt === 'string' ? data.lastViewedAt : null,
      };
    } catch {
      return emptyAnalytics();
    }
  }

  public async recordPortfolioView(playerId: string, isScoutView = false): Promise<void> {
    const callable = createCallableFunction<{ playerId: string; isScoutView: boolean }>(
      'recordPortfolioView',
    );
    if (!callable) {
      return;
    }

    try {
      await callable({ playerId, isScoutView });
    } catch {
      // Best-effort analytics when Cloud Functions are unavailable.
    }
  }
}
