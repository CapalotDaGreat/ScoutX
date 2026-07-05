import { useCallback, useEffect, useMemo, useState } from 'react';
import { PostRepository } from '@/features/social-feed/repositories/PostRepository';
import { type FeedFilter, type SocialPost } from '@/features/social-feed/types';

export function useSocialFeed(blockedUserIds: Set<string>, filter: FeedFilter = 'all') {
  const repository = useMemo(() => PostRepository.getInstance(), []);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());

  const loadPage = useCallback(
    async (nextCursor: string | null, append: boolean) => {
      try {
        const page = await repository.fetchFeedPage(nextCursor, undefined, filter, blockedUserIds);
        setPosts((current) => (append ? [...current, ...page.posts] : page.posts));
        setCursor(page.nextCursor);
        setHasMore(page.hasMore);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load feed.');
      }
    },
    [blockedUserIds, filter, repository],
  );

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    setCursor(null);
    await loadPage(null, false);
    setIsRefreshing(false);
  }, [loadPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore || !cursor) {
      return;
    }
    setIsLoadingMore(true);
    await loadPage(cursor, true);
    setIsLoadingMore(false);
  }, [cursor, hasMore, isLoadingMore, loadPage]);

  useEffect(() => {
    setIsLoading(true);
    void loadPage(null, false).finally(() => setIsLoading(false));
  }, [filter, loadPage]);

  const toggleLike = useCallback(
    async (postId: string, userId: string) => {
      const updated = await repository.toggleLike(postId, userId);
      if (!updated) {
        return;
      }

      setPosts((current) =>
        current.map((post) => (post.id === postId ? updated : post)),
      );
      setLikedPostIds((current) => {
        const next = new Set(current);
        if (next.has(postId)) {
          next.delete(postId);
        } else {
          next.add(postId);
        }
        return next;
      });
    },
    [repository],
  );

  const prependOptimisticPost = useCallback((post: SocialPost) => {
    setPosts((current) => [post, ...current.filter((item) => item.id !== post.id)]);
  }, []);

  const replaceOptimisticPost = useCallback((postId: string, next: SocialPost) => {
    setPosts((current) => current.map((post) => (post.id === postId ? next : post)));
  }, []);

  return {
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
  };
}
