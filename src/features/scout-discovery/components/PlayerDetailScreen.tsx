import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { CollapsibleSection } from '@/components/layout/CollapsibleSection';
import { RevealSection } from '@/components/layout/RevealSection';
import { PreviewList } from '@/components/layout/PreviewList';
import { Section } from '@/components/layout/Section';
import { DiscoveryListSkeleton } from '@/features/scout-discovery/components/DiscoveryCardSkeleton';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { StatCard } from '@/components/primitives/StatCard';
import { Text } from '@/components/primitives/Text';
import { ProvenanceBadge } from '@/components/evidence/ProvenanceBadge';
import { RadarChart } from '@/features/player-statistics/components/RadarChart';
import { type RadarChartPoint, type StatisticMetricKey } from '@/features/player-statistics/types';
import { TrustProfileSection } from '@/features/trust-system';
import { ScoutingReportsSection } from '@/features/scouting-reports';
import { ScoutTrialInvitationsSection } from '@/features/trial-invitations';
import { RecruitmentPlayerSection } from '@/features/scout-recruitment/components/RecruitmentPlayerSection';
import { ClubProfileChip, ClubProfileRepository } from '@/features/club-profiles';
import { VerificationBadge } from '@/features/verification-system';
import { type ClubProfile } from '@/features/club-profiles/types';
import { ScoutReportHero } from '@/features/scout-discovery/components/ScoutReportHero';
import { FreshnessLabel } from '@/components/evidence/FreshnessLabel';
import { usePlayerDetail } from '@/features/scout-discovery/hooks/usePlayerDetail';
import { useScoutWorkspace } from '@/features/scout-discovery/hooks/useScoutWorkspace';
import { useScoutPlayerSave } from '@/features/scout-recruitment/hooks/useScoutPlayerSave';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';
import { formatRating } from '@/features/scout-discovery/models/DiscoverablePlayerModel';
import { ScoutBriefCard } from '@/features/scout-intelligence/components/ScoutBriefCard';
import { WhyThisPlayerCard } from '@/features/scout-intelligence/components/WhyThisPlayerCard';
import { BriefMatchCard } from '@/features/scout-intelligence/components/BriefMatchCard';
import { ShortlistIntelligenceCard, WhyNotCard } from '@/features/scout-intelligence/components/ScoutDecisionCards';
import { useWatchlistEvents } from '@/features/scout-intelligence/hooks/useWatchlistEvents';
import {
  buildShortlistIntelligence,
  explainWhyNotThisPlayer,
} from '@/features/scout-intelligence/services/scoutDecisionSupport';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { bestBriefMatch } from '@/features/scout-intelligence/services/briefMatch';
import { SimilarPlayersCard } from '@/features/scout-intelligence/components/SimilarPlayersCard';
import { EvidenceRequestComposer } from '@/features/scout-intelligence/components/EvidenceRequestComposer';
import { buildScoutBrief } from '@/features/scout-intelligence/services/scoutBrief';
import { explainWhyThisPlayer } from '@/features/scout-intelligence/services/whyThisPlayer';
import { rankSimilarPlayers } from '@/features/scout-intelligence/services/similarPlayers';
import { useDiscoverablePlayerPool } from '@/features/scout-discovery/hooks/useDiscoverablePlayerPool';
import { TrustSafetyActions } from '@/features/trust-safety/components/TrustSafetyActions';
import { ScoutFootballSourcesSection } from '@/features/football-sources';
import { ArrowLeft, Bookmark, ExternalLink, GitCompare, Video } from 'lucide-react-native';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';

const RADAR_KEYS: StatisticMetricKey[] = [
  'goals',
  'assists',
  'passAccuracy',
  'shots',
  'tackles',
  'minutes',
];

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
  onViewPortfolio?: (playerId: string) => void;
  onOpenComparisonPress?: () => void;
  onOpenPlayer?: (playerId: string) => void;
};

export function PlayerDetailScreen({
  playerId,
  onBack,
  guestMode = false,
  onViewPortfolio,
  onOpenComparisonPress,
  onOpenPlayer,
}: PlayerDetailScreenProps) {
  const { t, i18n } = useAppTranslation(['scout', 'statistics', 'common', 'errors']);
  const { colors } = useTheme();
  const { player, isLoading, error, reload } = usePlayerDetail(playerId);
  const { players: playerPool } = useDiscoverablePlayerPool();
  const workspace = useScoutWorkspace();
  const playerSave = useScoutPlayerSave();
  const { recordPlayerView, isInComparison, canAddToComparison, addToComparison, removeFromComparison, comparisonPlayerIds } = workspace;
  const [inviteSignal, setInviteSignal] = useState(0);
  const [clubProfile, setClubProfile] = useState<ClubProfile | null>(null);

  useEffect(() => {
    if (playerId) {
      recordPlayerView(playerId);
    }
  }, [playerId, recordPlayerView]);

  useEffect(() => {
    if (!player?.club) {
      setClubProfile(null);
      return;
    }

    void ClubProfileRepository.getInstance()
      .fetchByClubName(player.club)
      .then(setClubProfile)
      .catch(() => setClubProfile(null));
  }, [player?.club]);

  const radarPoints = useMemo(() => (player ? toRadarPoints(player) : []), [player]);
  const briefMatch = useMemo(
    () => (player ? bestBriefMatch(player, workspace.filterPresets) : null),
    [player, workspace.filterPresets],
  );
  const briefPositions = useMemo(
    () => workspace.filterPresets.find((preset) => preset.id === briefMatch?.presetId)?.filters.positions,
    [briefMatch?.presetId, workspace.filterPresets],
  );
  const whyReasons = useMemo(
    () => (player ? explainWhyThisPlayer(player, { positions: briefPositions }) : []),
    [briefPositions, player],
  );
  const similar = useMemo(
    () => (player ? rankSimilarPlayers(player, playerPool) : []),
    [player, playerPool],
  );
  const similarById = useMemo(
    () => Object.fromEntries(playerPool.map((item) => [item.id, item])),
    [playerPool],
  );
  const brief = useMemo(
    () => (player ? buildScoutBrief('scout', player) : null),
    [player],
  );
  const hasAttributeRatings =
    player !== null &&
    Object.values(player.ratings).some((value) => value !== null);
  const saved = playerSave.isSaved(playerId);
  const { user } = useAuth();
  const { events: watchEvents } = useWatchlistEvents(!guestMode && saved ? user?.id ?? null : null);
  const whyNot = useMemo(() => (player ? explainWhyNotThisPlayer(player, briefMatch) : []), [briefMatch, player]);
  const entry = saved ? playerSave.getEntry(playerId) : null;
  const shortlistIntel = useMemo(
    () =>
      player && entry
        ? buildShortlistIntelligence({
            player,
            stage: entry.stage,
            lastReviewedAt: entry.updatedAt,
            brief: briefMatch,
            events: watchEvents,
          })
        : null,
    [briefMatch, entry, player, watchEvents],
  );
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
            {t('common:back')}
          </Button>
        }
      >
        <DiscoveryListSkeleton count={3} />
      </Screen>
    );
  }

  if (error || !player) {
    return (
      <Screen title={t('scout:playerDetail.report')} error={error ?? t('scout:playerDetail.playerNotFound')} onRetry={reload} safeArea>
        <Button
          variant="secondary"
          leftIcon={<ArrowLeft size={18} color={colors.textPrimary} />}
          onPress={onBack}
        >
          {t('scout:playerDetail.goBack')}
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
              {t('common:back')}
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
              {inComparison ? t('scout:playerDetail.comparing') : t('scout:playerDetail.compare')}
            </Button>
            {onOpenComparisonPress && comparisonPlayerIds.length > 0 ? (
              <Button variant="secondary" size="sm" onPress={onOpenComparisonPress}>
                {t('scout:playerDetail.queueWithCount', { count: comparisonPlayerIds.length })}
              </Button>
            ) : null}
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
              {saved ? t('scout:playerDetail.saved') : t('scout:playerDetail.save')}
            </Button>
              </>
            ) : null}
            </View>
          </View>
        }
      >
        <View className="px-4">
          <ScoutReportHero player={player} />
          <FreshnessLabel updatedAt={player.lastEvidenceAt} sampleSize={player.matchCount} />
          {!guestMode && brief ? (
            <View className="mt-3 gap-3">
              {shortlistIntel ? <ShortlistIntelligenceCard intelligence={shortlistIntel} /> : null}
              <WhyThisPlayerCard reasons={whyReasons} />
              <WhyNotCard reasons={whyNot} />
              {briefMatch ? <BriefMatchCard match={briefMatch} /> : null}
              <ScoutBriefCard brief={brief} />
              <SimilarPlayersCard
                scores={similar}
                playersById={similarById}
                onPressPlayer={(id) => onOpenPlayer?.(id)}
              />
              <EvidenceRequestComposer playerId={player.id} />
            </View>
          ) : null}
          <View className="mt-3 gap-2">
            {player.verified ? <VerificationBadge level="verified" /> : null}
            {clubProfile ? <ClubProfileChip club={clubProfile} /> : null}
          </View>
          {onViewPortfolio ? (
            <Button
              variant="secondary"
              className="mt-4"
              leftIcon={<ExternalLink size={16} color={colors.textPrimary} />}
              onPress={() => onViewPortfolio(player.id)}
            >
              {t('scout:playerDetail.viewPublicPortfolio')}
            </Button>
          ) : null}
          <View className="mt-3">
            <TrustSafetyActions targetUserId={player.id} targetUserName={player.fullName} includePassportReport />
          </View>
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
          <CollapsibleSection
            title={t('scout:playerDetail.sections.trustTitle')}
            subtitle={t('scout:playerDetail.sections.trustSubtitle')}
            persistKey={`detail-trust-${player.id}`}
          >
            <TrustProfileSection
              playerId={player.id}
              playerName={player.fullName}
              currentClub={player.club}
              clubHistory={player.clubHistory ?? []}
              allowScoutEndorsement={!guestMode}
            />
          </CollapsibleSection>
        </RevealSection>

        {!guestMode ? (
          <RevealSection step={2} className="px-4">
            <ScoutFootballSourcesSection playerId={player.id} />
          </RevealSection>
        ) : null}

        {!guestMode ? (
          <RevealSection step={3} className="px-4">
            <CollapsibleSection
              title={t('scout:playerDetail.sections.reportsTitle')}
              subtitle={t('scout:playerDetail.sections.reportsSubtitle')}
              persistKey={`detail-reports-${player.id}`}
            >
              <ScoutingReportsSection playerId={player.id} playerName={player.fullName} />
            </CollapsibleSection>
          </RevealSection>
        ) : null}

        <RevealSection step={4} className="px-4">
          <CollapsibleSection
            title={t('scout:playerDetail.playerOverview')}
            subtitle={t('scout:playerDetail.sections.bioSubtitle')}
            persistKey={`detail-bio-${player.id}`}
          >
            <Card variant="outlined" padding="md" className="gap-2">
              <Text variant="body">{player.biography}</Text>
              <Text variant="caption" color="secondary">
                {t('scout:playerDetail.refUpdated', {
                  id: player.id.toUpperCase(),
                  date: new Date(player.updatedAt).toLocaleDateString(i18n.language),
                })}
              </Text>
            </Card>
          </CollapsibleSection>
        </RevealSection>

        <RevealSection step={5} className="px-4">
          <Section title={t('scout:playerDetail.seasonOutput')}>
            <View className="flex-row flex-wrap gap-3">
              <StatCard label={t('statistics:metrics.goals')} value={player.metrics.goals.value ?? '—'} className="min-w-[45%] flex-1" />
              <StatCard label={t('statistics:metrics.assists')} value={player.metrics.assists.value ?? '—'} className="min-w-[45%] flex-1" />
              <StatCard label={t('statistics:metrics.matches')} value={player.matchCount} className="min-w-[45%] flex-1" />
              <StatCard label={t('scout:playerDetail.profileViews')} value={player.viewCount} className="min-w-[45%] flex-1" />
            </View>
          </Section>
        </RevealSection>

        <RevealSection step={6} className="px-4">
          <CollapsibleSection
            title={t('scout:playerDetail.attributeProfile')}
            subtitle={t('scout:playerDetail.sections.attributesSubtitle')}
            persistKey={`detail-attributes-${player.id}`}
          >
            <View className="gap-5">
              {radarPoints.length >= 3 ? (
                <>
                  <RadarChart points={radarPoints} />
                  <ProvenanceBadge provenance="match_derived" />
                </>
              ) : (
                <Text variant="body-sm" color="secondary">
                  {t('scout:playerDetail.noRadarData')}
                </Text>
              )}
              {hasAttributeRatings ? (
                <View className="flex-row flex-wrap gap-3">
                  <StatCard
                    label={t('scout:playerDetail.passing')}
                    value={formatRating(player.ratings.passing)}
                    className="min-w-[45%] flex-1"
                  />
                  <StatCard
                    label={t('scout:playerDetail.shooting')}
                    value={formatRating(player.ratings.shooting)}
                    className="min-w-[45%] flex-1"
                  />
                  <StatCard
                    label={t('scout:playerDetail.defending')}
                    value={formatRating(player.ratings.defending)}
                    className="min-w-[45%] flex-1"
                  />
                  <StatCard
                    label={t('scout:playerDetail.physical')}
                    value={formatRating(player.ratings.physical)}
                    className="min-w-[45%] flex-1"
                  />
                </View>
              ) : (
                <Text variant="body-sm" color="secondary">
                  {t('scout:playerDetail.noAttributeRatings')}
                </Text>
              )}
            </View>
          </CollapsibleSection>
        </RevealSection>

        <RevealSection step={7} className="px-4">
          <CollapsibleSection
            title={t('scout:playerDetail.clubHistory')}
            subtitle={t('scout:playerDetail.sections.clubCount', { count: player.clubHistory.length })}
            persistKey={`detail-clubs-${player.id}`}
          >
            <PreviewList
              items={player.clubHistory}
              previewCount={3}
              keyExtractor={(entry) => `${entry.club}-${entry.period}`}
              renderItem={(entry) => (
                <Card variant="default" padding="md">
                  <Text weight="semibold">{entry.club}</Text>
                  <Text variant="body-sm" color="secondary">
                    {entry.period}
                  </Text>
                </Card>
              )}
            />
          </CollapsibleSection>
        </RevealSection>

        <RevealSection step={8} className="px-4">
          <CollapsibleSection
            title={t('scout:playerDetail.movementIntelligence')}
            subtitle={
              player.distanceKm !== null || player.sprintSpeedKmh !== null
                ? t('scout:playerDetail.movementAvailable')
                : t('scout:playerDetail.noGpsData')
            }
            persistKey={`detail-gps-${player.id}`}
            defaultOpen={false}
          >
            {player.distanceKm !== null || player.sprintSpeedKmh !== null ? (
              <View className="flex-row flex-wrap gap-3">
                <StatCard
                  label={t('scout:playerDetail.distanceKm')}
                  value={player.distanceKm !== null ? player.distanceKm.toFixed(1) : '—'}
                  className="min-w-[45%] flex-1"
                />
                <StatCard
                  label={t('scout:playerDetail.sprintSpeed')}
                  value={player.sprintSpeedKmh !== null ? player.sprintSpeedKmh.toFixed(1) : '—'}
                  className="min-w-[45%] flex-1"
                />
                <Text variant="caption" color="secondary">
                  {t('scout:playerDetail.movementSource')}
                </Text>
              </View>
            ) : (
              <Text variant="body-sm" color="secondary">
                {t('scout:playerDetail.noGpsData')}
              </Text>
            )}
          </CollapsibleSection>
        </RevealSection>

        {player.hasHighlightVideos ? (
          <RevealSection step={9} className="px-4">
            <CollapsibleSection
              title={t('scout:playerDetail.matchFootage')}
              subtitle={t('scout:playerDetail.sections.footageSubtitle')}
              persistKey={`detail-footage-${player.id}`}
            >
              <Card variant="default" padding="lg" className="gap-3">
                <View className="flex-row items-center gap-3">
                  <Video size={24} color={colors.accent} />
                  <View className="flex-1">
                    <Text weight="semibold">{t('scout:playerDetail.highlightsOnFile')}</Text>
                    <Text variant="body-sm" color="secondary">
                      {t('scout:playerDetail.videoPlaybackNote')}
                    </Text>
                  </View>
                </View>
                {onViewPortfolio ? (
                  <Button variant="accent" size="sm" onPress={() => onViewPortfolio(player.id)}>
                    {t('scout:playerDetail.watchHighlights')}
                  </Button>
                ) : null}
              </Card>
            </CollapsibleSection>
          </RevealSection>
        ) : null}

        <RevealSection step={10} className="px-4">
          <CollapsibleSection
            title={t('scout:playerDetail.honours')}
            subtitle={t('scout:playerDetail.sections.honoursSubtitle')}
            persistKey={`detail-honours-${player.id}`}
          >
            {player.achievements.length > 0 ? (
              <PreviewList
                items={player.achievements}
                previewCount={4}
                keyExtractor={(achievement) => achievement}
                renderItem={(achievement) => (
                  <Text variant="body-sm">• {achievement}</Text>
                )}
              />
            ) : (
              <Text variant="body-sm" color="secondary">
                {t('scout:playerDetail.noHonours')}
              </Text>
            )}
          </CollapsibleSection>
        </RevealSection>
      </Screen>

      {!guestMode ? (
      <View className="absolute bottom-0 left-0 right-0 border-t border-divider bg-surface px-4 pb-6 pt-3">
        <Button
          variant="accent"
          className="w-full"
          accessibilityLabel={t('scout:playerDetail.inviteToTrial')}
          onPress={() => setInviteSignal((current) => current + 1)}
        >
          {t('scout:playerDetail.inviteToTrial')}
        </Button>
        <Text variant="caption" color="secondary" className="mt-2 text-center">
          {t('scout:playerDetail.contactViaTrial')}
        </Text>
      </View>
      ) : null}
    </View>
  );
}
