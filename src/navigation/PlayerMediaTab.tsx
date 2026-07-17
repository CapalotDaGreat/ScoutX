import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabSegmentControl } from '@/components/navigation/TabSegmentControl';
import { GpsTrackingScreen } from '@/features/gps';
import { HighlightVideosSection } from '@/features/highlight-videos';
import { usePlayerWorkspace } from '@/features/player-profile/context/PlayerWorkspaceProvider';
import { Button } from '@/components/primitives/Button';
import { Screen } from '@/components/layout/Screen';
import { Text } from '@/components/primitives/Text';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

type MediaSegment = 'highlights' | 'gps';

export type PlayerMediaTabProps = {
  onManageVideosPress: () => void;
  onAnalyzeMatchVideoPress?: () => void;
};

/**
 * Media tab: Highlights | GPS.
 * Trials live on the player stack (Home quick-action), not here.
 */
export function PlayerMediaTab({
  onManageVideosPress,
  onAnalyzeMatchVideoPress,
}: PlayerMediaTabProps) {
  const { t } = useAppTranslation('navigation');
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { profile } = usePlayerWorkspace();
  const [segment, setSegment] = useState<MediaSegment>('highlights');

  const segments = useMemo(
    () => [
      { id: 'highlights' as const, label: t('segments.highlights') },
      { id: 'gps' as const, label: t('segments.gps') },
    ],
    [t],
  );

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <TabSegmentControl
        segments={segments}
        activeSegment={segment}
        onSegmentChange={setSegment}
        testID="player-media-segments"
      />
      {segment === 'highlights' ? (
        <Screen
          title={t('screens.highlights')}
          subtitle={t('screens.highlightsSubtitle')}
          safeArea
          embeddedInTabShell
          safeAreaEdges={['left', 'right']}
          contentClassName="gap-4"
        >
          <Text variant="body-sm" color="secondary">
            Pick short scout clips from Photos / Gallery. Full Veo match film belongs under Growth →
            Analyze match video.
          </Text>
          <View className="gap-3">
            <Button variant="prestige" onPress={onManageVideosPress}>
              Upload from Photos
            </Button>
            {onAnalyzeMatchVideoPress ? (
              <Button variant="secondary" onPress={onAnalyzeMatchVideoPress}>
                Analyze match video from Photos
              </Button>
            ) : null}
          </View>
          <HighlightVideosSection
            library={profile?.highlightVideos}
            editable
            onManagePress={onManageVideosPress}
            onAnalyzeMatchVideoPress={onAnalyzeMatchVideoPress}
          />
        </Screen>
      ) : (
        <GpsTrackingScreen playerId={user?.id ?? null} embeddedInTabShell nestedUnderSegment />
      )}
    </View>
  );
}
