import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { TabSegmentControl } from '@/components/navigation/TabSegmentControl';
import { CareerScreen } from '@/features/career-timeline/components/CareerScreen';
import { usePlayerWorkspace } from '@/features/player-profile/context/PlayerWorkspaceProvider';
import { StatisticsScreen } from '@/features/player-statistics';
import { buildPerformanceContext } from '@/features/ai-insights';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { type PlayerStackParamList } from '@/navigation/types';

type PerformanceSegment = 'stats' | 'career';

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
  const { profile, isLoading, refreshProfile } = usePlayerWorkspace();
  const [segment, setSegment] = useState<PerformanceSegment>('stats');

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
      {segment === 'stats' ? (
        <StatisticsScreen
          matches={profile?.statisticsMatches}
          aiInsightContext={statisticsAiContext}
          onLogMatchPress={onLogMatchPress}
          onAnalyzeMatchVideoPress={onAnalyzeMatchVideoPress}
          onRefresh={refreshProfile}
          refreshing={isLoading}
          embeddedInTabShell
          nestedUnderSegment
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
