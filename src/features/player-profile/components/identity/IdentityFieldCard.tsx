import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { cn } from '@/utils/cn';

export type IdentityFieldCardProps = {
  label: string;
  value: string;
  className?: string;
};

export function IdentityFieldCard({ label, value, className }: IdentityFieldCardProps) {
  return (
    <View
      accessibilityLabel={`${label}: ${value}`}
      className={cn(
        'min-w-[45%] flex-1 gap-1 rounded-xl border border-border bg-background-secondary/70 px-4 py-3',
        className,
      )}
    >
      <Text variant="caption" color="secondary" className="uppercase tracking-wider">
        {label}
      </Text>
      <Text variant="body" className="font-sans-medium">
        {value}
      </Text>
    </View>
  );
}
