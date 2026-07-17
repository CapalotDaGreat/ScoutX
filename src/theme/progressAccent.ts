import type { ThemeColors } from '@/theme/tokens/colors';

/**
 * Dynamic progress accent — portfolio completeness drives color (not a global theme swap).
 * 0–30 stone, 30–55 warm emerald path, 55–75 emerald, 75–100 prestige gold.
 * Gold arrives earlier so completeness feels rewarding sooner.
 */
export type ProgressAccentTier = 'stone' | 'info' | 'emerald' | 'gold';

export function resolveProgressAccentTier(completionRatio: number): ProgressAccentTier {
  const pct = Math.max(0, Math.min(100, completionRatio));
  if (pct < 30) {
    return 'stone';
  }
  if (pct < 55) {
    return 'info';
  }
  if (pct < 75) {
    return 'emerald';
  }
  return 'gold';
}

export function resolveProgressAccentColor(
  colors: ThemeColors,
  completionRatio: number,
): string {
  const tier = resolveProgressAccentTier(completionRatio);
  switch (tier) {
    case 'stone':
      return colors.textTertiary;
    case 'info':
      return colors.accent;
    case 'emerald':
      return colors.accent;
    case 'gold':
      return colors.gold;
  }
}

export function resolveProgressAccentMuted(
  colors: ThemeColors,
  completionRatio: number,
): string {
  const tier = resolveProgressAccentTier(completionRatio);
  switch (tier) {
    case 'stone':
      return colors.backgroundSecondary;
    case 'info':
      return colors.accentMuted;
    case 'emerald':
      return colors.accentMuted;
    case 'gold':
      return colors.goldMuted;
  }
}

export function resolveProgressBadgeVariant(
  completionRatio: number,
): 'default' | 'info' | 'accent' | 'prestige' {
  const tier = resolveProgressAccentTier(completionRatio);
  switch (tier) {
    case 'stone':
      return 'default';
    case 'info':
      return 'accent';
    case 'emerald':
      return 'accent';
    case 'gold':
      return 'prestige';
  }
}
