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
        'min-w-[45%] flex-1 gap-1 border-b border-border py-3 pr-3',
        className,
      )}
    >
      <Text variant="caption" color="secondary" style={{ letterSpacing: 0 }}>
        {label}
      </Text>
      <Text variant="body" className="font-sans-medium">
        {value}
      </Text>
    </View>
  );
}
