import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { Screen } from '@/components/layout/Screen';
import { FlashListView } from '@/components/lists/FlashListView';
import { EmptyState } from '@/components/feedback/EmptyState';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { PostCard } from '@/features/social-feed/components/PostCard';
import { CreatePostModal } from '@/features/social-feed/components/CreatePostModal';
import { useSocialFeed } from '@/features/social-feed/hooks/useSocialFeed';
import { useBlockedUsers } from '@/features/trust-safety';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { type FeedFilter } from '@/features/social-feed/types';
import { useTheme } from '@/theme';

export type SocialFeedScreenProps = {
  embeddedInTabShell?: boolean;
  allowCreate?: boolean;
};

export function SocialFeedScreen({
  embeddedInTabShell = false,
  allowCreate = true,
}: SocialFeedScreenProps) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { blockedIds, blockUser } = useBlockedUsers(user?.id ?? null);
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [composerVisible, setComposerVisible] = useState(false);

  const {
    posts,
    isLoading,
    isLoadingMore,
    isRefreshing,
    hasMore,
    error,
    likedPostIds,
    refresh,
    loadMore,
    toggleLike,
    prependOptimisticPost,
    replaceOptimisticPost,
  } = useSocialFeed(blockedIds, filter);

  const screenProps = embeddedInTabShell ? { embeddedInTabShell: true as const } : {};

  const handleBlockAuthor = useCallback(
    (authorId: string, authorName: string) => {
      void blockUser(authorId, authorName);
    },
    [blockUser],
  );

  return (
    <>
      <Screen
        title="For You"
        subtitle="Discover clips, updates, and trial invites from the ScoutX community."
        safeArea
        onRefresh={refresh}
        refreshing={isRefreshing}
        error={error}
        onRetry={refresh}
        {...screenProps}
        header={
          <View className="mb-4 flex-row flex-wrap items-center justify-between gap-3">
            <View className="flex-row gap-2">
              <Button
                variant={filter === 'all' ? 'secondary' : 'ghost'}
                size="sm"
                onPress={() => setFilter('all')}
              >
                All
              </Button>
              <Button
                variant={filter === 'trial_invite' ? 'secondary' : 'ghost'}
                size="sm"
                onPress={() => setFilter('trial_invite')}
              >
                Trial Invites
              </Button>
            </View>
            {allowCreate ? (
              <Button
                variant="accent"
                size="sm"
                leftIcon={<Plus size={16} color={colors.accentForeground} />}
                onPress={() => setComposerVisible(true)}
              >
                Post
              </Button>
            ) : null}
          </View>
        }
      >
        {isLoading && posts.length === 0 ? (
          <SkeletonLoader variant="card" count={3} />
        ) : posts.length === 0 ? (
          <EmptyState
            title="Your feed is quiet"
            description="Follow players and scouts, or create the first post to get the conversation started."
            actionLabel={allowCreate ? 'Create post' : undefined}
            onAction={allowCreate ? () => setComposerVisible(true) : undefined}
          />
        ) : (
          <FlashListView
            data={posts}
            keyExtractor={(item) => item.id}
            estimatedItemSize={220}
            onEndReached={hasMore ? () => void loadMore() : undefined}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              isLoadingMore ? (
                <View className="py-4">
                  <SkeletonLoader variant="card" count={1} />
                </View>
              ) : (
                <View className="h-4" />
              )
            }
            renderItem={({ item, index }) => (
              <View className="mb-4">
                <PostCard
                  post={item}
                  index={index}
                  liked={likedPostIds.has(item.id)}
                  onLikePress={
                    user?.id ? () => void toggleLike(item.id, user.id) : undefined
                  }
                  onBlockAuthor={
                    user?.id && item.authorId !== user.id
                      ? () => handleBlockAuthor(item.authorId, item.author.name)
                      : undefined
                  }
                />
              </View>
            )}
          />
        )}
      </Screen>

      {allowCreate ? (
        <CreatePostModal
          visible={composerVisible}
          onClose={() => setComposerVisible(false)}
          onOptimistic={prependOptimisticPost}
          onComplete={(post) => replaceOptimisticPost(post.id, post)}
        />
      ) : null}
    </>
  );
}
