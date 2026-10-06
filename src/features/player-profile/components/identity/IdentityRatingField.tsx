import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { StarRating } from '@/components/primitives/StarRating';

export type IdentityRatingFieldProps = {
  label: string;
  value: number | null;
  emptyLabel: string;
};

export function IdentityRatingField({ label, value, emptyLabel }: IdentityRatingFieldProps) {
  return (
    <View className="gap-2 rounded-xl border border-border bg-background-secondary/70 px-4 py-3">
      <Text variant="caption" color="secondary" className="uppercase tracking-wider">
        {label}
      </Text>
      <StarRating value={value} size="md" label={label} emptyLabel={emptyLabel} />
    </View>
  );
}
