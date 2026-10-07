import { Pressable, View } from 'react-native';
import { cn } from '@/utils/cn';
import { Bookmark, FileText, GitCompare } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { triggerHaptic } from '@/utils/haptics';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type PlayerQuickActionsProps = {
  isFavourite?: boolean;
  onToggleFavourite?: () => void;
  onOpenReport?: () => void;
  isInComparison?: boolean;
  canAddToComparison?: boolean;
  onToggleCompare?: () => void;
  className?: string;
};

export function PlayerQuickActions({
  isFavourite,
  onToggleFavourite,
  onOpenReport,
  isInComparison = false,
  canAddToComparison = true,
  onToggleCompare,
  className,
}: PlayerQuickActionsProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation('scout');

  const handleFavourite = () => {
    if (!onToggleFavourite) {
      return;
    }
    void triggerHaptic('light');
    onToggleFavourite();
  };

  const handleCompare = () => {
    if (!onToggleCompare) {
      return;
    }
    void triggerHaptic('light');
    onToggleCompare();
  };

  return (
    <View className={cn('flex-row gap-2', className)}>
      {onToggleCompare ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            isInComparison
              ? t('scout:a11y.removeCompare')
              : canAddToComparison
                ? t('scout:a11y.addCompare')
                : t('scout:a11y.compareFull')
          }
          accessibilityState={{ selected: isInComparison, disabled: !isInComparison && !canAddToComparison }}
          hitSlop={4}
          onPress={handleCompare}
          disabled={!isInComparison && !canAddToComparison}
          className={cn(
            'h-9 w-9 items-center justify-center rounded-full border',
            isInComparison
              ? 'border-accent bg-accent-muted'
              : 'border-border bg-surface',
            !isInComparison && !canAddToComparison && 'opacity-50',
          )}
        >
          <GitCompare
            size={16}
            color={isInComparison ? colors.accent : colors.textSecondary}
          />
        </Pressable>
      ) : null}
      {onToggleFavourite ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isFavourite ? t('scout:a11y.unsave') : t('scout:a11y.save')}
          accessibilityState={{ selected: Boolean(isFavourite) }}
          hitSlop={4}
          onPress={handleFavourite}
          className={cn(
            'h-9 w-9 items-center justify-center rounded-full border',
            isFavourite
              ? 'border-accent bg-accent-muted'
              : 'border-border bg-surface',
          )}
        >
          <Bookmark
            size={16}
            color={isFavourite ? colors.accent : colors.textSecondary}
            fill={isFavourite ? colors.accent : 'transparent'}
          />
        </Pressable>
      ) : null}
      {onOpenReport ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('scout:a11y.openReport')}
          hitSlop={4}
          onPress={onOpenReport}
          className="h-9 w-9 items-center justify-center rounded-full border border-border bg-surface"
        >
          <FileText size={16} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}
