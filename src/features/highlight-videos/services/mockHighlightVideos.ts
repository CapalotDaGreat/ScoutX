import { type HighlightVideo } from '@/features/highlight-videos/types';
import { VIDEO_CATEGORY_META } from '@/features/highlight-videos/constants';

const now = '2025-06-15T12:00:00.000Z';

export const mockHighlightVideos: HighlightVideo[] = [
  {
    id: 'hv-01',
    title: 'Match-winning free kick',
    description: 'Curled finish from 22 yards in the 89th minute.',
    tags: ['set-piece', 'clutch'],
    category: 'goals',
    match: 'Northstar FC vs Rangers',
    opponent: 'Rangers',
    competition: 'Primera División',
    date: '2025-03-18T00:00:00.000Z',
    durationSec: 42,
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=800&q=80',
    storagePath: 'profiles/demo/videos/hv-01/video.mp4',
    thumbnailStoragePath: 'profiles/demo/videos/hv-01/thumb.jpg',
    featured: true,
    sortOrder: 0,
    fileSizeBytes: 12_400_000,
    uploadStatus: 'ready',
    analysis: { status: 'none' },
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'hv-02',
    title: 'Through-ball assist',
    description: 'Weighted pass splitting the defensive line.',
    tags: ['vision', 'final-third'],
    category: 'assists',
    match: 'Northstar FC vs Coastal United',
    opponent: 'Coastal United',
    competition: 'Primera División',
    date: '2025-02-10T00:00:00.000Z',
    durationSec: 28,
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=800&q=80',
    storagePath: 'profiles/demo/videos/hv-02/video.mp4',
    thumbnailStoragePath: 'profiles/demo/videos/hv-02/thumb.jpg',
    featured: false,
    sortOrder: 1,
    fileSizeBytes: 9_800_000,
    uploadStatus: 'ready',
    analysis: { status: 'none' },
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'hv-03',
    title: 'Elastico skill sequence',
    description: '1v1 dribble in tight space before cut-back cross.',
    tags: ['1v1', 'dribbling'],
    category: 'skills',
    opponent: 'Academy Select',
    competition: 'Friendly',
    date: '2025-01-22T00:00:00.000Z',
    durationSec: 35,
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&w=800&q=80',
    storagePath: 'profiles/demo/videos/hv-03/video.mp4',
    thumbnailStoragePath: 'profiles/demo/videos/hv-03/thumb.jpg',
    featured: false,
    sortOrder: 2,
    fileSizeBytes: 11_200_000,
    uploadStatus: 'ready',
    analysis: { status: 'queued', requestedAt: now },
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'hv-04',
    title: 'Recovery tackle',
    description: 'Tracking back to win possession in transition.',
    tags: ['pressing', 'work-rate'],
    category: 'defending',
    competition: 'Cup Quarter-Final',
    date: '2024-11-30T00:00:00.000Z',
    durationSec: 18,
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?auto=format&fit=crop&w=800&q=80',
    storagePath: 'profiles/demo/videos/hv-04/video.mp4',
    featured: false,
    sortOrder: 3,
    fileSizeBytes: 7_500_000,
    uploadStatus: 'ready',
    analysis: { status: 'none' },
    createdAt: now,
    updatedAt: now,
  },
];

export function getMockHighlightVideoLibrary() {
  return {
    videos: mockHighlightVideos,
    featuredVideoId: 'hv-01',
    updatedAt: now,
  };
}

export function getCategoryLabel(category: HighlightVideo['category']): string {
  return VIDEO_CATEGORY_META[category].label;
}
