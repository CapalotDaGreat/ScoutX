import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { ProgressBar } from '@/components/primitives/ProgressBar';

export type IdentityRatingFieldProps = {
  label: string;
  value: number;
  max?: number;
};

export function IdentityRatingField({ label, value, max = 5 }: IdentityRatingFieldProps) {
  const percentage = (value / max) * 100;

  return (
    <View className="gap-2 rounded-xl border border-border bg-background-secondary/70 px-4 py-3">
      <View className="flex-row items-center justify-between">
        <Text variant="caption" color="secondary" className="uppercase tracking-wider">
          {label}
        </Text>
        <Text variant="body-sm" weight="semibold">
          {value}/{max}
        </Text>
      </View>
      <ProgressBar value={percentage} max={100} size="sm" />
    </View>
  );
}
