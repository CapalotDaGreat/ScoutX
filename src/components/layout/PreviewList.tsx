import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type PreviewListProps<T> = {
  items: T[];
  /** How many items to show before expand / View all. Default 4. */
  previewCount?: number;
  keyExtractor: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  /**
   * When provided, the CTA navigates / opens a destination instead of
   * expanding inline. All items remain available via that path.
   */
  onViewAllPress?: () => void;
  viewAllLabel?: string;
  showMoreLabel?: string;
  showLessLabel?: string;
  empty?: ReactNode;
  className?: string;
};

/**
 * Progressive disclosure for lists: show a calm preview, then expand or
 * navigate to the full set. Never removes data — only defers it.
 */
export function PreviewList<T>({
  items,
  previewCount = 4,
  keyExtractor,
  renderItem,
  onViewAllPress,
  viewAllLabel,
  showMoreLabel,
  showLessLabel,
  empty,
  className,
}: PreviewListProps<T>) {
  const { t } = useAppTranslation('common');
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) {
    return empty ? <View className={className}>{empty}</View> : null;
  }

  const needsDisclosure = items.length > previewCount;
  const displayItems =
    onViewAllPress || !expanded
      ? items.slice(0, previewCount)
      : items;
  const remaining = Math.max(0, items.length - previewCount);

  return (
    <View className={className}>
      <View className="gap-3">
        {displayItems.map((item, index) => (
          <View key={keyExtractor(item, index)}>{renderItem(item, index)}</View>
        ))}
      </View>

      {needsDisclosure ? (
        <View className="mt-3">
          {onViewAllPress ? (
            <Button variant="ghost" size="sm" onPress={onViewAllPress} className="self-start">
              {(viewAllLabel ?? t('viewAll')) + (remaining > 0 ? ` · ${items.length}` : '')}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onPress={() => setExpanded((current) => !current)}
              className="self-start"
            >
              {expanded
                ? (showLessLabel ?? 'Show less')
                : `${showMoreLabel ?? t('seeMore')}${remaining > 0 ? ` · ${remaining}` : ''}`}
            </Button>
          )}
        </View>
      ) : null}
    </View>
  );
}

export type SectionHeaderRowProps = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onActionPress?: () => void;
};

/** Compact section title + optional View all action. */
export function SectionHeaderRow({
  title,
  subtitle,
  actionLabel,
  onActionPress,
}: SectionHeaderRowProps) {
  const { t } = useAppTranslation('common');

  return (
    <View className="mb-3 flex-row items-start justify-between gap-3">
      <View className="min-w-0 flex-1">
        <Text weight="semibold">{title}</Text>
        {subtitle ? (
          <Text variant="caption" color="secondary" className="mt-0.5">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {onActionPress ? (
        <Button variant="ghost" size="sm" onPress={onActionPress}>
          {actionLabel ?? t('viewAll')}
        </Button>
      ) : null}
    </View>
  );
}
