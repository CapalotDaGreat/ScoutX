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

export type HighlightVideosSectionProps = {
  library?: HighlightVideoLibrary;
  editable?: boolean;
  onManagePress?: () => void;
};

export function HighlightVideosSection({
  library = emptyHighlightVideoLibrary(),
  editable = false,
  onManagePress,
}: HighlightVideosSectionProps) {
  const { colors } = useTheme();
  const [playerVideo, setPlayerVideo] = useState<HighlightVideo | null>(null);

  const readyCount = useMemo(
    () => library.videos.filter((video) => video.uploadStatus === 'ready').length,
    [library.videos],
  );

  const action =
    editable && onManagePress ? (
      <Button variant="secondary" size="sm" onPress={onManagePress}>
        Manage
      </Button>
    ) : undefined;

  return (
    <>
      <ProfileSection
        title="Highlight Videos"
        subtitle="Professional match reels organized for scouts — goals, skills, defending, and more"
        action={action}
        variant="outlined"
        className="border-accent/20 dark:border-green-900/40"
      >
        <View className="mb-2 flex-row items-center gap-2 rounded-lg bg-accent-muted/50 px-3 py-2 dark:bg-green-950/40">
          <Clapperboard size={16} color={colors.accent} />
          <Text variant="caption" color="accent" className="flex-1">
            {readyCount} highlight{readyCount === 1 ? '' : 's'} in your reel
          </Text>
        </View>

        {readyCount === 0 ? (
          <View className="rounded-xl border border-dashed border-border bg-background-secondary/50 px-4 py-8/50">
            <Text variant="body-sm" color="secondary" className="text-center">
              Upload your first highlight to showcase your best moments to scouts.
            </Text>
            {editable && onManagePress ? (
              <Button variant="accent" className="mt-4" onPress={onManagePress}>
                Upload Highlight
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
