import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
import { colorScheme as nativeWindColorScheme } from 'nativewind';
import {
  darkColors,
  lightColors,
  type ColorScheme,
  type ThemeColors,
} from '@/theme/tokens/colors';
import {
  getStoredThemePreference,
  setStoredThemePreference,
} from '@/theme/storage';
import { type ThemePreference } from '@/theme/themePreference';

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => Promise<void>;
  colorScheme: ColorScheme;
  colors: ThemeColors;
  isDark: boolean;
  isReady: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

type ThemeProviderProps = {
  children: ReactNode;
};

function resolveColorScheme(
  preference: ThemePreference,
  systemScheme: string | null | undefined,
): ColorScheme {
  if (preference === 'light' || preference === 'dark') {
    return preference;
  }
  return systemScheme === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const systemScheme = useSystemColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getStoredThemePreference().then((stored) => {
      if (cancelled) {
        return;
      }
      if (stored) {
        setPreferenceState(stored);
        nativeWindColorScheme.set(stored);
      } else {
        nativeWindColorScheme.set('system');
      }
      setIsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const colorScheme = resolveColorScheme(preference, systemScheme);

  useEffect(() => {
    if (!isReady) {
      return;
    }
    nativeWindColorScheme.set(preference === 'system' ? 'system' : preference);
  }, [preference, isReady]);

  const setPreference = useCallback(async (next: ThemePreference) => {
    setPreferenceState(next);
    nativeWindColorScheme.set(next === 'system' ? 'system' : next);
    await setStoredThemePreference(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      setPreference,
      colorScheme,
      colors: colorScheme === 'dark' ? darkColors : lightColors,
      isDark: colorScheme === 'dark',
      isReady,
    }),
    [preference, setPreference, colorScheme, isReady],
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
