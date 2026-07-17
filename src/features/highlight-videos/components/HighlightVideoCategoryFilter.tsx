import { ScrollView, Pressable } from 'react-native';
import { Text } from '@/components/primitives/Text';
import {
  VIDEO_CATEGORY_META,
  VIDEO_FILTER_ALL,
  type VideoCategoryFilter,
} from '@/features/highlight-videos/constants';
import { type VideoCategory } from '@/features/highlight-videos/types';
import { cn } from '@/utils/cn';

export type HighlightVideoCategoryFilterProps = {
  activeCategory: VideoCategoryFilter;
  availableCategories: VideoCategory[];
  onCategoryChange: (category: VideoCategoryFilter) => void;
};

export function HighlightVideoCategoryFilter({
  activeCategory,
  availableCategories,
  onCategoryChange,
}: HighlightVideoCategoryFilterProps) {
  const filters: Array<{ value: VideoCategoryFilter; label: string }> = [
    { value: VIDEO_FILTER_ALL, label: 'All' },
    ...availableCategories.map((category) => ({
      value: category,
      label: VIDEO_CATEGORY_META[category].label,
    })),
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2"
      className="-mx-1"
    >
      {filters.map((filter) => {
        const isActive = activeCategory === filter.value;
        return (
          <Pressable
            key={filter.value}
            onPress={() => onCategoryChange(filter.value)}
            className={cn(
              'rounded-full border px-3 py-1.5',
              isActive
                ? 'border-accent bg-accent-muted'
                : 'border-border bg-background-secondary/70',
            )}
          >
            <Text
              variant="caption"
              className={cn(
                'font-sans-semibold',
                isActive ? 'text-accent' : 'text-foreground-secondary',
              )}
            >
              {filter.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
