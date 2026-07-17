import { ScrollView, View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { SORT_OPTIONS } from '@/features/scout-discovery/constants';
import { type DiscoverySortOption } from '@/features/scout-discovery/types';
import { cn } from '@/utils/cn';

export type DiscoverySortBarProps = {
  sort: DiscoverySortOption;
  onSortChange: (sort: DiscoverySortOption) => void;
};

export function DiscoverySortBar({ sort, onSortChange }: DiscoverySortBarProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
      <View className="flex-row gap-2 pr-4">
        {SORT_OPTIONS.map((option) => (
          <Button
            key={option.value}
            variant={sort === option.value ? 'accent' : 'secondary'}
            size="sm"
            onPress={() => onSortChange(option.value)}
            className={cn('rounded-full')}
          >
            {option.label}
          </Button>
        ))}
      </View>
    </ScrollView>
  );
}
