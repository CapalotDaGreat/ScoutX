import { ActivityIndicator, View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type LoadingScreenProps = {
  message?: string;
  className?: string;
};

export function LoadingScreen({
  message,
  className,
}: LoadingScreenProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation('common');
  const resolvedMessage = message ?? t('loading');

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
