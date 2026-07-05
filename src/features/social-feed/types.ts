import { type AuthRole } from '@/features/auth/types';

export type PostType = 'clip' | 'photo' | 'text' | 'trial_invite';

export type PostUploadStatus = 'uploading' | 'ready' | 'failed';

export type PostAuthor = {
  id: string;
  name: string;
  avatarUrl: string;
  role: AuthRole;
};

export type TrialInviteDetails = {
  positionNeeded: string;
  ageGroup: string;
  location: string;
  scheduledAt: string;
  clubProfileUrl?: string;
};

export type PostVisibility = 'public' | 'hidden';

export type SocialPost = {
  id: string;
  type: PostType;
  authorId: string;
  author: PostAuthor;
  text?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  uploadStatus: PostUploadStatus;
  trialDetails?: TrialInviteDetails;
  visibility: PostVisibility;
  likeCount: number;
  /** Reserved for future comment threads — no UI in v1. */
  commentCount: number;
  feedScore: number;
  createdAt: string;
  updatedAt: string;
};

export type SocialPostDraft = {
  type: PostType;
  text?: string;
  trialDetails?: TrialInviteDetails;
  author: PostAuthor;
  visibility?: PostVisibility;
};

export type FeedPageResult = {
  posts: SocialPost[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type FeedFilter = 'all' | 'trial_invite';

export type PostReaction = {
  id: string;
  postId: string;
  userId: string;
  createdAt: string;
};
