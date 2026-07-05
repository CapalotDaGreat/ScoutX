import { useMemo } from 'react';
import { DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native';
import { useTheme } from '@/theme';

export function useNavigationTheme(): Theme {
  const { isDark, colors } = useTheme();

  return useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.accent,
        background: colors.background,
        card: colors.surface,
        text: colors.textPrimary,
        border: colors.border,
        notification: colors.accent,
      },
    };
  }, [colors.accent, colors.background, colors.border, colors.surface, colors.textPrimary, isDark]);
}
