import { Image, Pressable, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { PlayCircle, Star } from 'lucide-react-native';
import { Badge } from '@/components/primitives/Badge';
import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/theme';
import { VIDEO_CATEGORY_META } from '@/features/highlight-videos/constants';
import { formatVideoDuration } from '@/features/highlight-videos/models/HighlightVideoModel';
import { type HighlightVideo } from '@/features/highlight-videos/types';

export type HighlightVideoFeaturedProps = {
  video: HighlightVideo;
  onPress?: (video: HighlightVideo) => void;
};

export function HighlightVideoFeatured({ video, onPress }: HighlightVideoFeaturedProps) {
  const { colors } = useTheme();
  const categoryMeta = VIDEO_CATEGORY_META[video.category];

  return (
    <Animated.View entering={FadeInDown.duration(400)}>
      <Pressable
        onPress={() => onPress?.(video)}
        className="overflow-hidden rounded-2xl border border-accent/30 dark:border-green-900/50 active:opacity-95"
      >
        <View className="relative">
          <Image
            source={{ uri: video.thumbnailUrl }}
            className="h-52 w-full"
            resizeMode="cover"
          />
          <View className="absolute inset-0 bg-black/35" />
          <View className="absolute bottom-0 left-0 right-0 h-1/2 bg-black/70" />
          <View className="absolute inset-0 items-center justify-center">
            <PlayCircle size={56} color="white" />
          </View>
          <View className="absolute left-3 top-3 flex-row items-center gap-2">
            <Badge label="Featured" variant="warning" size="sm" />
            <Badge label={categoryMeta.label} variant="accent" size="sm" />
          </View>
          <View className="absolute bottom-0 left-0 right-0 gap-1 p-4">
            <View className="flex-row items-center gap-1">
              <Star size={14} color={colors.warning} fill={colors.warning} />
              <Text variant="caption" className="font-sans-semibold uppercase tracking-wider text-white/90">
                ScoutX Spotlight
              </Text>
            </View>
            <Text variant="body-lg" className="font-sans-bold text-white">
              {video.title}
            </Text>
            {video.description ? (
              <Text variant="body-sm" className="text-white/85" numberOfLines={2}>
                {video.description}
              </Text>
            ) : null}
            <View className="mt-1 flex-row items-center gap-2">
              <Text variant="caption" className="text-white/80">
                {formatVideoDuration(video.durationSec)}
              </Text>
              {video.opponent ? (
                <Text variant="caption" className="text-white/80">
                  vs {video.opponent}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}
