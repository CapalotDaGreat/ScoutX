import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabSegmentControl } from '@/components/navigation/TabSegmentControl';
import { GpsTrackingScreen } from '@/features/gps';
import { HighlightVideosSection } from '@/features/highlight-videos';
import { HighlightReelStudioModal } from '@/features/highlight-reel-studio';
import { MediaLibrarySection } from '@/features/media-library';
import { ReelListSection } from '@/features/reel-studio';
import { usePlayerWorkspace } from '@/features/player-profile/context/PlayerWorkspaceProvider';
import { Button } from '@/components/primitives/Button';
import { Screen } from '@/components/layout/Screen';
import { Text } from '@/components/primitives/Text';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

type MediaSegment = 'library' | 'reels' | 'gps';

export type PlayerMediaTabProps = {
  onManageVideosPress: () => void;
  onAnalyzeMatchVideoPress?: () => void;
  onOpenHighlightReelStudio?: () => void;
};

export function PlayerMediaTab({
  onManageVideosPress,
  onAnalyzeMatchVideoPress,
  onOpenHighlightReelStudio,
}: PlayerMediaTabProps) {
  const { t } = useAppTranslation('navigation');
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { profile } = usePlayerWorkspace();
  const [segment, setSegment] = useState<MediaSegment>('library');
  const [showReelStudio, setShowReelStudio] = useState(false);

  const segments = useMemo(
    () => [
      { id: 'library' as const, label: t('segments.library') },
      { id: 'reels' as const, label: t('segments.reels') },
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
      {segment === 'library' ? (
        <Screen
          title={t('screens.highlights')}
          subtitle={t('screens.highlightsSubtitle')}
          safeArea
          embeddedInTabShell
          safeAreaEdges={['left', 'right']}
          contentClassName="gap-4"
        >
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
          <MediaLibrarySection
            userId={user?.id ?? null}
            legacyVideos={profile?.highlightVideos?.videos ?? []}
          />
          <HighlightVideosSection
            library={profile?.highlightVideos}
            editable
            onManagePress={onManageVideosPress}
            onAnalyzeMatchVideoPress={onAnalyzeMatchVideoPress}
          />
        </Screen>
      ) : null}
      {segment === 'reels' ? (
        <Screen
          title={t('segments.reels')}
          safeArea
          embeddedInTabShell
          safeAreaEdges={['left', 'right']}
          contentClassName="gap-4"
        >
          <Button
            variant="secondary"
            onPress={() => {
              if (onOpenHighlightReelStudio) {
                onOpenHighlightReelStudio();
                return;
              }
              setShowReelStudio(true);
            }}
          >
            Open Highlight Reel Studio
          </Button>
          <ReelListSection userId={user?.id ?? null} />
          <HighlightReelStudioModal
            visible={showReelStudio}
            playerId={user?.id ?? null}
            onClose={() => setShowReelStudio(false)}
          />
        </Screen>
      ) : null}
      {segment === 'gps' ? (
        <GpsTrackingScreen playerId={user?.id ?? null} embeddedInTabShell nestedUnderSegment />
      ) : null}
    </View>
  );
}
