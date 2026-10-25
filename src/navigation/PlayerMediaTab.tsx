import { useEffect, useMemo, useState } from 'react';
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
import { isPlayerPosition, positionGroupFor } from '@/features/scout-intelligence/services/positionComparison';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

type MediaSegment = 'library' | 'reels' | 'gps';

export type PlayerMediaTabProps = {
  onManageVideosPress: () => void;
  onAnalyzeMatchVideoPress?: () => void;
  onOpenHighlightReelStudio?: () => void;
  onViewEvidence?: (jobId: string) => void;
  focusReelId?: string;
};

export function PlayerMediaTab({
  onManageVideosPress,
  onAnalyzeMatchVideoPress,
  onOpenHighlightReelStudio,
  onViewEvidence,
  focusReelId,
}: PlayerMediaTabProps) {
  const { t } = useAppTranslation('navigation');
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { profile } = usePlayerWorkspace();
  const positionGroup = useMemo(
    () => positionGroupFor((profile?.identity?.preferredPositions ?? []).filter(isPlayerPosition)),
    [profile?.identity?.preferredPositions],
  );
  const [segment, setSegment] = useState<MediaSegment>(focusReelId ? 'reels' : 'library');
  useEffect(() => {
    if (focusReelId) setSegment('reels');
  }, [focusReelId]);
  const [showReelStudio, setShowReelStudio] = useState(false);
  const [createdReelId, setCreatedReelId] = useState<string | null>(null);

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
          title={t('tabs.media')}
          subtitle={t('screens.highlightsSubtitle')}
          safeArea
          embeddedInTabShell
          safeAreaEdges={['left', 'right']}
          contentClassName="gap-4"
        >
          <View className="gap-3">
            <Button variant="prestige" onPress={onManageVideosPress}>
              {t('media.uploadFromPhotos')}
            </Button>
            {onAnalyzeMatchVideoPress ? (
              <Button variant="secondary" onPress={onAnalyzeMatchVideoPress}>
                {t('media.analyzeFromPhotos')}
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
            {t('media.openReelStudio')}
          </Button>
          <ReelListSection
            userId={user?.id ?? null}
            focusReelId={createdReelId ?? focusReelId}
            positionGroup={positionGroup}
            onViewEvidence={onViewEvidence}
          />
          <HighlightReelStudioModal
            visible={showReelStudio}
            playerId={user?.id ?? null}
            onClose={() => setShowReelStudio(false)}
            onReelCreated={(reelId) => {
              setShowReelStudio(false);
              setCreatedReelId(reelId);
            }}
          />
        </Screen>
      ) : null}
      {segment === 'gps' ? (
        <GpsTrackingScreen playerId={user?.id ?? null} embeddedInTabShell nestedUnderSegment />
      ) : null}
    </View>
  );
}
