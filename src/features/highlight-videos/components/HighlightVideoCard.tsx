import { Image, Pressable, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { PlayCircle, Star } from 'lucide-react-native';
import { Badge } from '@/components/primitives/Badge';
import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/theme';
import { VIDEO_CATEGORY_META } from '@/features/highlight-videos/constants';
import { formatVideoDuration } from '@/features/highlight-videos/models/HighlightVideoModel';
import { type HighlightVideo } from '@/features/highlight-videos/types';
import { cn } from '@/utils/cn';

export type HighlightVideoCardProps = {
  video: HighlightVideo;
  index?: number;
  variant?: 'default' | 'compact';
  onPress?: (video: HighlightVideo) => void;
  className?: string;
};

export function HighlightVideoCard({
  video,
  index = 0,
  variant = 'default',
  onPress,
  className,
}: HighlightVideoCardProps) {
  const { colors } = useTheme();
  const categoryMeta = VIDEO_CATEGORY_META[video.category];
  const CategoryIcon = categoryMeta.icon;
  const isFailed = video.uploadStatus === 'failed';
  const isUploading = video.uploadStatus === 'uploading' || video.uploadStatus === 'pending';

  const content = (
  <>
      <View className="relative overflow-hidden rounded-xl bg-neutral-900">
        {video.thumbnailUrl ? (
          <Image
            source={{ uri: video.thumbnailUrl }}
            className={cn(variant === 'compact' ? 'h-28 w-full' : 'h-40 w-full')}
            resizeMode="cover"
          />
        ) : (
          <View className={cn('items-center justify-center bg-neutral-800', variant === 'compact' ? 'h-28' : 'h-40')}>
            <CategoryIcon size={28} color={colors.textSecondary} />
          </View>
        )}

        <View className="absolute inset-0 bg-black/25" />

        {video.uploadStatus === 'ready' ? (
          <View className="absolute inset-0 items-center justify-center">
            <PlayCircle size={variant === 'compact' ? 36 : 44} color="white" />
          </View>
        ) : null}

        <View className="absolute left-2 top-2">
          <Badge label={categoryMeta.label} variant="accent" size="sm" />
        </View>

        {video.featured ? (
          <View className="absolute right-2 top-2 rounded-full bg-black/55 p-1.5">
            <Star size={14} color={colors.warning} fill={colors.warning} />
          </View>
        ) : null}

        {video.durationSec > 0 ? (
          <View className="absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-0.5">
            <Text variant="caption" className="font-sans-semibold text-white">
              {formatVideoDuration(video.durationSec)}
            </Text>
          </View>
        ) : null}

        {isUploading ? (
          <View className="absolute inset-0 items-center justify-center bg-black/50">
            <Text variant="caption" className="font-sans-semibold text-white">
              Uploading…
            </Text>
          </View>
        ) : null}

        {isFailed ? (
          <View className="absolute inset-0 items-center justify-center bg-error/80 px-3">
            <Text variant="caption" className="text-center font-sans-semibold text-white">
              Upload failed
            </Text>
          </View>
        ) : null}
      </View>

      <View className="gap-1 px-0.5 pt-2">
        <Text weight="semibold" numberOfLines={1}>
          {video.title || 'Untitled highlight'}
        </Text>
        {video.opponent || video.competition ? (
          <Text variant="body-sm" color="secondary" numberOfLines={1}>
            {[video.opponent, video.competition].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
        {video.tags.length > 0 ? (
          <Text variant="caption" color="accent" numberOfLines={1}>
            {video.tags.map((tag) => `#${tag}`).join(' ')}
          </Text>
        ) : null}
      </View>
    </>
  );

  if (onPress) {
    return (
      <Animated.View entering={FadeInUp.delay(Math.min(index, 8) * 40).duration(320)} className={className}>
        <Pressable onPress={() => onPress(video)} className="active:opacity-90">
          {content}
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 8) * 40).duration(320)} className={className}>
      {content}
    </Animated.View>
  );
}
