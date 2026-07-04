import { Pressable, View } from 'react-native';
import { cn } from '@/utils/cn';
import { Bookmark, FileText, GitCompare } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { triggerHaptic } from '@/utils/haptics';

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
              ? 'Remove from comparison'
              : canAddToComparison
                ? 'Add to comparison'
                : 'Comparison full'
          }
          onPress={handleCompare}
          disabled={!isInComparison && !canAddToComparison}
          className={cn(
            'h-9 w-9 items-center justify-center rounded-full border',
            isInComparison
              ? 'border-accent bg-accent-muted dark:border-green-500 dark:bg-green-950'
              : 'border-border bg-surface dark:border-neutral-700 dark:bg-neutral-900',
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
          accessibilityLabel={isFavourite ? 'Remove from saved' : 'Save player'}
          onPress={handleFavourite}
          className={cn(
            'h-9 w-9 items-center justify-center rounded-full border',
            isFavourite
              ? 'border-accent bg-accent-muted dark:border-green-500 dark:bg-green-950'
              : 'border-border bg-surface dark:border-neutral-700 dark:bg-neutral-900',
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
          accessibilityLabel="Open scouting report"
          onPress={onOpenReport}
          className="h-9 w-9 items-center justify-center rounded-full border border-border bg-surface dark:border-neutral-700 dark:bg-neutral-900"
        >
          <FileText size={16} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}
