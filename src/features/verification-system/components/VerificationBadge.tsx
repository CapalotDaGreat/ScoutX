import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { type VerificationBadgeLevel } from '@/features/verification-system/types';
import { resolveVerificationBadgeLabel } from '@/features/verification-system/services/verificationService';

export type VerificationBadgeProps = {
  level: VerificationBadgeLevel;
};

export function VerificationBadge({ level }: VerificationBadgeProps) {
  const label = resolveVerificationBadgeLabel(level);
  if (!label) {
    return null;
  }

  const tone =
    level === 'verified'
      ? 'bg-green-100 text-green-800 dark:bg-green-950'
      : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200';

  return (
    <View className={`self-start rounded-full px-2 py-0.5 ${tone}`}>
      <Text variant="caption" className="font-sans-medium">
        {label}
      </Text>
    </View>
  );
}
