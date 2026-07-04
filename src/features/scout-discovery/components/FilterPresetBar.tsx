import { ScrollView, View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { type FilterPreset } from '@/features/scout-discovery/types';

export type FilterPresetBarProps = {
  presets: FilterPreset[];
  activePresetId?: string | null;
  onApplyPreset: (preset: FilterPreset) => void;
  onSaveCurrent?: () => void;
};

export function FilterPresetBar({
  presets,
  activePresetId,
  onApplyPreset,
  onSaveCurrent,
}: FilterPresetBarProps) {
  if (presets.length === 0 && !onSaveCurrent) {
    return null;
  }

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text variant="label" color="secondary">
          Saved presets
        </Text>
        {onSaveCurrent ? (
          <Button variant="link" size="sm" onPress={onSaveCurrent}>
            Save current
          </Button>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2 pr-4">
          {presets.map((preset) => (
            <Button
              key={preset.id}
              variant={activePresetId === preset.id ? 'accent' : 'secondary'}
              size="sm"
              className="rounded-full"
              onPress={() => onApplyPreset(preset)}
            >
              {preset.name}
            </Button>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
