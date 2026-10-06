import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { ProgressBar } from '@/components/primitives/ProgressBar';

export type IdentityRatingFieldProps = {
  label: string;
  value: number | null;
  emptyLabel: string;
  max?: number;
};

export function IdentityRatingField({ label, value, emptyLabel, max = 5 }: IdentityRatingFieldProps) {
  return (
    <View className="gap-2 rounded-xl border border-border bg-background-secondary/70 px-4 py-3">
      <View className="flex-row items-center justify-between">
        <Text variant="caption" color="secondary" className="uppercase tracking-wider">
          {label}
        </Text>
        <Text variant="body-sm" weight="semibold" color={value === null ? 'tertiary' : undefined}>
          {value === null ? emptyLabel : `${value}/${max}`}
        </Text>
      </View>
      {value === null ? null : (
        <ProgressBar value={(value / max) * 100} max={100} size="sm" variant="progress" />
      )}
    </View>
  );
}
