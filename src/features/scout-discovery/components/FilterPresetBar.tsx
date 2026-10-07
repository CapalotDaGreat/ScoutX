import { Pressable, ScrollView, View } from 'react-native';
import { X } from 'lucide-react-native';
import { Text } from '@/components/primitives/Text';
import { type FilterPreset } from '@/features/scout-discovery/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';

const BUILT_IN_PRESETS = ['preset-u21-potential', 'preset-verified-wingers', 'preset-available-now'] as const;
type BuiltInPresetId = (typeof BUILT_IN_PRESETS)[number];

function isBuiltInPreset(id: string): id is BuiltInPresetId {
  return (BUILT_IN_PRESETS as readonly string[]).includes(id);
}

export type FilterPresetBarProps = {
  presets: FilterPreset[];
  activePresetId?: string | null;
  onApplyPreset: (preset: FilterPreset) => void;
  onSaveCurrent?: () => void;
  onRemovePreset?: (presetId: string) => void;
};

export function FilterPresetBar({
  presets,
  activePresetId,
  onApplyPreset,
  onSaveCurrent,
  onRemovePreset,
}: FilterPresetBarProps) {
  const { t } = useAppTranslation(['scout']);
  const { colors } = useTheme();

  if (presets.length === 0 && !onSaveCurrent) {
    return null;
  }

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text variant="label" color="secondary">
          {t('scout:search.savedFilters')}
        </Text>
        {onSaveCurrent ? (
          <Pressable accessibilityRole="button" onPress={onSaveCurrent} hitSlop={8}>
            <Text variant="label" color="prestige">
              {t('scout:search.saveCurrent')}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row items-center gap-2 pr-4">
          {presets.map((preset) => {
            const isActive = activePresetId === preset.id;
            const isCustom = preset.id.startsWith('preset-custom-');
            const name = isBuiltInPreset(preset.id) ? t(`scout:search.presets.${preset.id}`) : preset.name;
            return (
              <View
                key={preset.id}
                className={cn(
                  'flex-row items-center gap-1 rounded-full border px-3 py-2',
                  isActive
                    ? 'border-gold bg-gold'
                    : 'border-border bg-surface',
                )}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  onPress={() => onApplyPreset(preset)}
                  hitSlop={4}
                >
                  <Text
                    variant="body-sm"
                    color={isActive ? 'onGold' : 'primary'}
                    weight={isActive ? 'semibold' : 'regular'}
                  >
                    {name}
                  </Text>
                </Pressable>
                {isCustom && onRemovePreset ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('scout:search.deleteFilter', { name })}
                    hitSlop={8}
                    onPress={() => onRemovePreset(preset.id)}
                    className="ml-0.5 h-5 w-5 items-center justify-center rounded-full bg-black/10"
                  >
                    <X
                      size={12}
                      color={isActive ? colors.goldForeground : colors.textSecondary}
                      strokeWidth={2.5}
                    />
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
