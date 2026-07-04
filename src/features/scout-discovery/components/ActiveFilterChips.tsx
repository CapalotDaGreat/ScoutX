import { ScrollView, View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { buildFilterChips, removeFilterChip } from '@/features/scout-discovery/services/discoveryFilterChips';
import { type DiscoveryFilters } from '@/features/scout-discovery/types';
import { X } from 'lucide-react-native';
import { useTheme } from '@/theme';

export type ActiveFilterChipsProps = {
  filters: DiscoveryFilters;
  onChange: (filters: DiscoveryFilters) => void;
  onClearAll: () => void;
};

export function ActiveFilterChips({ filters, onChange, onClearAll }: ActiveFilterChipsProps) {
  const { colors } = useTheme();
  const chips = buildFilterChips(filters);

  if (chips.length === 0) {
    return null;
  }

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text variant="label" color="secondary">
          Active filters
        </Text>
        <Button variant="link" size="sm" onPress={onClearAll}>
          Clear all
        </Button>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2 pr-4">
          {chips.map((chip) => (
            <Button
              key={chip.id}
              variant="secondary"
              size="sm"
              className="rounded-full"
              rightIcon={<X size={14} color={colors.textSecondary} />}
              onPress={() => onChange(removeFilterChip(filters, chip))}
            >
              {chip.label}
            </Button>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
