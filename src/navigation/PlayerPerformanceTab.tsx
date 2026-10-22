import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { TabSegmentControl } from '@/components/navigation/TabSegmentControl';
import { CareerScreen } from '@/features/career-timeline/components/CareerScreen';
import { DevelopmentDashboard } from '@/features/development/components/DevelopmentDashboard';
import { useDevelopment } from '@/features/development/hooks/useDevelopment';
import { usePlayerWorkspace } from '@/features/player-profile/context/PlayerWorkspaceProvider';
import { StatisticsScreen } from '@/features/player-statistics';
import { buildPerformanceContext } from '@/features/ai-insights';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { MatchSourceChips } from '@/features/football-sources';
import { useOwnFootballSources } from '@/features/football-sources/hooks/useOwnFootballSources';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { type PlayerStackParamList, type PlayerTabParamList } from '@/navigation/types';

type PerformanceSegment = 'development' | 'stats' | 'career';

export type PlayerPerformanceTabProps = {
  onLogMatchPress: () => void;
  onEditJourneyPress: () => void;
  onAnalyzeMatchVideoPress?: () => void;
};

export function PlayerPerformanceTab({
  onLogMatchPress,
  onEditJourneyPress,
  onAnalyzeMatchVideoPress,
}: PlayerPerformanceTabProps) {
  const { t } = useAppTranslation('navigation');
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const stackNavigation = useNavigation<NativeStackNavigationProp<PlayerStackParamList>>();
  const route = useRoute<RouteProp<PlayerTabParamList, 'Performance'>>();
  const { profile, isLoading, refreshProfile, saveMatchReflection } = usePlayerWorkspace();
  const [segment, setSegment] = useState<PerformanceSegment>(route.params?.segment ?? 'development');

  useEffect(() => {
    const requested = route.params?.segment;
    if (requested) {
      setSegment(requested);
    }
  }, [route.params?.segment]);

  const { sources: footballSources } = useOwnFootballSources(user?.id);
  const matches = profile?.statisticsMatches ?? [];
  const development = useDevelopment({
    userId: user?.id ?? null,
    profile,
    matches,
  });

  const statisticsAiContext = useMemo(() => {
    if (!user?.id || !profile) {
      return null;
    }

    return buildPerformanceContext(
      {
        playerId: user.id,
        playerName: profile.fullName,
        position: profile.position ? [profile.position] : undefined,
        club: profile.club,
        nationality: profile.nationality,
      },
      profile.statisticsMatches ?? [],
    );
  }, [profile, user?.id]);

  const segments = useMemo(
    () => [
      { id: 'development' as const, label: t('segments.development') },
      { id: 'stats' as const, label: t('segments.stats') },
      { id: 'career' as const, label: t('segments.career') },
    ],
    [t],
  );

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <TabSegmentControl
        segments={segments}
        activeSegment={segment}
        onSegmentChange={setSegment}
        testID="player-performance-segments"
      />
      {segment === 'development' ? (
        <DevelopmentDashboard
          development={development}
          embeddedInTabShell
          nestedUnderSegment
        />
      ) : segment === 'stats' ? (
        <StatisticsScreen
          matches={profile?.statisticsMatches}
          aiInsightContext={statisticsAiContext}
          onLogMatchPress={onLogMatchPress}
          onAnalyzeMatchVideoPress={onAnalyzeMatchVideoPress}
          onRefresh={refreshProfile}
          refreshing={isLoading}
          embeddedInTabShell
          nestedUnderSegment
          renderMatchFooter={(matchId) => <MatchSourceChips sources={footballSources} matchId={matchId} />}
          onSaveReflection={saveMatchReflection}
        />
      ) : (
        <CareerScreen
          embeddedInTabShell
          nestedUnderSegment
          onEditJourneyPress={onEditJourneyPress}
          onCareerReplayPress={() => stackNavigation.navigate('CareerReplay')}
        />
      )}

    </View>
  );
}
