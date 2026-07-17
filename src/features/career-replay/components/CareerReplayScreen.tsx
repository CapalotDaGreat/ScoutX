import { useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Screen } from '@/components/layout/Screen';
import { CollapsibleSection } from '@/components/layout/CollapsibleSection';
import { AmbientBackdrop } from '@/components/layout/AmbientBackdrop';
import { Button } from '@/components/primitives/Button';
import { StatCard } from '@/components/primitives/StatCard';
import { Text } from '@/components/primitives/Text';
import { EMPTY_CAREER_REPLAY } from '@/features/career-replay/constants';
import { useCareerReplayShare } from '@/features/career-replay/hooks/useCareerReplayShare';
import { buildCareerReplayData } from '@/features/career-replay/services/careerReplayService';
import { shareCareerReplayPdf } from '@/features/career-replay/services/careerReplayShareService';
import { usePortfolioAnalytics } from '@/features/portfolio-analytics/hooks/usePortfolioAnalytics';
import { usePlayerWorkspace } from '@/features/player-profile/context/PlayerWorkspaceProvider';
import { useTheme } from '@/theme';

export type CareerReplayScreenProps = {
  onBack: () => void;
};

function CareerReplayHero({
  seasonLabel,
  playerName,
  position,
  club,
  narrative,
  bestRating,
  bestRatingOpponent,
}: {
  seasonLabel: string;
  playerName: string;
  position: string;
  club: string;
  narrative: string;
  bestRating: number | null;
  bestRatingOpponent: string | null;
}) {
  const { colors } = useTheme();
  const [size, setSize] = useState({ width: 360, height: 220 });

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setSize({ width, height });
    }
  };

  return (
    <View
      onLayout={onLayout}
      className="overflow-hidden rounded-2xl border border-border"
    >
      <View className="absolute inset-0" pointerEvents="none">
        <Svg width={size.width} height={size.height}>
          <Defs>
            <LinearGradient id="careerReplayWash" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#1B1D22" stopOpacity="1" />
              <Stop offset="0.55" stopColor="#1A2A22" stopOpacity="1" />
              <Stop offset="1" stopColor={colors.accent} stopOpacity="0.4" />
            </LinearGradient>
            <LinearGradient id="careerReplayGold" x1="0" y1="1" x2="1" y2="0">
              <Stop offset="0" stopColor={colors.gold} stopOpacity="0" />
              <Stop offset="1" stopColor={colors.gold} stopOpacity="0.3" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={size.width} height={size.height} fill="url(#careerReplayWash)" />
          <Rect x="0" y="0" width={size.width} height={size.height} fill="url(#careerReplayGold)" />
        </Svg>
      </View>

      <View className="gap-2 p-4">
        <Text variant="overline" className="text-gold">
          {seasonLabel}
        </Text>
        <Text weight="semibold" className="text-2xl text-[#F7F6F3]">
          {playerName}
        </Text>
        <Text variant="body-sm" className="text-[#B7BDC8]">
          {position} · {club}
        </Text>
        <Text className="mt-2 text-[#F7F6F3]">{narrative}</Text>
        {bestRating !== null && bestRatingOpponent ? (
          <Text variant="body-sm" className="mt-2 text-gold">
            Best match rating {bestRating.toFixed(1)} vs {bestRatingOpponent}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

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
      <View className="absolute inset-0" pointerEvents="none">
        <AmbientBackdrop mood="celebration" />
      </View>
      <Screen
        title="Career Replay"
        subtitle={replay.seasonLabel}
        safeArea
        className="bg-transparent"
        footer={
          <Button variant="secondary" onPress={onBack} fullWidth>
            Back
          </Button>
        }
      >
        <View className="gap-4">
          <CareerReplayHero
            seasonLabel={replay.seasonLabel}
            playerName={replay.playerName}
            position={replay.position}
            club={replay.club}
            narrative={replay.narrative}
            bestRating={replay.bestRating}
            bestRatingOpponent={replay.bestRatingOpponent}
          />

          <View className="flex-row flex-wrap gap-3">
            {replay.highlights.slice(0, 3).map((item) => (
              <StatCard
                key={item.label}
                label={item.label}
                value={item.value}
                className="min-w-[45%] flex-1"
              />
            ))}
          </View>

          {replay.highlights.length > 3 ? (
            <CollapsibleSection
              title="Season metrics"
              subtitle={`${replay.highlights.length - 3} more highlights`}
              persistKey="career-replay-metrics"
            >
              <View className="flex-row flex-wrap gap-3">
                {replay.highlights.slice(3).map((item) => (
                  <StatCard
                    key={item.label}
                    label={item.label}
                    value={item.value}
                    className="min-w-[45%] flex-1"
                  />
                ))}
              </View>
            </CollapsibleSection>
          ) : null}

          {shareError ? (
            <Text variant="body-sm" color="error">
              {shareError}
            </Text>
          ) : null}

          <View className="gap-2">
            <Button variant="accent" loading={isSharing} onPress={() => void shareAsImage()} fullWidth>
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
