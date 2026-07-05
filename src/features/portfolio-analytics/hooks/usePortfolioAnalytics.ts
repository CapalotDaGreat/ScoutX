import { useEffect, useState } from 'react';
import {
  PortfolioAnalyticsRepository,
  type PortfolioAnalytics,
} from '@/features/portfolio-analytics/repositories/PortfolioAnalyticsRepository';

const EMPTY_ANALYTICS: PortfolioAnalytics = {
  totalViews: 0,
  viewsThisWeek: 0,
  scoutViews: 0,
  scoutViewsThisWeek: 0,
  weekStartedAt: new Date().toISOString(),
  lastViewedAt: null,
};

export function usePortfolioAnalytics(playerId: string | undefined) {
  const [analytics, setAnalytics] = useState<PortfolioAnalytics>(EMPTY_ANALYTICS);
  const [isLoading, setIsLoading] = useState(Boolean(playerId));

  useEffect(() => {
    if (!playerId) {
      setAnalytics(EMPTY_ANALYTICS);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void PortfolioAnalyticsRepository.getInstance()
      .fetchAnalytics(playerId)
      .then((result) => {
        if (!cancelled) {
          setAnalytics(result);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [playerId]);

  return { analytics, isLoading };
}
