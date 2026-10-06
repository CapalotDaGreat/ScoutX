import { type ThemeColors } from '@/theme/tokens/colors';

/**
 * Maps theme tokens to NativeWind CSS custom properties.
 * Applied at runtime via `vars()` so light/dark switch works on native (not only web :root/.dark).
 */
export function themeColorsToCssVars(colors: ThemeColors): Record<string, string> {
  return {
    '--color-primary': colors.primary,
    '--color-primary-foreground': colors.primaryForeground,
    '--color-accent': colors.accent,
    '--color-accent-foreground': colors.accentForeground,
    '--color-accent-muted': colors.accentMuted,
    '--color-gold': colors.gold,
    '--color-gold-foreground': colors.goldForeground,
    '--color-gold-muted': colors.goldMuted,
    '--color-background': colors.background,
    '--color-background-secondary': colors.backgroundSecondary,
    '--color-surface': colors.surface,
    '--color-surface-elevated': colors.surfaceElevated,
    '--color-surface-cool': colors.surfaceCool,
    '--color-foreground': colors.textPrimary,
    '--color-foreground-secondary': colors.textSecondary,
    '--color-foreground-tertiary': colors.textTertiary,
    '--color-foreground-inverse': colors.textInverse,
    '--color-border': colors.border,
    '--color-border-strong': colors.borderStrong,
    '--color-divider': colors.divider,
    '--color-success': colors.success,
    '--color-success-muted': colors.successMuted,
    '--color-warning': colors.warning,
    '--color-warning-muted': colors.warningMuted,
    '--color-error': colors.error,
    '--color-error-muted': colors.errorMuted,
    '--color-info': colors.info,
    '--color-info-muted': colors.infoMuted,
    '--color-evidence': colors.evidence,
    '--color-ai-derived': colors.aiDerived,
    '--color-verification': colors.verification,
    '--color-achievement': colors.achievement,
    '--color-disabled': colors.disabled,
  };
}
