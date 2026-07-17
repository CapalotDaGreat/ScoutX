import { useEffect, useState } from 'react';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { PortfolioAnalyticsRepository } from '@/features/portfolio-analytics/repositories/PortfolioAnalyticsRepository';

export type PortfolioAnalyticsCardProps = {
  playerId: string;
};

/** Reach metrics only — passport score lives on FootballPassportScoreCard. */
export function PortfolioAnalyticsCard({ playerId }: PortfolioAnalyticsCardProps) {
  const [stats, setStats] = useState({
    totalViews: 0,
    viewsThisWeek: 0,
    scoutViews: 0,
    scoutViewsThisWeek: 0,
    lastViewedAt: null as string | null,
  });

  useEffect(() => {
    void PortfolioAnalyticsRepository.getInstance()
      .fetchAnalytics(playerId)
      .then(setStats)
      .catch(() => undefined);
  }, [playerId]);

  const lastViewedLabel = stats.lastViewedAt
    ? new Date(stats.lastViewedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : 'No views yet';

  return (
    <Card variant="default" padding="md" className="gap-2">
      <Text variant="overline" color="secondary">
        Portfolio reach
      </Text>
      <Text weight="semibold">Who is viewing your Football Passport</Text>
      <Text variant="body-sm" color="secondary">
        {stats.totalViews} total views · {stats.viewsThisWeek} this week
      </Text>
      <Text variant="body-sm" color="secondary">
        {stats.scoutViews} scout views · {stats.scoutViewsThisWeek} scout views this week
      </Text>
      <Text variant="caption" color="secondary">
        Last viewed {lastViewedLabel}
      </Text>
    </Card>
  );
}
