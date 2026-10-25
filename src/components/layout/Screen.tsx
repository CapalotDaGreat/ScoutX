import { type ReactNode } from 'react';
import {
  RefreshControl,
  ScrollView,
  View,
  type ScrollViewProps,
} from 'react-native';
import { useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';
import { getSafeAreaPadding } from '@/components/layout/AppSafeAreaView';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { Button } from '@/components/primitives/Button';
import { LoadingScreen } from '@/components/feedback/LoadingScreen';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useTheme } from '@/theme';
import { cn } from '@/utils/cn';
import { WifiOff, AlertCircle } from 'lucide-react-native';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

export type ScreenProps = ScrollViewProps & {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  /**
   * Full custom header row. Prefer `headerLeading` + `headerActions` when you
   * still want the screen title visible.
   */
  header?: ReactNode;
  /** Leading control (e.g. Back) composed beside the title. */
  headerLeading?: ReactNode;
  /** Trailing actions (e.g. Activity / Settings) composed beside the title. */
  headerActions?: ReactNode;
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
  safeAreaEdges?: Edge[];
  embeddedInTabShell?: boolean;
  /**
   * Extra bottom padding for the scroll content so sticky overlays (action
   * bars, FABs) rendered as siblings don't cover the last content.
   */
  contentBottomInset?: number;
  loadingComponent?: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function Screen({
  children,
  title,
  subtitle,
  header,
  headerLeading,
  headerActions,
  footer,
  loading = false,
  error = null,
  empty = false,
  emptyTitle,
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
  safeAreaEdges,
  embeddedInTabShell = false,
  contentBottomInset = 0,
  loadingComponent,
  className,
  contentClassName,
  ...scrollProps
}: ScreenProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation('common');
  const { isOffline } = useNetworkStatus();
  const insets = useSafeAreaInsets();
  const resolvedEmptyTitle = emptyTitle ?? t('emptyTitle');
  const resolvedSafeAreaEdges: Edge[] =
    safeAreaEdges ?? (embeddedInTabShell ? ['top', 'left', 'right'] : ['top', 'bottom', 'left', 'right']);
  const scrollBottomPadding =
    (embeddedInTabShell ? 24 : insets.bottom + 24) + contentBottomInset;
  const hasComposedHeader = Boolean(title || headerLeading || headerActions);
  const hasHeaderChrome = Boolean(header || hasComposedHeader);

  const renderContent = () => {
    if (loading) {
      return loadingComponent ?? <LoadingScreen />;
    }

    if (error) {
      return (
        <View className="flex-1 items-center justify-center px-6 py-12">
          <AlertCircle size={48} color={colors.error} strokeWidth={1.5} />
          <Heading level={3} className="mt-6 text-center">
            {t('errorTitle')}
          </Heading>
          <Text variant="body-sm" color="secondary" className="mt-2 text-center">
            {error}
          </Text>
          {onRetry ? (
            <Button variant="secondary" className="mt-6" onPress={onRetry} accessibilityLabel={t('retry')}>
              {t('retry')}
            </Button>
          ) : null}
        </View>
      );
    }

    if (empty) {
      return (
        <EmptyState
          title={resolvedEmptyTitle}
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
      {offline || isOffline ? (
        <View
          accessibilityRole="alert"
          className="flex-row items-center justify-center gap-2 bg-warning-muted px-5 py-2.5"
        >
          <WifiOff size={14} color={colors.warning} strokeWidth={2} />
          <Text variant="caption" className="font-sans-medium text-warning">
            {t('common:offlineDrafts')}
          </Text>
        </View>
      ) : null}

      {hasHeaderChrome ? (
        <View className={cn('mb-5 overflow-visible border-b border-divider pb-4', padded && 'px-5')}>
          {header ? (
            <View className="overflow-visible">{header}</View>
          ) : (
            <View className="flex-row items-start gap-3 overflow-visible">
              {headerLeading ? (
                <View className="shrink-0 overflow-visible pt-0.5">{headerLeading}</View>
              ) : null}
              {title || subtitle ? (
                <View className="min-w-0 flex-1">
                  {title ? <Heading level={1}>{title}</Heading> : null}
                  {subtitle ? (
                    <Text variant="body-sm" color="secondary" className="mt-1.5 leading-5">
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <View className="min-w-0 flex-1" />
              )}
              {headerActions ? (
                <View className="shrink-0 flex-row items-center gap-2.5 overflow-visible pt-0.5 pr-1">
                  {headerActions}
                </View>
              ) : null}
            </View>
          )}
        </View>
      ) : null}

      <View className={cn('flex-1', padded && 'px-5', contentClassName)}>
        {renderContent()}
      </View>

      {footer ? (
        <View
          className="border-t border-divider bg-background px-5 pt-4"
          style={{
            backgroundColor: colors.background,
            paddingBottom: Math.max(insets.bottom, 16),
          }}
        >
          {footer}
        </View>
      ) : null}
    </>
  );

  const safeAreaStyle = safeArea ? getSafeAreaPadding(insets, resolvedSafeAreaEdges) : undefined;

  const rootStyle = [
    { backgroundColor: colors.background },
    safeAreaStyle,
  ];

  if (!scrollable) {
    return (
      <View
        className={cn('flex-1 bg-background', className)}
        style={rootStyle}
      >
        {body}
      </View>
    );
  }

  return (
    <View
      className={cn('flex-1 bg-background', className)}
      style={rootStyle}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: scrollBottomPadding }}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.gold}
              colors={[colors.gold, colors.accent]}
            />
          ) : undefined
        }
        {...scrollProps}
      >
        {body}
      </ScrollView>
    </View>
  );
}
