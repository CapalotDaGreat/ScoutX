import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  THEME_STORAGE_KEY,
  type ThemePreference,
  isThemePreference,
} from '@/theme/themePreference';

export async function getStoredThemePreference(): Promise<ThemePreference | null> {
  const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
  return isThemePreference(stored) ? stored : null;
}

export async function setStoredThemePreference(
  preference: ThemePreference,
): Promise<void> {
  if (preference === 'system') {
    await AsyncStorage.removeItem(THEME_STORAGE_KEY);
    return;
  }
  await AsyncStorage.setItem(THEME_STORAGE_KEY, preference);
}
