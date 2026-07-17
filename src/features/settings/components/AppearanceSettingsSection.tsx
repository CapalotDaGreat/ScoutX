import { Pressable, View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { useTheme, type ThemePreference } from '@/theme';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { cn } from '@/utils/cn';

const OPTIONS: Array<{
  value: ThemePreference;
  labelKey: 'appearanceSystem' | 'appearanceLight' | 'appearanceDark';
  swatchLight: string;
  swatchDark: string;
}> = [
  {
    value: 'system',
    labelKey: 'appearanceSystem',
    swatchLight: '#F3EFE8',
    swatchDark: '#161412',
  },
  {
    value: 'light',
    labelKey: 'appearanceLight',
    swatchLight: '#F3EFE8',
    swatchDark: '#F3EFE8',
  },
  {
    value: 'dark',
    labelKey: 'appearanceDark',
    swatchLight: '#161412',
    swatchDark: '#161412',
  },
];

export function AppearanceSettingsSection() {
  const { t } = useAppTranslation('settings');
  const { preference, setPreference, colors } = useTheme();

  return (
    <View className="gap-4">
      <Text variant="body-sm" color="secondary">
        {t('appearanceDescription')}
      </Text>

      <View className="gap-2.5">
        {OPTIONS.map((option) => {
          const selected = preference === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => void setPreference(option.value)}
              className={cn(
                'min-h-[52px] flex-row items-center gap-3 rounded-2xl border px-4 py-3.5',
                selected ? 'border-gold bg-gold-muted' : 'border-border bg-surface',
              )}
            >
              <View className="flex-row overflow-hidden rounded-full border border-border">
                <View
                  style={{ width: 18, height: 18, backgroundColor: option.swatchLight }}
                />
                <View
                  style={{ width: 18, height: 18, backgroundColor: option.swatchDark }}
                />
              </View>
              <Text weight="semibold" className="flex-1">
                {t(option.labelKey)}
              </Text>
              {selected ? (
                <View
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: colors.gold }}
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
