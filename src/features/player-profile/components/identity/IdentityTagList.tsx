import { View } from 'react-native';
import { Badge } from '@/components/primitives/Badge';
import { Text } from '@/components/primitives/Text';

export type IdentityTagListProps = {
  label: string;
  values: string[];
  emptyLabel?: string;
};

export function IdentityTagList({ label, values, emptyLabel = 'Not set' }: IdentityTagListProps) {
  return (
    <View className="gap-2">
      <Text variant="caption" color="secondary" className="uppercase tracking-wider">
        {label}
      </Text>
      {values.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {values.map((value) => (
            <Badge key={value} label={value} variant="outline" size="sm" />
          ))}
        </View>
      ) : (
        <Text variant="body-sm" color="secondary">
          {emptyLabel}
        </Text>
      )}
    </View>
  );
}
