import { ActivityIndicator, View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';
import i18n from '@/i18n';

export type LoadingScreenProps = {
  message?: string;
  className?: string;
};

export function LoadingScreen({
  message,
  className,
}: LoadingScreenProps) {
  const { colors } = useTheme();
  const resolvedMessage =
    message ?? (i18n.isInitialized ? i18n.t('common:loading') : 'Loading…');

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={resolvedMessage}
      accessibilityLiveRegion="polite"
      className={cn('flex-1 items-center justify-center px-6 py-12', className)}
    >
      <ActivityIndicator size="large" color={colors.accent} />
      <Text variant="body-sm" color="secondary" className="mt-4">
        {resolvedMessage}
      </Text>
    </View>
  );
}
