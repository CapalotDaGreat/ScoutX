import {
  Crosshair,
  Goal,
  Hand,
  Shield,
  Sparkles,
  Target,
  Wind,
  type LucideIcon,
} from 'lucide-react-native';
import { type VideoCategory } from '@/features/highlight-videos/types';

export type VideoCategoryMeta = {
  icon: LucideIcon;
  accentClass: string;
};

export const VIDEO_CATEGORY_META: Record<VideoCategory, VideoCategoryMeta> = {
  goals: { icon: Goal, accentClass: 'bg-warning-muted' },
  assists: { icon: Target, accentClass: 'bg-accent-muted' },
  skills: { icon: Sparkles, accentClass: 'bg-info-muted' },
  defending: { icon: Shield, accentClass: 'bg-success-muted' },
  goalkeeping: { icon: Hand, accentClass: 'bg-info-muted' },
  passing: { icon: Wind, accentClass: 'bg-accent-muted' },
  headers: { icon: Crosshair, accentClass: 'bg-warning-muted' },
};

export const VIDEO_CATEGORIES = Object.keys(VIDEO_CATEGORY_META) as VideoCategory[];

export const VIDEO_FILTER_ALL = 'all' as const;

export type VideoCategoryFilter = VideoCategory | typeof VIDEO_FILTER_ALL;

/** Firebase Storage limits tuned for scout highlight reels. */
export const VIDEO_STORAGE_LIMITS = {
  maxDurationSec: 180,
  maxFileSizeBytes: 80 * 1024 * 1024,
  warnFileSizeBytes: 40 * 1024 * 1024,
  thumbnailMaxWidth: 640,
  thumbnailQuality: 0.72,
} as const;

export const VIDEO_STORAGE_PATHS = {
  video: (userId: string, videoId: string) => `profiles/${userId}/videos/${videoId}/video.mp4`,
  thumbnail: (userId: string, videoId: string) => `profiles/${userId}/videos/${videoId}/thumb.jpg`,
} as const;

export const DEFAULT_VIDEO_ANALYSIS = {
  status: 'none' as const,
};
