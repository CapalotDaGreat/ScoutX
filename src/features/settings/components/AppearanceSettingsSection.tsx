import { Pressable, View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { useTheme, type ThemePreference } from '@/theme';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { cn } from '@/utils/cn';
import { lightColors, darkColors } from '@/theme/tokens/colors';

const OPTIONS: Array<{
  value: ThemePreference;
  labelKey: 'appearanceSystem' | 'appearanceLight' | 'appearanceDark';
  swatchLight: string;
  swatchDark: string;
}> = [
  {
    value: 'system',
    labelKey: 'appearanceSystem',
    swatchLight: lightColors.surface,
    swatchDark: darkColors.surface,
  },
  {
    value: 'light',
    labelKey: 'appearanceLight',
    swatchLight: lightColors.surface,
    swatchDark: lightColors.backgroundSecondary,
  },
  {
    value: 'dark',
    labelKey: 'appearanceDark',
    swatchLight: darkColors.surface,
    swatchDark: darkColors.backgroundSecondary,
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
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => void setPreference(option.value)}
              className={cn(
                'min-h-[48px] flex-row items-center gap-3 rounded-lg border px-3 py-3',
                selected ? 'border-accent bg-accent-muted' : 'border-border bg-surface',
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
                  style={{ backgroundColor: colors.accent }}
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
