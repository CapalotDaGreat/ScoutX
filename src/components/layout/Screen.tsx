import { type ReactNode } from 'react';
import {
  RefreshControl,
  ScrollView,
  View,
  type ScrollViewProps,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { Button } from '@/components/primitives/Button';
import { LoadingScreen } from '@/components/feedback/LoadingScreen';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';
import { WifiOff, AlertCircle } from 'lucide-react-native';

export type ScreenProps = ScrollViewProps & {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  header?: ReactNode;
  footer?: ReactNode;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  offline?: boolean;
  onRetry?: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  scrollable?: boolean;
  padded?: boolean;
  safeArea?: boolean;
  loadingComponent?: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function Screen({
  children,
  title,
  subtitle,
  header,
  footer,
  loading = false,
  error = null,
  empty = false,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyActionLabel,
  onEmptyAction,
  offline = false,
  onRetry,
  refreshing = false,
  onRefresh,
  scrollable = true,
  padded = true,
  safeArea = true,
  loadingComponent,
  className,
  contentClassName,
  ...scrollProps
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const renderContent = () => {
    if (loading) {
      return loadingComponent ?? <LoadingScreen />;
    }

    if (error) {
      return (
        <View className="flex-1 items-center justify-center px-6 py-12">
          <AlertCircle size={48} color={colors.error} strokeWidth={1.5} />
          <Heading level={3} className="mt-6 text-center">
            Something went wrong
          </Heading>
          <Text variant="body-sm" color="secondary" className="mt-2 text-center">
            {error}
          </Text>
          {onRetry ? (
            <Button variant="secondary" className="mt-6" onPress={onRetry}>
              Try Again
            </Button>
          ) : null}
        </View>
      );
    }

    if (empty) {
      return (
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          actionLabel={emptyActionLabel}
          onAction={onEmptyAction}
        />
      );
    }

    return children;
  };

  const body = (
    <>
      {offline ? (
        <View
          accessibilityRole="alert"
          className="flex-row items-center justify-center gap-2 bg-warning-muted px-4 py-2 dark:bg-yellow-950"
        >
          <WifiOff size={14} color={colors.warning} strokeWidth={2} />
          <Text variant="caption" className="font-sans-medium text-warning dark:text-yellow-400">
            You&apos;re offline
          </Text>
        </View>
      ) : null}

      {header ??
        (title ? (
          <View className={cn('mb-6', padded && 'px-4')}>
            <Heading level={1}>{title}</Heading>
            {subtitle ? (
              <Text variant="body-sm" color="secondary" className="mt-1">
                {subtitle}
              </Text>
            ) : null}
          </View>
        ) : null)}

      <View className={cn('flex-1', padded && 'px-4', contentClassName)}>
        {renderContent()}
      </View>

      {footer ? (
        <View
          className="border-t border-divider bg-surface px-4 pt-4 dark:border-neutral-800 dark:bg-neutral-900"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          {footer}
        </View>
      ) : null}
    </>
  );

  const Container = safeArea ? SafeAreaView : View;

  if (!scrollable) {
    return (
      <Container className={cn('flex-1 bg-background dark:bg-neutral-950', className)}>
        {body}
      </Container>
    );
  }

  return (
    <Container className={cn('flex-1 bg-background dark:bg-neutral-950', className)}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 16 }}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          ) : undefined
        }
        {...scrollProps}
      >
        {body}
      </ScrollView>
    </Container>
  );
}
