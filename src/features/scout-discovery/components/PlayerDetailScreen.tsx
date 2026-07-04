import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen } from '@/components/layout/Screen';
import { Section } from '@/components/layout/Section';
import { DiscoveryListSkeleton } from '@/features/scout-discovery/components/DiscoveryCardSkeleton';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Input } from '@/components/primitives/Input';
import { StatCard } from '@/components/primitives/StatCard';
import { Text } from '@/components/primitives/Text';
import { GpsHeatmap } from '@/features/gps/components/GpsHeatmap';
import { generateHeatmapGrid } from '@/features/gps/services/gpsSessionCalculator';
import { type GpsPoint } from '@/features/gps/types';
import { RadarChart } from '@/features/player-statistics/components/RadarChart';
import { type RadarChartPoint, type StatisticMetricKey } from '@/features/player-statistics/types';
import { ScoutReportHero } from '@/features/scout-discovery/components/ScoutReportHero';
import { usePlayerDetail } from '@/features/scout-discovery/hooks/usePlayerDetail';
import { useScoutWorkspace } from '@/features/scout-discovery/hooks/useScoutWorkspace';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';
import { ArrowLeft, Bookmark, Mail, Video } from 'lucide-react-native';
import { useTheme } from '@/theme';

const RADAR_KEYS: StatisticMetricKey[] = [
  'goals',
  'assists',
  'passAccuracy',
  'shots',
  'tackles',
  'minutes',
];

function buildMockGpsPoints(playerId: string): GpsPoint[] {
  const seed = playerId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const baseLat = 52.37 + (seed % 10) * 0.002;
  const baseLng = 4.9 + (seed % 7) * 0.002;
  const now = Date.now();

  return Array.from({ length: 48 }, (_, index) => ({
    latitude: baseLat + Math.sin(index / 6) * 0.0008,
    longitude: baseLng + Math.cos(index / 5) * 0.0012,
    timestamp: now - index * 5000,
    speed: 2 + (index % 5),
    accuracy: 8,
  }));
}

function toRadarPoints(player: DiscoverablePlayer): RadarChartPoint[] {
  return player.radarStats.map((stat, index) => ({
    key: RADAR_KEYS[index % RADAR_KEYS.length],
    label: stat.label,
    value: Math.round(stat.value * 100),
    normalizedValue: stat.value,
  }));
}

export type PlayerDetailScreenProps = {
  playerId: string;
  onBack: () => void;
};

export function PlayerDetailScreen({ playerId, onBack }: PlayerDetailScreenProps) {
  const { colors } = useTheme();
  const { player, isLoading, error, reload } = usePlayerDetail(playerId);
  const workspace = useScoutWorkspace();
  const { recordPlayerView, isFavourite, toggleFavourite } = workspace;
  const [scoutNote, setScoutNote] = useState('');

  useEffect(() => {
    if (playerId) {
      recordPlayerView(playerId);
    }
  }, [playerId, recordPlayerView]);

  const heatmap = useMemo(
    () => (player ? generateHeatmapGrid(buildMockGpsPoints(player.id)) : null),
    [player],
  );

  const radarPoints = useMemo(() => (player ? toRadarPoints(player) : []), [player]);
  const saved = isFavourite(playerId);

  if (isLoading) {
    return (
      <Screen
        safeArea
        header={
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            leftIcon={<ArrowLeft size={18} color={colors.textPrimary} />}
            onPress={onBack}
          >
            Back
          </Button>
        }
      >
        <DiscoveryListSkeleton count={3} />
      </Screen>
    );
  }

  if (error || !player) {
    return (
      <Screen title="Scouting Report" error={error ?? 'Player not found'} onRetry={reload} safeArea>
        <Button
          variant="secondary"
          leftIcon={<ArrowLeft size={18} color={colors.textPrimary} />}
          onPress={onBack}
        >
          Go Back
        </Button>
      </Screen>
    );
  }

  return (
    <View className="flex-1">
      <Screen
        scrollable
        safeArea
        onRefresh={reload}
        contentClassName="gap-6 pb-28"
        header={
          <View className="flex-row items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<ArrowLeft size={18} color={colors.textPrimary} />}
              onPress={onBack}
            >
              Back to list
            </Button>
            <Button
              variant={saved ? 'accent' : 'secondary'}
              size="sm"
              leftIcon={
                <Bookmark
                  size={16}
                  color={saved ? colors.accentForeground : colors.textPrimary}
                  fill={saved ? colors.accentForeground : 'transparent'}
                />
              }
              onPress={() => toggleFavourite(player.id)}
            >
              {saved ? 'Saved' : 'Save'}
            </Button>
          </View>
        }
      >
        <View className="px-4">
          <ScoutReportHero player={player} />
        </View>

        <Animated.View entering={FadeInDown.delay(80).duration(350)} className="px-4">
          <Card variant="outlined" padding="md" className="gap-2">
            <Text variant="overline" color="secondary">
              Evaluation Summary
            </Text>
            <Text variant="body">{player.biography}</Text>
            <Text variant="caption" color="secondary">
              Report ref · {player.id.toUpperCase()} · Updated{' '}
              {new Date(player.updatedAt).toLocaleDateString()}
            </Text>
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(350)} className="px-4">
          <Section title="Attribute Profile">
            <RadarChart points={radarPoints} />
          </Section>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(160).duration(350)} className="px-4">
          <Section title="Season Output">
            <View className="flex-row flex-wrap gap-3">
              <StatCard label="Goals" value={player.goals} className="min-w-[45%] flex-1" />
              <StatCard label="Assists" value={player.assists} className="min-w-[45%] flex-1" />
              <StatCard label="Matches" value={player.matchCount} className="min-w-[45%] flex-1" />
              <StatCard label="Profile Views" value={player.viewCount} className="min-w-[45%] flex-1" />
            </View>
          </Section>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).duration(350)} className="px-4">
          <Section title="Technical Ratings">
            <View className="flex-row flex-wrap gap-3">
              <StatCard label="Passing" value={player.ratings.passing} className="min-w-[45%] flex-1" />
              <StatCard label="Shooting" value={player.ratings.shooting} className="min-w-[45%] flex-1" />
              <StatCard label="Defending" value={player.ratings.defending} className="min-w-[45%] flex-1" />
              <StatCard label="Physical" value={player.ratings.physical} className="min-w-[45%] flex-1" />
            </View>
          </Section>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(240).duration(350)} className="px-4">
          <Section title="Club History">
            {player.clubHistory.map((entry) => (
              <Card key={`${entry.club}-${entry.period}`} variant="default" padding="md" className="mb-2">
                <Text weight="semibold">{entry.club}</Text>
                <Text variant="body-sm" color="secondary">
                  {entry.period}
                </Text>
              </Card>
            ))}
          </Section>
        </Animated.View>

        {heatmap ? (
          <Animated.View entering={FadeInDown.delay(280).duration(350)} className="px-4">
            <GpsHeatmap heatmap={heatmap} title="Movement Intelligence" />
          </Animated.View>
        ) : null}

        {player.hasHighlightVideos ? (
          <Animated.View entering={FadeInDown.delay(320).duration(350)} className="px-4">
            <Section title="Match Footage">
              <Card variant="default" padding="lg" className="flex-row items-center gap-3">
                <Video size={24} color={colors.accent} />
                <View className="flex-1">
                  <Text weight="semibold">Highlights on file</Text>
                  <Text variant="body-sm" color="secondary">
                    Video playback will connect to Firebase Storage in the next release.
                  </Text>
                </View>
              </Card>
            </Section>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInDown.delay(360).duration(350)} className="px-4">
          <Section title="Honours">
            {player.achievements.length > 0 ? (
              player.achievements.map((achievement) => (
                <Text key={achievement} variant="body-sm" className="mb-1">
                  • {achievement}
                </Text>
              ))
            ) : (
              <Text variant="body-sm" color="secondary">
                No honours recorded yet.
              </Text>
            )}
          </Section>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(400).duration(350)} className="px-4">
          <Section title="Scout Notes" subtitle="Private — visible only to your account">
            <Input
              label="Observations"
              value={scoutNote}
              onChangeText={setScoutNote}
              placeholder="Strengths, concerns, fit for your club..."
              multiline
              numberOfLines={4}
            />
          </Section>
        </Animated.View>
      </Screen>

      <View className="absolute bottom-0 left-0 right-0 border-t border-divider bg-surface px-4 pb-6 pt-3 dark:border-neutral-800 dark:bg-neutral-950">
        <View className="flex-row gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            leftIcon={<Mail size={18} color={colors.textPrimary} />}
          >
            Contact
          </Button>
          <Button variant="accent" className="flex-1">
            Invite to Trial
          </Button>
        </View>
      </View>
    </View>
  );
}
