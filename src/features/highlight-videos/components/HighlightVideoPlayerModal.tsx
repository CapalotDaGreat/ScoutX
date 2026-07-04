import { useEffect } from 'react';
import { View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Modal } from '@/components/feedback/Modal';
import { Text } from '@/components/primitives/Text';
import { type HighlightVideo } from '@/features/highlight-videos/types';

export type HighlightVideoPlayerModalProps = {
  visible: boolean;
  video: HighlightVideo | null;
  onClose: () => void;
};

export function HighlightVideoPlayerModal({
  visible,
  video,
  onClose,
}: HighlightVideoPlayerModalProps) {
  const player = useVideoPlayer(video?.videoUrl ?? null, (instance) => {
    instance.loop = false;
  });

  useEffect(() => {
    if (visible && video?.videoUrl) {
      player.play();
    } else {
      player.pause();
    }
  }, [player, video?.videoUrl, visible]);

  if (!video) {
    return null;
  }

  return (
    <Modal visible={visible} onClose={onClose} title={video.title} size="sheet">
      <View className="gap-3 p-4">
        <View className="overflow-hidden rounded-xl bg-black">
          <VideoView
            player={player}
            style={{ width: '100%', height: 220 }}
            contentFit="contain"
            nativeControls
            allowsFullscreen
          />
        </View>
        {video.description ? (
          <Text variant="body-sm" color="secondary">
            {video.description}
          </Text>
        ) : null}
      </View>
    </Modal>
  );
}
