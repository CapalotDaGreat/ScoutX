import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { View } from 'react-native';
import { useColorScheme as useSystemColorScheme } from 'react-native';
import { colorScheme as nativeWindColorScheme, vars } from 'nativewind';
import {
  darkColors,
  lightColors,
  type ColorScheme,
  type ThemeColors,
} from '@/theme/tokens/colors';
import { themeColorsToCssVars } from '@/theme/cssVariables';
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
  const colors = colorScheme === 'dark' ? darkColors : lightColors;

  useEffect(() => {
    if (!isReady) {
      return;
    }
    // Drive NativeWind `dark:` variants; CSS custom properties come from `vars()` below.
    nativeWindColorScheme.set(preference === 'system' ? 'system' : preference);
  }, [preference, isReady, colorScheme]);

  const setPreference = useCallback(async (next: ThemePreference) => {
    setPreferenceState(next);
    nativeWindColorScheme.set(next === 'system' ? 'system' : next);
    await setStoredThemePreference(next);
  }, []);

  const cssVars = useMemo(() => vars(themeColorsToCssVars(colors)), [colors]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      setPreference,
      colorScheme,
      colors,
      isDark: colorScheme === 'dark',
      isReady,
    }),
    [preference, setPreference, colorScheme, colors, isReady],
  );

  return (
    <ThemeContext.Provider value={value}>
      <View style={cssVars} className="flex-1 bg-background">
        {children}
      </View>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
