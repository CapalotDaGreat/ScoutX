/** Lightweight engagement + recency score — mirrors server-side on-write trigger logic. */
export function computeFeedScore(likeCount: number, createdAt: string, now = Date.now()): number {
  const ageHours = Math.max(0, (now - new Date(createdAt).getTime()) / (1000 * 60 * 60));
  const recencyBoost = Math.max(0, 168 - ageHours) / 168;
  return Math.round(likeCount * 10 + recencyBoost * 100);
}

export function createPostId(): string {
  return `post_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createReactionId(postId: string, userId: string): string {
  return `react_${postId}_${userId}`;
}
