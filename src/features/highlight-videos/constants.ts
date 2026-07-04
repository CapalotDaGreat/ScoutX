import {
  Crosshair,
  Goal,
  Hand,
  Shield,
  Sparkles,
  Target,
  Trophy,
  Wind,
  type LucideIcon,
} from 'lucide-react-native';
import { type VideoCategory } from '@/features/highlight-videos/types';

export type VideoCategoryMeta = {
  label: string;
  icon: LucideIcon;
  accentClass: string;
};

export const VIDEO_CATEGORY_META: Record<VideoCategory, VideoCategoryMeta> = {
  goals: { label: 'Goals', icon: Goal, accentClass: 'bg-warning-muted' },
  assists: { label: 'Assists', icon: Target, accentClass: 'bg-accent-muted' },
  skills: { label: 'Skills', icon: Sparkles, accentClass: 'bg-info-muted' },
  defending: { label: 'Defending', icon: Shield, accentClass: 'bg-success-muted' },
  goalkeeping: { label: 'Goalkeeping', icon: Hand, accentClass: 'bg-info-muted' },
  passing: { label: 'Passing', icon: Wind, accentClass: 'bg-accent-muted' },
  headers: { label: 'Headers', icon: Crosshair, accentClass: 'bg-warning-muted' },
};

export const VIDEO_CATEGORY_OPTIONS = Object.entries(VIDEO_CATEGORY_META).map(([value, meta]) => ({
  value: value as VideoCategory,
  label: meta.label,
}));

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
