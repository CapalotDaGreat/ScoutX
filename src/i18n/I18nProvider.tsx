import { useEffect, useState, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import * as Localization from 'expo-localization';
import { I18nManager } from 'react-native';
import i18n, { initI18n, resolveInitialLanguage } from '@/i18n';
import { isRtlLanguage } from '@/i18n/config';
import { LoadingScreen } from '@/components';

export type I18nProviderProps = {
  children: ReactNode;
};

export function I18nProvider({ children }: I18nProviderProps) {
  const [ready, setReady] = useState(i18n.isInitialized);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      if (!i18n.isInitialized) {
        const deviceLocale = Localization.getLocales()[0]?.languageCode ?? 'en';
        const language = await resolveInitialLanguage(deviceLocale);
        await initI18n(language);
      }

      if (mounted) {
        setReady(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const applyDirection = (language: string): void => {
      const rtl = isRtlLanguage(language as Parameters<typeof isRtlLanguage>[0]);
      if (I18nManager.isRTL !== rtl) {
        I18nManager.allowRTL(rtl);
        I18nManager.forceRTL(rtl);
      }
    };

    applyDirection(i18n.language);
    const handleLanguageChange = (language: string): void => {
      applyDirection(language);
    };

    i18n.on('languageChanged', handleLanguageChange);
    return () => {
      i18n.off('languageChanged', handleLanguageChange);
    };
  }, []);

  if (!ready) {
    return <LoadingScreen />;
  }

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
