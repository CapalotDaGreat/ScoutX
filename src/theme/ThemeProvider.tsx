import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
import {
  darkColors,
  lightColors,
  type ColorScheme,
  type ThemeColors,
} from '@/theme/tokens/colors';

type ThemeContextValue = {
  colorScheme: ColorScheme;
  colors: ThemeColors;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

type ThemeProviderProps = {
  children: ReactNode;
  forcedColorScheme?: ColorScheme;
};

export function ThemeProvider({
  children,
  forcedColorScheme,
}: ThemeProviderProps) {
  const systemScheme = useSystemColorScheme();
  const colorScheme: ColorScheme =
    forcedColorScheme ?? (systemScheme === 'dark' ? 'dark' : 'light');

  const value = useMemo<ThemeContextValue>(
    () => ({
      colorScheme,
      colors: colorScheme === 'dark' ? darkColors : lightColors,
      isDark: colorScheme === 'dark',
    }),
    [colorScheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
