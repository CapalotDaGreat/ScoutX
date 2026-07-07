import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18N_STORAGE_KEY } from '@/i18n/config';

export async function getStoredLanguage(): Promise<string | null> {
  return AsyncStorage.getItem(I18N_STORAGE_KEY);
}

export async function setStoredLanguage(language: string): Promise<void> {
  await AsyncStorage.setItem(I18N_STORAGE_KEY, language);
}

export async function clearStoredLanguage(): Promise<void> {
  await AsyncStorage.removeItem(I18N_STORAGE_KEY);
}
