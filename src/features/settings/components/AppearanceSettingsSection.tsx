import { Pressable, View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { useTheme, type ThemePreference } from '@/theme';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

const OPTIONS: Array<{
  value: ThemePreference;
  labelKey: 'appearanceSystem' | 'appearanceLight' | 'appearanceDark';
}> = [
  { value: 'system', labelKey: 'appearanceSystem' },
  { value: 'light', labelKey: 'appearanceLight' },
  { value: 'dark', labelKey: 'appearanceDark' },
];

export function AppearanceSettingsSection() {
  const { t } = useAppTranslation('settings');
  const { preference, setPreference } = useTheme();

  return (
    <View className="gap-3">
      <Text variant="body-sm" color="secondary">
        {t('appearanceDescription')}
      </Text>

      <View className="gap-2">
        {OPTIONS.map((option) => {
          const selected = preference === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => void setPreference(option.value)}
              className={`rounded-xl border px-4 py-3 ${
                selected ? 'border-accent bg-accent-muted' : 'border-border'
              }`}
            >
              <Text weight="semibold">{t(option.labelKey)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
