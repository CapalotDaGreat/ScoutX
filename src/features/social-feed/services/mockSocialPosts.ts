import { type SocialPost } from '@/features/social-feed/types';
import { buildAuthorFromUser } from '@/features/social-feed/models/PostModel';
import { computeFeedScore } from '@/features/social-feed/services/feedScoreService';

const now = Date.now();

export function getMockSocialPosts(): SocialPost[] {
  const posts: SocialPost[] = [
    {
      id: 'mock-post-1',
      type: 'clip',
      authorId: 'player-demo',
      author: buildAuthorFromUser({
        id: 'player-demo',
        name: 'Luca Fernandez',
        role: 'player',
        avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
      }),
      text: 'Match-winning free kick from last weekend.',
      mediaUrl: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=80',
      thumbnailUrl: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=400&q=80',
      uploadStatus: 'ready',
      visibility: 'public',
      likeCount: 24,
      commentCount: 0,
      feedScore: computeFeedScore(24, new Date(now - 2 * 60 * 60 * 1000).toISOString()),
      createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'mock-post-2',
      type: 'trial_invite',
      authorId: 'scout-demo',
      author: buildAuthorFromUser({
        id: 'scout-demo',
        name: 'Alex Morgan',
        role: 'scout',
        avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=200&q=80',
      }),
      text: 'Open trial for attacking midfielders this Saturday.',
      uploadStatus: 'ready',
      visibility: 'public',
      trialDetails: {
        positionNeeded: 'Attacking Midfielder',
        ageGroup: 'U19',
        location: 'Manchester, UK',
        scheduledAt: new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString(),
        clubProfileUrl: 'https://scoutx.app/guest/player/scout-demo',
      },
      likeCount: 8,
      commentCount: 0,
      feedScore: computeFeedScore(8, new Date(now - 6 * 60 * 60 * 1000).toISOString()),
      createdAt: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'mock-post-3',
      type: 'text',
      authorId: 'player-demo-2',
      author: buildAuthorFromUser({
        id: 'player-demo-2',
        name: 'Maya Okonkwo',
        role: 'player',
      }),
      text: 'Finished pre-season with 3 goals in 2 friendlies. Ready for trials.',
      uploadStatus: 'ready',
      visibility: 'public',
      likeCount: 15,
      commentCount: 0,
      feedScore: computeFeedScore(15, new Date(now - 20 * 60 * 60 * 1000).toISOString()),
      createdAt: new Date(now - 20 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - 20 * 60 * 60 * 1000).toISOString(),
    },
  ];

  return posts.sort((a, b) => b.feedScore - a.feedScore);
}
