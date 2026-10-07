import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Screen } from '@/components/layout/Screen';
import { CollapsibleSection } from '@/components/layout/CollapsibleSection';
import { AmbientBackdrop } from '@/components/layout/AmbientBackdrop';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { EMPTY_CAREER_REPLAY } from '@/features/career-replay/constants';
import { useCareerReplayShare } from '@/features/career-replay/hooks/useCareerReplayShare';
import { buildCareerReplayData } from '@/features/career-replay/services/careerReplayService';
import { shareCareerReplayPdf } from '@/features/career-replay/services/careerReplayShareService';
import {
  CareerFirstsCard,
  SeasonComparisonCard,
  YearInReviewCard,
} from '@/features/career-story/components/CareerSeasonCards';
import { useCareerRecords } from '@/features/career-story/hooks/useCareerRecords';
import {
  buildSeasonSummaries,
  buildYearInReview,
  compareSeasons,
} from '@/features/career-story/services/careerSeasons';
import { usePortfolioAnalytics } from '@/features/portfolio-analytics/hooks/usePortfolioAnalytics';
import { usePlayerWorkspace } from '@/features/player-profile/context/PlayerWorkspaceProvider';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';

export type CareerReplayScreenProps = {
  onBack: () => void;
};

function CareerReplayHero({
  seasonLabel,
  playerName,
  position,
  club,
}: {
  seasonLabel: string;
  playerName: string;
  position: string;
  club: string;
}) {
  const { colors } = useTheme();
  const [size, setSize] = useState({ width: 360, height: 160 });

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setSize({ width, height });
    }
  };

  return (
    <View onLayout={onLayout} className="overflow-hidden rounded-2xl border border-border">
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
        {position || club ? (
          <Text variant="body-sm" className="text-[#B7BDC8]">
            {[position, club].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function CareerReplayScreen({ onBack }: CareerReplayScreenProps) {
  const { t, i18n } = useAppTranslation(['career', 'common']);
  const { profile } = usePlayerWorkspace();
  const { analytics } = usePortfolioAnalytics(profile?.id);
  const { records } = useCareerRecords();
  const seasons = useMemo(() => buildSeasonSummaries(records), [records]);
  const [season, setSeason] = useState<string | null>(null);

  useEffect(() => {
    if (season === null || !seasons.some((item) => item.season === season)) {
      setSeason(seasons[0]?.season ?? null);
    }
  }, [season, seasons]);

  const review = useMemo(
    () => (season ? buildYearInReview(seasons, season, records) : null),
    [records, season, seasons],
  );
  const comparison = useMemo(() => {
    const index = seasons.findIndex((item) => item.season === season);
    const previous = index >= 0 ? seasons[index + 1] : undefined;
    return index >= 0 && previous ? compareSeasons(seasons[index], previous) : null;
  }, [season, seasons]);
  const seasonMatches = useMemo(() => {
    const ids = new Set(review?.summary.matchIds ?? []);
    return (profile?.statisticsMatches ?? []).filter((match) => ids.has(match.id)).sort((a, b) => b.date.localeCompare(a.date));
  }, [profile?.statisticsMatches, review?.summary.matchIds]);

  const replay = useMemo(() => (profile ? buildCareerReplayData(profile, analytics) : null), [analytics, profile]);
  const { shareAsImage, isSharing, shareError, ShareCaptureLayer } = useCareerReplayShare(
    replay ?? EMPTY_CAREER_REPLAY,
    profile?.id,
  );

  const formatDate = (iso: string): string =>
    Number.isNaN(Date.parse(iso))
      ? '—'
      : new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }).format(new Date(iso));

  if (!profile || !replay) {
    return (
      <Screen title={t('career:replayTitle')} subtitle={t('career:replaySeasonSubtitle')} safeArea>
        <Text color="secondary">{t('career:replayCompleteProfile')}</Text>
        <Button variant="secondary" onPress={onBack} className="mt-4">
          {t('common:back')}
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
        title={t('career:replayTitle')}
        subtitle={season ?? t('career:replaySeasonSubtitle')}
        safeArea
        scrollable
        className="bg-transparent"
        footer={
          <Button variant="secondary" onPress={onBack} fullWidth>
            {t('common:back')}
          </Button>
        }
      >
        <View className="gap-4">
          <CareerReplayHero
            seasonLabel={season ?? t('career:replaySeasonSubtitle')}
            playerName={profile.fullName}
            position={profile.position}
            club={profile.club}
          />

          {seasons.length === 0 ? (
            <Text color="secondary">{t('career:review.noSeasons')}</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {seasons.map((item) => (
                <Button
                  key={item.season}
                  size="sm"
                  variant={item.season === season ? 'accent' : 'secondary'}
                  accessibilityState={{ selected: item.season === season }}
                  onPress={() => setSeason(item.season)}
                >
                  {item.season}
                </Button>
              ))}
            </ScrollView>
          )}

          {review ? <YearInReviewCard review={review} /> : null}
          {comparison ? <SeasonComparisonCard comparison={comparison} /> : null}

          {review && seasonMatches.length > 0 ? (
            <CollapsibleSection
              title={t('career:review.matchesTitle')}
              subtitle={t('career:review.matchesCount', { count: seasonMatches.length })}
              persistKey="career-replay-matches"
            >
              <View className="gap-2">
                {seasonMatches.map((match) => (
                  <View key={match.id} className="flex-row items-center justify-between gap-2">
                    <Text variant="body-sm" className="min-w-0 flex-1" numberOfLines={1}>
                      {match.opponent}
                      {match.position ? ` · ${match.position}` : ''}
                    </Text>
                    <Text variant="caption" color="secondary">
                      {t('career:review.matchLine', { goals: match.goals, assists: match.assists, minutes: match.minutes })} ·{' '}
                      {formatDate(match.date)}
                    </Text>
                  </View>
                ))}
              </View>
            </CollapsibleSection>
          ) : null}

          {review ? <CareerFirstsCard firsts={review.summary.firsts} /> : null}

          {shareError ? (
            <Text variant="body-sm" color="error">
              {shareError}
            </Text>
          ) : null}

          <View className="gap-2">
            <Button variant="accent" loading={isSharing} onPress={() => void shareAsImage()} fullWidth>
              {t('career:shareSeasonCard')}
            </Button>
            <Button variant="secondary" onPress={() => void shareCareerReplayPdf(replay, profile.id)} fullWidth>
              {t('career:sharePdfRecap')}
            </Button>
          </View>
        </View>
      </Screen>
    </>
  );
}
