import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { ProgressBar } from '@/components/primitives/ProgressBar';
import { type VideoUploadProgress } from '@/features/highlight-videos/types';

export type HighlightVideoUploadProgressProps = {
  progress: VideoUploadProgress | null;
};

const phaseLabels: Record<VideoUploadProgress['phase'], string> = {
  thumbnail: 'Uploading thumbnail',
  video: 'Uploading video',
  metadata: 'Saving metadata',
};

export function HighlightVideoUploadProgress({ progress }: HighlightVideoUploadProgressProps) {
  if (!progress) {
    return null;
  }

  return (
    <View className="gap-2 rounded-xl border border-border bg-background-secondary/70 p-3 dark:border-neutral-800 dark:bg-neutral-900/80">
      <View className="flex-row items-center justify-between">
        <Text variant="body-sm" weight="semibold">
          {phaseLabels[progress.phase]}
        </Text>
        <Text variant="caption" color="accent">
          {Math.round(progress.progress)}%
        </Text>
      </View>
      <ProgressBar value={progress.progress} max={100} variant="accent" />
    </View>
  );
}
