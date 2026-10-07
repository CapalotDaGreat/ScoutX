import { ScrollView, View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { buildFilterChips, removeFilterChip } from '@/features/scout-discovery/services/discoveryFilterChips';
import {
  type DiscoveryFilters,
  type FilterChip,
  type PlayerAvailability,
  type PlayerPosition,
  type PreferredFoot,
} from '@/features/scout-discovery/types';
import { X } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type ActiveFilterChipsProps = {
  filters: DiscoveryFilters;
  onChange: (filters: DiscoveryFilters) => void;
  onClearAll: () => void;
};

const AVAILABILITY_KEY = { available: 'available', unavailable: 'unavailable', on_loan: 'onLoan' } as const;

export function ActiveFilterChips({ filters, onChange, onClearAll }: ActiveFilterChipsProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation('scout');
  const chips = buildFilterChips(filters);

  const chipLabel = (chip: FilterChip): string => {
    switch (chip.kind) {
      case 'ageRange':
        return t('chips.ageRange', { min: chip.value ?? '…', max: chip.max ?? '…' });
      case 'position':
        return t(`position.${chip.value as PlayerPosition}`);
      case 'foot':
        return t('chips.foot', { foot: t(`filters.${chip.value as PreferredFoot}`) });
      case 'overall':
        return t('chips.overall', { value: chip.value });
      case 'potential':
        return t('chips.potential', { value: chip.value });
      case 'availability':
        return t(`filters.${AVAILABILITY_KEY[chip.value as PlayerAvailability]}`);
      case 'verified':
        return t('chips.verified');
      case 'recentlyActive':
        return t('chips.recentlyActive');
      case 'hasVideos':
        return t('chips.hasVideos');
      case 'sprint':
        return t('chips.sprint', { value: chip.value });
      case 'raw':
        return String(chip.value ?? '');
    }
  };

  if (chips.length === 0) {
    return null;
  }

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text variant="label" color="secondary">
          {t('chips.active')}
        </Text>
        <Button variant="link" size="sm" onPress={onClearAll}>
          {t('chips.clearAll')}
        </Button>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2 pr-4">
          {chips.map((chip) => {
            const label = chipLabel(chip);
            return (
              <Button
                key={chip.id}
                variant="secondary"
                size="sm"
                className="rounded-full"
                accessibilityLabel={t('chips.remove', { label })}
                rightIcon={<X size={14} color={colors.textSecondary} />}
                onPress={() => onChange(removeFilterChip(filters, chip))}
              >
                {label}
              </Button>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
