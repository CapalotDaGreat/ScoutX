import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Clapperboard } from 'lucide-react-native';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/theme';
import { HighlightVideoGrid } from '@/features/highlight-videos/components/HighlightVideoGrid';
import { HighlightVideoPlayerModal } from '@/features/highlight-videos/components/HighlightVideoPlayerModal';
import { ProfileSection } from '@/features/player-profile/components/identity/ProfileSection';
import { type HighlightVideo, type HighlightVideoLibrary } from '@/features/highlight-videos/types';
import { emptyHighlightVideoLibrary } from '@/features/highlight-videos/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type HighlightVideosSectionProps = {
  library?: HighlightVideoLibrary;
  editable?: boolean;
  onManagePress?: () => void;
  onAnalyzeMatchVideoPress?: () => void;
};

export function HighlightVideosSection({
  library = emptyHighlightVideoLibrary(),
  editable = false,
  onManagePress,
  onAnalyzeMatchVideoPress,
}: HighlightVideosSectionProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation('media');
  const [playerVideo, setPlayerVideo] = useState<HighlightVideo | null>(null);

  const readyCount = useMemo(
    () => library.videos.filter((video) => video.uploadStatus === 'ready').length,
    [library.videos],
  );

  const action =
    editable && onManagePress ? (
      <Button variant="secondary" size="sm" onPress={onManagePress}>
        {t('videos.manage')}
      </Button>
    ) : undefined;

  return (
    <>
      <ProfileSection
        title={t('videos.title')}
        subtitle={t('videos.subtitle')}
        action={action}
        variant="outlined"
        className="border-gold/30"
      >
        <View className="mb-2 flex-row items-center gap-2 rounded-lg bg-gold-muted/70 px-3 py-2">
          <Clapperboard size={16} color={colors.gold} />
          <Text variant="caption" color="prestige" className="flex-1">
            {t('videos.count', { count: readyCount })}
          </Text>
        </View>

        {editable ? (
          <Text variant="caption" color="secondary" className="mb-2">
            {t('videos.clipHint')}
          </Text>
        ) : null}

        {readyCount === 0 ? (
          <View className="rounded-xl border border-dashed border-border bg-background-secondary/50 px-4 py-8">
            <Text variant="body-sm" color="secondary" className="text-center">
              {t('videos.empty')}
            </Text>
            {editable && onManagePress ? (
              <Button variant="prestige" className="mt-4" onPress={onManagePress}>
                {t('videos.uploadClip')}
              </Button>
            ) : null}
            {editable && onAnalyzeMatchVideoPress ? (
              <Button variant="secondary" className="mt-3" onPress={onAnalyzeMatchVideoPress}>
                {t('videos.analyzeFull')}
              </Button>
            ) : null}
          </View>
        ) : (
          <HighlightVideoGrid library={library} onVideoPress={setPlayerVideo} />
        )}
      </ProfileSection>

      <HighlightVideoPlayerModal
        visible={playerVideo !== null}
        video={playerVideo}
        onClose={() => setPlayerVideo(null)}
      />
    </>
  );
}
