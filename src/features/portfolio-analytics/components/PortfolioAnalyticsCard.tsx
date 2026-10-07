import { useEffect, useState } from 'react';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import {
  PortfolioAnalyticsRepository,
  type PortfolioAnalytics,
} from '@/features/portfolio-analytics/repositories/PortfolioAnalyticsRepository';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type PortfolioAnalyticsCardProps = {
  playerId: string;
};

/** Reach metrics only — passport score lives on FootballPassportScoreCard. */
export function PortfolioAnalyticsCard({ playerId }: PortfolioAnalyticsCardProps) {
  const { t, i18n } = useAppTranslation('portfolio');
  const [stats, setStats] = useState<PortfolioAnalytics | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    void PortfolioAnalyticsRepository.getInstance()
      .fetchAnalytics(playerId)
      .then((next) => {
        if (active) setStats(next);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [playerId]);

  const lastViewedLabel = stats?.lastViewedAt
    ? t('reach.lastViewed', {
        date: new Date(stats.lastViewedAt).toLocaleDateString(i18n.language, {
          month: 'short',
          day: 'numeric',
        }),
      })
    : t('reach.noViews');

  return (
    <Card variant="default" padding="md" className="gap-2">
      <Text variant="overline" color="secondary">
        {t('reach.overline')}
      </Text>
      <Text weight="semibold">{t('reach.title')}</Text>
      <Text variant="body-sm" color="secondary">
        {stats
          ? t('reach.views', { total: stats.totalViews, week: stats.viewsThisWeek })
          : failed
            ? t('reach.unavailable')
            : t('reach.loading')}
      </Text>
      {stats ? (
        <>
          <Text variant="body-sm" color="secondary">
            {t('reach.scoutViews', { total: stats.scoutViews, week: stats.scoutViewsThisWeek })}
          </Text>
          <Text variant="caption" color="secondary">
            {lastViewedLabel}
          </Text>
        </>
      ) : null}
    </Card>
  );
}
