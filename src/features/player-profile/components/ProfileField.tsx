import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';

export type ProfileFieldProps = {
  label: string;
  value: string;
};

export function ProfileField({ label, value }: ProfileFieldProps) {
  return (
    <View className="flex-1 rounded-xl border border-border bg-background-secondary/70 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/80">
      <Text variant="caption" color="secondary" className="mb-1 uppercase tracking-wider">
        {label}
      </Text>
      <Text variant="body" className="font-sans-medium text-foreground dark:text-white">
        {value}
      </Text>
    </View>
  );
}
