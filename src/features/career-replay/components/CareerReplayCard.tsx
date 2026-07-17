import { useMemo } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { StatCard } from '@/components/primitives/StatCard';
import { Text } from '@/components/primitives/Text';
import { useCareerReplayShare } from '@/features/career-replay/hooks/useCareerReplayShare';
import { buildCareerReplayData } from '@/features/career-replay/services/careerReplayService';
import { shareCareerReplayPdf } from '@/features/career-replay/services/careerReplayShareService';
import { usePortfolioAnalytics } from '@/features/portfolio-analytics/hooks/usePortfolioAnalytics';
import { type PlayerProfile } from '@/features/player-profile/types';

export type CareerReplayCardProps = {
  profile: PlayerProfile;
  onOpenPress?: () => void;
};

export function CareerReplayCard({ profile, onOpenPress }: CareerReplayCardProps) {
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
      <Card variant="outlined" padding="md" className="gap-4">
        <View className="gap-1">
          <Text variant="overline" color="secondary">
            Career Replay
          </Text>
          <Text weight="semibold">{replay.seasonLabel} recap</Text>
          <Text variant="body-sm" color="secondary" numberOfLines={3}>
            {replay.narrative}
          </Text>
        </View>

        {hasSeasonActivity ? (
          <View className="flex-row gap-3">
            <StatCard label="Matches" value={replay.matchCount} className="flex-1" />
            <StatCard label="Goals" value={replay.totalGoals} className="flex-1" />
          </View>
        ) : null}

        {shareError ? (
          <Text variant="body-sm" color="error">
            {shareError}
          </Text>
        ) : null}

        <View className="flex-row gap-2">
          {onOpenPress ? (
            <Button variant="accent" onPress={onOpenPress} className="flex-1">
              Open replay
            </Button>
          ) : null}
          <Button
            variant="secondary"
            loading={isSharing}
            onPress={() => void shareAsImage()}
            className="flex-1"
            disabled={!hasSeasonActivity}
          >
            Share
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
