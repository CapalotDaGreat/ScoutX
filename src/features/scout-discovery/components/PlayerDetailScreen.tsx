import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { RevealSection } from '@/components/layout/RevealSection';
import { Section } from '@/components/layout/Section';
import { DiscoveryListSkeleton } from '@/features/scout-discovery/components/DiscoveryCardSkeleton';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { StatCard } from '@/components/primitives/StatCard';
import { Text } from '@/components/primitives/Text';
import { GpsHeatmap } from '@/features/gps/components/GpsHeatmap';
import { generateHeatmapGrid } from '@/features/gps/services/gpsSessionCalculator';
import { type GpsPoint } from '@/features/gps/types';
import { RadarChart } from '@/features/player-statistics/components/RadarChart';
import { type RadarChartPoint, type StatisticMetricKey } from '@/features/player-statistics/types';
import { TrustProfileSection } from '@/features/trust-system';
import { ScoutingReportsSection } from '@/features/scouting-reports';
import { ScoutTrialInvitationsSection } from '@/features/trial-invitations';
import { RecruitmentPlayerSection } from '@/features/scout-recruitment/components/RecruitmentPlayerSection';
import { ScoutReportHero } from '@/features/scout-discovery/components/ScoutReportHero';
import { usePlayerDetail } from '@/features/scout-discovery/hooks/usePlayerDetail';
import { useScoutWorkspace } from '@/features/scout-discovery/hooks/useScoutWorkspace';
import { useScoutPlayerSave } from '@/features/scout-recruitment/hooks/useScoutPlayerSave';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';
import { ArrowLeft, Bookmark, GitCompare, Mail, Video } from 'lucide-react-native';
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
  guestMode?: boolean;
};

export function PlayerDetailScreen({ playerId, onBack, guestMode = false }: PlayerDetailScreenProps) {
  const { colors } = useTheme();
  const { player, isLoading, error, reload } = usePlayerDetail(playerId);
  const workspace = useScoutWorkspace();
  const playerSave = useScoutPlayerSave();
  const { recordPlayerView, isInComparison, canAddToComparison, addToComparison, removeFromComparison } = workspace;
  const [inviteSignal, setInviteSignal] = useState(0);

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
  const saved = playerSave.isSaved(playerId);
  const inComparison = isInComparison(playerId);

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
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<ArrowLeft size={18} color={colors.textPrimary} />}
              onPress={onBack}
            >
              Back
            </Button>
            <View className="flex-row gap-2">
            {!guestMode ? (
              <>
            <Button
              variant={inComparison ? 'accent' : 'secondary'}
              size="sm"
              leftIcon={
                <GitCompare
                  size={16}
                  color={inComparison ? colors.accentForeground : colors.textPrimary}
                />
              }
              disabled={!inComparison && !canAddToComparison}
              onPress={() => {
                if (inComparison) {
                  removeFromComparison(player.id);
                } else {
                  addToComparison(player.id);
                }
              }}
            >
              {inComparison ? 'Comparing' : 'Compare'}
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
              onPress={() => {
                if (player) {
                  void playerSave.toggleSave(player);
                }
              }}
            >
              {saved ? 'Saved' : 'Save'}
            </Button>
              </>
            ) : null}
            </View>
          </View>
        }
      >
        <View className="px-4">
          <ScoutReportHero player={player} />
        </View>

        {!guestMode ? (
          <RevealSection step={0} className="px-4">
            <RecruitmentPlayerSection player={player} />
          </RevealSection>
        ) : null}

        {!guestMode ? (
          <RevealSection step={1} className="px-4">
            <ScoutTrialInvitationsSection
              playerId={player.id}
              playerName={player.fullName}
              inviteSignal={inviteSignal}
            />
          </RevealSection>
        ) : null}

        <RevealSection step={2} className="px-4">
          <TrustProfileSection
            playerId={player.id}
            playerName={player.fullName}
            currentClub={player.club}
            clubHistory={player.clubHistory ?? []}
            allowScoutEndorsement={!guestMode}
          />
        </RevealSection>

        {!guestMode ? (
          <RevealSection step={3} className="px-4">
            <ScoutingReportsSection playerId={player.id} playerName={player.fullName} />
          </RevealSection>
        ) : null}

        <RevealSection step={4} className="px-4">
          <Card variant="outlined" padding="md" className="gap-2">
            <Text variant="overline" color="secondary">
              Player Overview
            </Text>
            <Text variant="body">{player.biography}</Text>
            <Text variant="caption" color="secondary">
              Ref · {player.id.toUpperCase()} · Updated{' '}
              {new Date(player.updatedAt).toLocaleDateString()}
            </Text>
          </Card>
        </RevealSection>

        <RevealSection step={5} className="px-4">
          <Section title="Attribute Profile">
            <RadarChart points={radarPoints} />
          </Section>
        </RevealSection>

        <RevealSection step={6} className="px-4">
          <Section title="Season Output">
            <View className="flex-row flex-wrap gap-3">
              <StatCard label="Goals" value={player.goals} className="min-w-[45%] flex-1" />
              <StatCard label="Assists" value={player.assists} className="min-w-[45%] flex-1" />
              <StatCard label="Matches" value={player.matchCount} className="min-w-[45%] flex-1" />
              <StatCard label="Profile Views" value={player.viewCount} className="min-w-[45%] flex-1" />
            </View>
          </Section>
        </RevealSection>

        <RevealSection step={7} className="px-4">
          <Section title="Technical Ratings">
            <View className="flex-row flex-wrap gap-3">
              <StatCard label="Passing" value={player.ratings.passing} className="min-w-[45%] flex-1" />
              <StatCard label="Shooting" value={player.ratings.shooting} className="min-w-[45%] flex-1" />
              <StatCard label="Defending" value={player.ratings.defending} className="min-w-[45%] flex-1" />
              <StatCard label="Physical" value={player.ratings.physical} className="min-w-[45%] flex-1" />
            </View>
          </Section>
        </RevealSection>

        <RevealSection step={8} className="px-4">
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
        </RevealSection>

        {heatmap ? (
          <RevealSection step={9} className="px-4">
            <GpsHeatmap heatmap={heatmap} title="Movement Intelligence" />
          </RevealSection>
        ) : null}

        {player.hasHighlightVideos ? (
          <RevealSection step={10} className="px-4">
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
          </RevealSection>
        ) : null}

        <RevealSection step={11} className="px-4">
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
        </RevealSection>
      </Screen>

      {!guestMode ? (
      <View className="absolute bottom-0 left-0 right-0 border-t border-divider bg-surface px-4 pb-6 pt-3 dark:border-neutral-800 dark:bg-neutral-950">
        <View className="flex-row gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            leftIcon={<Mail size={18} color={colors.textPrimary} />}
          >
            Contact
          </Button>
          <Button
            variant="accent"
            className="flex-1"
            onPress={() => setInviteSignal((current) => current + 1)}
          >
            Invite to Trial
          </Button>
        </View>
      </View>
      ) : null}
    </View>
  );
}
