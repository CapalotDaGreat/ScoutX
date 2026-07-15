import { useMemo } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/primitives/Button';
import { StatCard } from '@/components/primitives/StatCard';
import { Text } from '@/components/primitives/Text';
import { EMPTY_CAREER_REPLAY } from '@/features/career-replay/constants';
import { useCareerReplayShare } from '@/features/career-replay/hooks/useCareerReplayShare';
import { buildCareerReplayData } from '@/features/career-replay/services/careerReplayService';
import { shareCareerReplayPdf } from '@/features/career-replay/services/careerReplayShareService';
import { usePortfolioAnalytics } from '@/features/portfolio-analytics/hooks/usePortfolioAnalytics';
import { usePlayerWorkspace } from '@/features/player-profile/context/PlayerWorkspaceProvider';

export type CareerReplayScreenProps = {
  onBack: () => void;
};

export function CareerReplayScreen({ onBack }: CareerReplayScreenProps) {
  const { profile } = usePlayerWorkspace();
  const { analytics } = usePortfolioAnalytics(profile?.id);

  const replay = useMemo(() => {
    if (!profile) {
      return null;
    }
    return buildCareerReplayData(profile, analytics);
  }, [analytics, profile]);

  const {
    shareAsImage,
    isSharing,
    shareError,
    ShareCaptureLayer,
  } = useCareerReplayShare(replay ?? EMPTY_CAREER_REPLAY, profile?.id);

  if (!profile || !replay) {
    return (
      <Screen title="Career Replay" subtitle="Season recap" safeArea>
        <Text color="secondary">Complete your profile to generate a season replay.</Text>
        <Button variant="secondary" onPress={onBack} className="mt-4">
          Back
        </Button>
      </Screen>
    );
  }

  return (
    <>
      <ShareCaptureLayer />
      <Screen
        title="Career Replay"
        subtitle={replay.seasonLabel}
        safeArea
        footer={
          <Button variant="secondary" onPress={onBack} fullWidth>
            Back
          </Button>
        }
      >
        <View className="gap-4">
          <View className="rounded-2xl border border-border bg-surface p-4">
            <Text variant="overline" color="secondary">
              {replay.seasonLabel}
            </Text>
            <Text weight="semibold" className="text-2xl">
              {replay.playerName}
            </Text>
            <Text variant="body-sm" color="secondary">
              {replay.position} · {replay.club}
            </Text>
            <Text className="mt-3">{replay.narrative}</Text>
            {replay.bestRating !== null && replay.bestRatingOpponent ? (
              <Text variant="body-sm" className="mt-2 text-green-700">
                Best match rating {replay.bestRating.toFixed(1)} vs {replay.bestRatingOpponent}
              </Text>
            ) : null}
          </View>

          <View className="flex-row flex-wrap gap-3">
            {replay.highlights.map((item) => (
              <StatCard
                key={item.label}
                label={item.label}
                value={item.value}
                className="min-w-[45%] flex-1"
              />
            ))}
          </View>

          {shareError ? (
            <Text variant="body-sm" color="error">
              {shareError}
            </Text>
          ) : null}

          <View className="gap-2">
            <Button loading={isSharing} onPress={() => void shareAsImage()} fullWidth>
              Share season card
            </Button>
            <Button
              variant="secondary"
              onPress={() => void shareCareerReplayPdf(replay, profile.id)}
              fullWidth
            >
              Share PDF recap
            </Button>
          </View>
        </View>
      </Screen>
    </>
  );
}
