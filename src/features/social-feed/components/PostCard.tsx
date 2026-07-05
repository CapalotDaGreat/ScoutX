import { useMemo } from 'react';
import { Image, Pressable, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Heart, MapPin, CalendarDays } from 'lucide-react-native';
import { Card } from '@/components/primitives/Card';
import { Avatar } from '@/components/primitives/Avatar';
import { Badge } from '@/components/primitives/Badge';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { ReportContentButton } from '@/features/trust-safety';
import { POST_TYPE_LABELS } from '@/features/social-feed/constants';
import { type SocialPost } from '@/features/social-feed/types';
import { useTheme } from '@/theme';
import { triggerHaptic } from '@/utils/haptics';

export type PostCardProps = {
  post: SocialPost;
  index?: number;
  liked?: boolean;
  onLikePress?: () => void;
  onBlockAuthor?: () => void;
};

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) {
    return 'Just now';
  }
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function PostCard({
  post,
  index = 0,
  liked = false,
  onLikePress,
  onBlockAuthor,
}: PostCardProps) {
  const { colors } = useTheme();
  const isTrialInvite = post.type === 'trial_invite';

  const mediaPreview = useMemo(() => {
    if (post.type === 'photo' || post.type === 'clip') {
      const uri = post.thumbnailUrl ?? post.mediaUrl;
      if (!uri) {
        return null;
      }
      return (
        <Image
          source={{ uri }}
          className="mt-3 h-48 w-full rounded-xl bg-background-secondary"
          resizeMode="cover"
        />
      );
    }
    return null;
  }, [post.mediaUrl, post.thumbnailUrl, post.type]);

  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 40).duration(320)}>
      <Card variant={isTrialInvite ? 'elevated' : 'default'} padding="md" className="gap-3">
        <View className="flex-row items-start gap-3">
          <Avatar
            name={post.author.name}
            source={post.author.avatarUrl ? { uri: post.author.avatarUrl } : undefined}
            size="md"
          />
          <View className="flex-1 gap-1">
            <View className="flex-row flex-wrap items-center gap-2">
              <Text weight="semibold">{post.author.name}</Text>
              <Badge variant={isTrialInvite ? 'accent' : 'default'} size="sm" label={POST_TYPE_LABELS[post.type]} />
            </View>
            <Text variant="caption" color="secondary">
              {formatRelativeTime(post.createdAt)}
            </Text>
          </View>
        </View>

        {post.text ? <Text variant="body-sm">{post.text}</Text> : null}

        {isTrialInvite && post.trialDetails ? (
          <View className="gap-2 rounded-xl border border-accent/20 bg-accent-muted/30 p-3 dark:border-green-500/20 dark:bg-green-950/20">
            <Text weight="semibold">{post.trialDetails.positionNeeded}</Text>
            <View className="flex-row items-center gap-2">
              <Badge variant="info" size="sm" label={post.trialDetails.ageGroup} />
              <View className="flex-row items-center gap-1">
                <MapPin size={14} color={colors.textSecondary} />
                <Text variant="caption" color="secondary">
                  {post.trialDetails.location}
                </Text>
              </View>
            </View>
            <View className="flex-row items-center gap-1">
              <CalendarDays size={14} color={colors.textSecondary} />
              <Text variant="caption" color="secondary">
                {new Date(post.trialDetails.scheduledAt).toLocaleString()}
              </Text>
            </View>
          </View>
        ) : null}

        {mediaPreview}

        {post.uploadStatus === 'uploading' ? (
          <Text variant="caption" color="secondary">
            Uploading…
          </Text>
        ) : null}

        <View className="flex-row items-center justify-between gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={liked ? 'Unlike post' : 'Like post'}
            onPress={() => {
              void triggerHaptic('light');
              onLikePress?.();
            }}
            className="flex-row items-center gap-2"
          >
            <Heart
              size={18}
              color={liked ? colors.accent : colors.textSecondary}
              fill={liked ? colors.accent : 'transparent'}
            />
            <Text variant="body-sm" color={liked ? 'accent' : 'secondary'}>
              {post.likeCount}
            </Text>
          </Pressable>

          <View className="flex-row items-center gap-1">
            <ReportContentButton targetType="post" targetId={post.id} />
            {onBlockAuthor ? (
              <Button variant="ghost" size="sm" onPress={onBlockAuthor}>
                Block
              </Button>
            ) : null}
          </View>
        </View>
      </Card>
    </Animated.View>
  );
}
