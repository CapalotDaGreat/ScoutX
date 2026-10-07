import { useMemo } from 'react';
import { type PlayerProfileStat, type PlayerProfileStatMetric } from '@/features/player-profile/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

type TrendChange = { baseline: boolean; delta: number; formattedDelta: string };

/** Presentation labels for statistic keys; services keep returning keys and raw numbers. */
export function useStatisticLabels() {
  const { t } = useAppTranslation('statistics');

  return useMemo(() => {
    const trend = (change: TrendChange) => {
      if (change.baseline) return t('summary.trend.baseline');
      if (change.delta === 0) return t('summary.trend.noChange');
      return t('summary.trend.recent', {
        value: `${change.delta > 0 ? '+' : '-'}${change.formattedDelta}`,
      });
    };

    return {
      metric: (key: PlayerProfileStatMetric) => t(`metrics.${key}`),
      average: (key: PlayerProfileStatMetric, formattedAverage: string) => {
        if (key === 'passAccuracy') return t('summary.average.season', { value: formattedAverage });
        if (key === 'matches') return t('summary.average.played', { value: formattedAverage });
        return t('summary.average.perMatch', { value: formattedAverage });
      },
      trend,
      profileStat: (stat: PlayerProfileStat) => ({
        label: stat.metric ? t(`metrics.${stat.metric}`) : stat.label,
        trend: {
          direction: stat.trend.direction,
          value: stat.trend.change ? trend(stat.trend.change) : stat.trend.value,
        },
      }),
    };
  }, [t]);
}
