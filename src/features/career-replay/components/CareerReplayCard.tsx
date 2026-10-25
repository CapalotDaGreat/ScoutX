import { useMemo } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { useCareerReplayShare } from '@/features/career-replay/hooks/useCareerReplayShare';
import { buildCareerReplayData } from '@/features/career-replay/services/careerReplayService';
import { shareCareerReplayPdf } from '@/features/career-replay/services/careerReplayShareService';
import { usePortfolioAnalytics } from '@/features/portfolio-analytics/hooks/usePortfolioAnalytics';
import { type PlayerProfile } from '@/features/player-profile/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type CareerReplayCardProps = {
  profile: PlayerProfile;
  onOpenPress?: () => void;
};

export function CareerReplayCard({ profile, onOpenPress }: CareerReplayCardProps) {
  const { t } = useAppTranslation(['career', 'statistics', 'common']);
  const { analytics } = usePortfolioAnalytics(profile.id);
  const replay = useMemo(
    () => buildCareerReplayData(profile, analytics),
    [analytics, profile],
  );
  const { shareAsImage, isSharing, shareError, ShareCaptureLayer } = useCareerReplayShare(
    replay,
    profile.id,
  );

  const hasSeasonActivity =
    replay.matchCount > 0 || replay.portfolioViews > 0 || replay.milestonesEarned > 0;

  return (
    <>
      <ShareCaptureLayer />
      <Card variant="outlined" padding="sm" className="gap-3 rounded-lg">
        <View className="gap-1">
          <Text variant="overline" color="secondary">
            {t('career:replayCard.overline')}
          </Text>
          <Text weight="semibold">{t('career:replayCard.title', { season: replay.seasonLabel })}</Text>
          <Text variant="body-sm" color="secondary" numberOfLines={3}>
            {hasSeasonActivity
              ? [
                  replay.matchCount > 0
                    ? t('career:replayCard.matches', { count: replay.matchCount })
                    : null,
                  replay.matchCount > 0
                    ? t('career:replayCard.contributions', { goals: replay.totalGoals, assists: replay.totalAssists })
                    : null,
                  replay.portfolioViews > 0
                    ? t('career:replayCard.views', { count: replay.portfolioViews })
                    : null,
                  replay.milestonesEarned > 0
                    ? t('career:replayCard.milestones', { count: replay.milestonesEarned })
                    : null,
                ]
                  .filter((part): part is string => part !== null)
                  .join(' ')
              : t('career:replayCard.empty')}
          </Text>
        </View>

        {hasSeasonActivity ? (
          <View className="flex-row border-y border-border py-3">
            <View className="min-w-0 flex-1 gap-1 pr-3">
              <Text variant="caption" color="secondary">{t('statistics:metrics.matches')}</Text>
              <Text weight="semibold" className="text-xl">{replay.matchCount}</Text>
            </View>
            <View className="min-w-0 flex-1 gap-1 border-l border-border pl-3">
              <Text variant="caption" color="secondary">{t('statistics:metrics.goals')}</Text>
              <Text weight="semibold" className="text-xl">{replay.totalGoals}</Text>
            </View>
          </View>
        ) : null}

        {shareError ? (
          <Text variant="body-sm" color="error">
            {shareError}
          </Text>
        ) : null}

        <View className="flex-row flex-wrap gap-2">
          {onOpenPress ? (
            <Button variant="accent" onPress={onOpenPress} className="flex-1">
              {t('career:replayCard.open')}
            </Button>
          ) : null}
          <Button
            variant="secondary"
            loading={isSharing}
            onPress={() => void shareAsImage()}
            className="flex-1"
            disabled={!hasSeasonActivity}
          >
            {t('common:share')}
          </Button>
          <Button
            variant="ghost"
            onPress={() => void shareCareerReplayPdf(replay, profile.id)}
            className="flex-1"
            disabled={!hasSeasonActivity}
          >
            PDF
          </Button>
        </View>
      </Card>
    </>
  );
}
