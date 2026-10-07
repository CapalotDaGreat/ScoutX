import { ScrollView, View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { SORT_OPTIONS } from '@/features/scout-discovery/constants';
import { type DiscoverySortOption } from '@/features/scout-discovery/types';
import { cn } from '@/utils/cn';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type DiscoverySortBarProps = {
  sort: DiscoverySortOption;
  onSortChange: (sort: DiscoverySortOption) => void;
};

export function DiscoverySortBar({ sort, onSortChange }: DiscoverySortBarProps) {
  const { t } = useAppTranslation('scout');
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
      <View className="flex-row gap-2 pr-4">
        {SORT_OPTIONS.map((option) => (
          <Button
            key={option}
            variant={sort === option ? 'accent' : 'secondary'}
            accessibilityState={{ selected: sort === option }}
            size="sm"
            onPress={() => onSortChange(option)}
            className={cn('rounded-full')}
          >
            {t(`sort.${option}`)}
          </Button>
        ))}
      </View>
    </ScrollView>
  );
}
