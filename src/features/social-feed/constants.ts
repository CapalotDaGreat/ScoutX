export const POSTS_COLLECTION = 'posts';
export const POST_REACTIONS_COLLECTION = 'postReactions';

export const FEED_PAGE_SIZE = 12;

export const POST_MEDIA_LIMITS = {
  maxClipDurationSec: 60,
  maxClipSizeBytes: 50 * 1024 * 1024,
  maxImageSizeBytes: 8 * 1024 * 1024,
  maxImageWidth: 2048,
  maxImageHeight: 2048,
} as const;

export const POST_STORAGE_PATHS = {
  clip: (userId: string, postId: string) => `profiles/${userId}/posts/${postId}/clip.mp4`,
  image: (userId: string, postId: string) => `profiles/${userId}/posts/${postId}/image.jpg`,
  thumbnail: (userId: string, postId: string) => `profiles/${userId}/posts/${postId}/thumb.jpg`,
} as const;

export const POST_TYPE_LABELS = {
  clip: 'Highlight Clip',
  photo: 'Photo',
  text: 'Update',
  trial_invite: 'Trial Invite',
} as const;
