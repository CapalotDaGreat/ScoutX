import { Pressable, View } from 'react-native';
import { Bookmark, FileText } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { triggerHaptic } from '@/utils/haptics';
import { cn } from '@/utils/cn';

export type PlayerQuickActionsProps = {
  isFavourite: boolean;
  onToggleFavourite: () => void;
  onOpenReport?: () => void;
  className?: string;
};

export function PlayerQuickActions({
  isFavourite,
  onToggleFavourite,
  onOpenReport,
  className,
}: PlayerQuickActionsProps) {
  const { colors } = useTheme();

  const handleFavourite = () => {
    void triggerHaptic('light');
    onToggleFavourite();
  };

  return (
    <View className={cn('flex-row gap-2', className)}>
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
