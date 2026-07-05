import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  startAfter,
  where,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import { FEED_PAGE_SIZE, POSTS_COLLECTION, POST_REACTIONS_COLLECTION } from '@/features/social-feed/constants';
import {
  buildPostFromDraft,
  parseSocialPost,
  serializeSocialPost,
  sortPostsByFeedScore,
} from '@/features/social-feed/models/PostModel';
import {
  computeFeedScore,
  createReactionId,
} from '@/features/social-feed/services/feedScoreService';
import { getMockSocialPosts } from '@/features/social-feed/services/mockSocialPosts';
import {
  loadLocalPosts,
  updateLocalPost,
  upsertLocalPost,
} from '@/features/social-feed/services/postStorage';
import {
  type FeedFilter,
  type FeedPageResult,
  type SocialPost,
  type SocialPostDraft,
} from '@/features/social-feed/types';

function paginateMockPosts(
  posts: SocialPost[],
  cursor: string | null,
  pageSize: number,
  filter: FeedFilter,
): FeedPageResult {
  const filtered =
    filter === 'trial_invite' ? posts.filter((post) => post.type === 'trial_invite') : posts;
  const sorted = sortPostsByFeedScore(filtered);
  const startIndex = cursor ? sorted.findIndex((post) => post.id === cursor) + 1 : 0;
  const slice = sorted.slice(startIndex, startIndex + pageSize);
  const nextCursor = slice.length === pageSize ? slice[slice.length - 1]?.id ?? null : null;

  return {
    posts: slice,
    nextCursor,
    hasMore: startIndex + pageSize < sorted.length,
  };
}

export class PostRepository {
  private static instance: PostRepository | null = null;

  private constructor() {}

  public static getInstance(): PostRepository {
    if (!this.instance) {
      this.instance = new PostRepository();
    }
    return this.instance;
  }

  public async fetchFeedPage(
    cursor: string | null,
    pageSize = FEED_PAGE_SIZE,
    filter: FeedFilter = 'all',
    blockedUserIds: Set<string> = new Set(),
  ): Promise<FeedPageResult> {
    const db = getFirestoreDb();

    if (!db) {
      const local = await loadLocalPosts();
      const source = local.length > 0 ? local : getMockSocialPosts();
      const visible = source.filter((post) => !blockedUserIds.has(post.authorId));
      return paginateMockPosts(visible, cursor, pageSize, filter);
    }

    try {
      const postsRef = collection(db, POSTS_COLLECTION);
      const constraints = [
        where('visibility', '==', 'public'),
        ...(filter === 'trial_invite' ? [where('type', '==', 'trial_invite')] : []),
        orderBy('feedScore', 'desc'),
        orderBy('createdAt', 'desc'),
        limit(pageSize),
        ...(cursor
          ? [startAfter({ id: cursor } as unknown as QueryDocumentSnapshot)]
          : []),
      ];

      const postsQuery = query(postsRef, ...constraints);
      const snapshot = await getDocs(postsQuery);

      const posts = snapshot.docs
        .map((document) => parseSocialPost(document.data(), document.id))
        .filter((post): post is SocialPost => post !== null)
        .filter((post) => !blockedUserIds.has(post.authorId));

      if (posts.length === 0 && !cursor) {
        const mock = getMockSocialPosts().filter((post) => !blockedUserIds.has(post.authorId));
        return paginateMockPosts(mock, null, pageSize, filter);
      }

      const lastDoc = snapshot.docs[snapshot.docs.length - 1] as DocumentSnapshot | undefined;

      return {
        posts,
        nextCursor: lastDoc?.id ?? null,
        hasMore: snapshot.docs.length === pageSize,
      };
    } catch {
      const local = await loadLocalPosts();
      const source = local.length > 0 ? local : getMockSocialPosts();
      const visible = source.filter((post) => !blockedUserIds.has(post.authorId));
      return paginateMockPosts(visible, cursor, pageSize, filter);
    }
  }

  public async createPost(draft: SocialPostDraft): Promise<SocialPost> {
    const post = buildPostFromDraft(draft);
    const db = getFirestoreDb();

    if (db) {
      try {
        await setDoc(doc(db, POSTS_COLLECTION, post.id), serializeSocialPost(post));
        return post;
      } catch {
        await upsertLocalPost(post);
        return post;
      }
    }

    await upsertLocalPost(post);
    return post;
  }

  public async updatePost(postId: string, patch: Partial<SocialPost>): Promise<SocialPost | null> {
    const db = getFirestoreDb();

    if (db) {
      try {
        const existingSnap = await getDoc(doc(db, POSTS_COLLECTION, postId));
        if (!existingSnap.exists()) {
          return updateLocalPost(postId, patch);
        }
        const existing = parseSocialPost(existingSnap.data(), postId);
        if (!existing) {
          return null;
        }
        const updated: SocialPost = {
          ...existing,
          ...patch,
          updatedAt: new Date().toISOString(),
          feedScore: computeFeedScore(
            patch.likeCount ?? existing.likeCount,
            existing.createdAt,
          ),
        };
        await setDoc(doc(db, POSTS_COLLECTION, postId), serializeSocialPost(updated));
        return updated;
      } catch {
        return updateLocalPost(postId, patch);
      }
    }

    return updateLocalPost(postId, patch);
  }

  public async toggleLike(postId: string, userId: string): Promise<SocialPost | null> {
    const db = getFirestoreDb();
    const reactionId = createReactionId(postId, userId);

    let liked = false;
    if (db) {
      const reactionSnap = await getDoc(doc(db, POST_REACTIONS_COLLECTION, reactionId));
      liked = reactionSnap.exists();
    }

    const postSnap = db ? await getDoc(doc(db, POSTS_COLLECTION, postId)) : null;
    const post = postSnap?.exists()
      ? parseSocialPost(postSnap.data(), postId)
      : (await loadLocalPosts()).find((item) => item.id === postId) ?? null;

    if (!post) {
      return null;
    }

    const nextLikeCount = liked ? Math.max(0, post.likeCount - 1) : post.likeCount + 1;

    if (db) {
      await setDoc(
        doc(db, POST_REACTIONS_COLLECTION, reactionId),
        liked
          ? { active: false, postId, userId, updatedAt: new Date().toISOString() }
          : { active: true, postId, userId, createdAt: new Date().toISOString() },
        { merge: true },
      );
    }

    return this.updatePost(postId, {
      likeCount: nextLikeCount,
      feedScore: computeFeedScore(nextLikeCount, post.createdAt),
    });
  }

  public async hasUserLiked(postId: string, userId: string): Promise<boolean> {
    const db = getFirestoreDb();
    if (!db) {
      return false;
    }

    const reactionSnap = await getDoc(
      doc(db, POST_REACTIONS_COLLECTION, createReactionId(postId, userId)),
    );
    return reactionSnap.exists() && reactionSnap.data()?.active !== false;
  }
}
