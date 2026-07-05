import { loadScopedValue, saveScopedValue } from '@/data/scopedAsyncStorage';
import { parseSocialPost } from '@/features/social-feed/models/PostModel';
import { type SocialPost } from '@/features/social-feed/types';

const POSTS_STORAGE_KEY = '@scoutx/social-feed/posts';
const GLOBAL_SCOPE = 'global';

export async function loadLocalPosts(): Promise<SocialPost[]> {
  return loadScopedValue(
    POSTS_STORAGE_KEY,
    GLOBAL_SCOPE,
    (value) => {
      if (!Array.isArray(value)) {
        return null;
      }
      return value
        .map((item) => {
          const record = item as Record<string, unknown>;
          const id = typeof record.id === 'string' ? record.id : '';
          return parseSocialPost(record, id);
        })
        .filter((post): post is SocialPost => post !== null);
    },
    () => [],
  );
}

export async function upsertLocalPost(post: SocialPost): Promise<void> {
  const existing = await loadLocalPosts();
  const next = existing.filter((item) => item.id !== post.id);
  next.unshift(post);
  await saveScopedValue(POSTS_STORAGE_KEY, GLOBAL_SCOPE, next);
}

export async function updateLocalPost(
  postId: string,
  patch: Partial<SocialPost>,
): Promise<SocialPost | null> {
  const existing = await loadLocalPosts();
  const index = existing.findIndex((item) => item.id === postId);
  if (index < 0) {
    return null;
  }
  const updated = { ...existing[index], ...patch };
  existing[index] = updated;
  await saveScopedValue(POSTS_STORAGE_KEY, GLOBAL_SCOPE, existing);
  return updated;
}
