import { useMemo } from 'react';
import { vars } from 'nativewind';
import { themeColorsToCssVars } from '@/theme/cssVariables';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * NativeWind CSS variables for portals (Modal, BottomSheet) that render
 * outside the ThemeProvider root View and would otherwise lose theme tokens.
 */
export function useThemeCssVars() {
  const { colors } = useTheme();
  return useMemo(() => vars(themeColorsToCssVars(colors)), [colors]);
}
