import { View } from 'react-native';
import { Badge } from '@/components/primitives/Badge';
import { Text } from '@/components/primitives/Text';
import { type AiRecommendation } from '@/features/ai-insights/types';

export type AiRecommendationListProps = {
  items: AiRecommendation[];
  title?: string;
};

const priorityVariant = {
  low: 'default' as const,
  medium: 'warning' as const,
  high: 'success' as const,
};

export function AiRecommendationList({ items, title }: AiRecommendationListProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <View className="gap-2">
      {title ? (
        <Text variant="overline" color="secondary">
          {title}
        </Text>
      ) : null}
      {items.map((item) => (
        <View
          key={item.id}
          className="rounded-xl border border-border bg-background-secondary px-3 py-3"
        >
          <View className="mb-1 flex-row items-center justify-between gap-2">
            <Text variant="body-sm" className="flex-1 font-sans-semibold">
              {item.title}
            </Text>
            {item.priority ? (
              <Badge label={item.priority} variant={priorityVariant[item.priority]} size="sm" />
            ) : null}
          </View>
          <Text variant="caption" color="secondary">
            {item.description}
          </Text>
          {item.category ? (
            <Text variant="caption" color="secondary" className="mt-1 uppercase">
              {item.category}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
