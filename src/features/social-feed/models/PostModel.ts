import { computeFeedScore, createPostId } from '@/features/social-feed/services/feedScoreService';
import {
  type SocialPost,
  type SocialPostDraft,
  type TrialInviteDetails,
} from '@/features/social-feed/types';
import { type AuthRole } from '@/features/auth/types';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseAuthor(value: unknown): SocialPost['author'] | null {
  const record = asRecord(value);
  if (!record || typeof record.id !== 'string') {
    return null;
  }

  const role =
    record.role === 'player' ||
    record.role === 'scout' ||
    record.role === 'club' ||
    record.role === 'guest'
      ? record.role
      : 'player';

  return {
    id: record.id,
    name: typeof record.name === 'string' ? record.name : 'ScoutX User',
    avatarUrl: typeof record.avatarUrl === 'string' ? record.avatarUrl : '',
    role,
  };
}

function parseTrialDetails(value: unknown): TrialInviteDetails | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  return {
    positionNeeded: typeof record.positionNeeded === 'string' ? record.positionNeeded : '',
    ageGroup: typeof record.ageGroup === 'string' ? record.ageGroup : '',
    location: typeof record.location === 'string' ? record.location : '',
    scheduledAt: typeof record.scheduledAt === 'string' ? record.scheduledAt : new Date().toISOString(),
    clubProfileUrl: typeof record.clubProfileUrl === 'string' ? record.clubProfileUrl : undefined,
  };
}

export function parseSocialPost(data: Record<string, unknown>, id: string): SocialPost | null {
  const author = parseAuthor(data.author);
  if (!author) {
    return null;
  }

  const type =
    data.type === 'clip' ||
    data.type === 'photo' ||
    data.type === 'text' ||
    data.type === 'trial_invite'
      ? data.type
      : 'text';

  const createdAt = typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString();
  const likeCount = typeof data.likeCount === 'number' ? data.likeCount : 0;

  return {
    id,
    type,
    authorId: typeof data.authorId === 'string' ? data.authorId : author.id,
    author,
    text: typeof data.text === 'string' ? data.text : undefined,
    mediaUrl: typeof data.mediaUrl === 'string' ? data.mediaUrl : undefined,
    thumbnailUrl: typeof data.thumbnailUrl === 'string' ? data.thumbnailUrl : undefined,
    uploadStatus:
      data.uploadStatus === 'uploading' ||
      data.uploadStatus === 'ready' ||
      data.uploadStatus === 'failed'
        ? data.uploadStatus
        : 'ready',
    trialDetails: type === 'trial_invite' ? parseTrialDetails(data.trialDetails) : undefined,
    visibility: data.visibility === 'hidden' ? 'hidden' : 'public',
    likeCount,
    commentCount: typeof data.commentCount === 'number' ? data.commentCount : 0,
    feedScore:
      typeof data.feedScore === 'number' ? data.feedScore : computeFeedScore(likeCount, createdAt),
    createdAt,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : createdAt,
  };
}

export function serializeSocialPost(post: SocialPost): Record<string, unknown> {
  return {
    type: post.type,
    authorId: post.authorId,
    author: post.author,
    text: post.text ?? null,
    mediaUrl: post.mediaUrl ?? null,
    thumbnailUrl: post.thumbnailUrl ?? null,
    uploadStatus: post.uploadStatus,
    trialDetails: post.trialDetails ?? null,
    visibility: post.visibility,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    feedScore: post.feedScore,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

export function buildPostFromDraft(
  draft: SocialPostDraft,
  existing?: SocialPost,
): SocialPost {
  const now = new Date().toISOString();
  const createdAt = existing?.createdAt ?? now;

  return {
    id: existing?.id ?? createPostId(),
    type: draft.type,
    authorId: draft.author.id,
    author: draft.author,
    text: draft.text,
    mediaUrl: existing?.mediaUrl,
    thumbnailUrl: existing?.thumbnailUrl,
    uploadStatus: existing?.uploadStatus ?? 'ready',
    trialDetails: draft.trialDetails,
    visibility: draft.visibility ?? 'public',
    likeCount: existing?.likeCount ?? 0,
    commentCount: existing?.commentCount ?? 0,
    feedScore: computeFeedScore(existing?.likeCount ?? 0, createdAt),
    createdAt,
    updatedAt: now,
  };
}

export function sortPostsByFeedScore(posts: SocialPost[]): SocialPost[] {
  return [...posts].sort((a, b) => {
    if (b.feedScore !== a.feedScore) {
      return b.feedScore - a.feedScore;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function buildAuthorFromUser(input: {
  id: string;
  name: string;
  avatarUrl?: string;
  role?: AuthRole;
}): SocialPost['author'] {
  return {
    id: input.id,
    name: input.name,
    avatarUrl: input.avatarUrl ?? '',
    role: input.role ?? 'player',
  };
}
