import { useCallback, useEffect, useState } from 'react';
import * as Localization from 'expo-localization';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { changeAppLanguage, useDeviceLanguage } from '@/i18n';
import { SUPPORTED_LANGUAGES, type SupportedLanguageCode } from '@/i18n/config';
import { getStoredLanguage } from '@/i18n/storage';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export function LanguageSettingsSection() {
  const { t } = useAppTranslation('settings');
  const [manualLanguage, setManualLanguage] = useState<SupportedLanguageCode | null>(null);
  const [isAutomatic, setIsAutomatic] = useState(true);

  useEffect(() => {
    void getStoredLanguage().then((stored) => {
      if (stored) {
        setManualLanguage(stored as SupportedLanguageCode);
        setIsAutomatic(false);
      } else {
        setManualLanguage(null);
        setIsAutomatic(true);
      }
    });
  }, []);

  const handleAutomatic = useCallback(async () => {
    const deviceLocale = Localization.getLocales()[0]?.languageCode ?? 'en';
    await useDeviceLanguage(deviceLocale);
    setIsAutomatic(true);
    setManualLanguage(null);
  }, []);

  const handleSelect = useCallback(async (code: SupportedLanguageCode) => {
    await changeAppLanguage(code);
    setManualLanguage(code);
    setIsAutomatic(false);
  }, []);

  return (
    <View className="gap-3">
      <Text variant="body-sm" color="secondary">
        {t('languageDescription')}
      </Text>

      <Pressable
        onPress={() => void handleAutomatic()}
        accessibilityRole="radio"
        accessibilityState={{ checked: isAutomatic }}
        className={`rounded-xl border px-4 py-3 ${
          isAutomatic ? 'border-accent bg-accent-muted' : 'border-border'
        }`}
      >
        <Text weight="semibold">{t('languageAutomatic')}</Text>
      </Pressable>

      <View className="gap-2">
        {SUPPORTED_LANGUAGES.map((language) => {
          const selected = !isAutomatic && manualLanguage === language.code;
          return (
            <Pressable
              key={language.code}
              onPress={() => void handleSelect(language.code)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              className={`rounded-xl border px-4 py-3 ${
                selected ? 'border-accent bg-accent-muted' : 'border-border'
              }`}
            >
              <Text weight="semibold">{language.nativeLabel}</Text>
              <Text variant="caption" color="secondary">
                {language.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
