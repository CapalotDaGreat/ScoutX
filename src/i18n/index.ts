import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  NAMESPACES,
  type SupportedLanguageCode,
} from '@/i18n/config';
import { resources } from '@/i18n/resources';
import { clearStoredLanguage, getStoredLanguage, setStoredLanguage } from '@/i18n/storage';

export async function resolveInitialLanguage(deviceLanguageCode: string): Promise<SupportedLanguageCode> {
  const stored = await getStoredLanguage();
  if (stored && isSupportedLanguage(stored)) {
    return stored;
  }

  const normalized = deviceLanguageCode.split('-')[0]?.toLowerCase() ?? DEFAULT_LANGUAGE;
  if (isSupportedLanguage(normalized)) {
    return normalized;
  }

  return DEFAULT_LANGUAGE;
}

export async function initI18n(language: SupportedLanguageCode): Promise<typeof i18n> {
  if (i18n.isInitialized) {
    if (i18n.language !== language) {
      await i18n.changeLanguage(language);
    }
    return i18n;
  }

  await i18n.use(initReactI18next).init({
    resources,
    lng: language,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: Object.keys(resources),
    ns: [...NAMESPACES],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
    returnEmptyString: false,
    react: {
      useSuspense: false,
    },
    compatibilityJSON: 'v4',
  });

  return i18n;
}

export async function changeAppLanguage(language: SupportedLanguageCode): Promise<void> {
  await setStoredLanguage(language);
  await i18n.changeLanguage(language);
}

export async function useDeviceLanguage(deviceLanguageCode: string): Promise<void> {
  await clearStoredLanguage();
  const normalized = deviceLanguageCode.split('-')[0]?.toLowerCase() ?? DEFAULT_LANGUAGE;
  const language = isSupportedLanguage(normalized) ? normalized : DEFAULT_LANGUAGE;
  await i18n.changeLanguage(language);
}

export { i18n };
export default i18n;
