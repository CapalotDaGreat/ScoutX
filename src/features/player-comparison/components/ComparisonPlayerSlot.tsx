import { Pressable, View } from 'react-native';
import { Image } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { COMPARISON_PLAYER_COLORS } from '@/features/player-comparison/constants';
import { formatRating, joinKnown } from '@/features/scout-discovery/models/DiscoverablePlayerModel';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';
import { cn } from '@/utils/cn';
import { ArrowLeftRight, Plus, X } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type ComparisonPlayerSlotProps = {
  player?: DiscoverablePlayer;
  slotIndex: number;
  onAdd?: () => void;
  onRemove?: () => void;
  onReplace?: () => void;
};

export function ComparisonPlayerSlot({
  player,
  slotIndex,
  onAdd,
  onRemove,
  onReplace,
}: ComparisonPlayerSlotProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation('scout');
  const accentColor = COMPARISON_PLAYER_COLORS[slotIndex];

  if (!player) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('comparison.addPlayerToComparison')}
        onPress={onAdd}
        className="min-h-[120px] min-w-0 flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-surface px-2"
      >
        <Plus size={20} color={colors.textSecondary} />
        <Text variant="caption" color="secondary" className="mt-1 font-sans-semibold">
          {t('comparison.addPlayer')}
        </Text>
      </Pressable>
    );
  }

  return (
    <View
      className={cn(
        'min-h-[120px] min-w-0 flex-1 overflow-hidden rounded-lg border bg-surface',
      )}
      style={{ borderColor: accentColor }}
    >
      <View className="absolute left-0 top-0 h-1 w-full" style={{ backgroundColor: accentColor }} />
      <View className="flex-row items-start gap-2 p-2.5">
        <Image
          source={{ uri: player.avatarUrl }}
          className="h-10 w-10 rounded-full"
          accessibilityIgnoresInvertColors
        />
        <View className="min-w-0 flex-1">
          <Text variant="caption" numberOfLines={1} className="font-sans-bold">
            {player.fullName}
          </Text>
          <Text variant="caption" color="secondary" numberOfLines={1}>
            {joinKnown([
              player.position.length > 0 ? player.position.join('/') : null,
              player.overallRating !== null
                ? t('comparisonUi.overallShort', { value: formatRating(player.overallRating) })
                : null,
            ])}
          </Text>
          <Text variant="caption" color="secondary" numberOfLines={1}>
            {player.club}
          </Text>
        </View>
        <View className="gap-1">
          {onReplace ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('comparisonUi.replaceNamed', { name: player.fullName })}
              onPress={onReplace}
              hitSlop={8}
              className="h-7 w-7 items-center justify-center rounded-full bg-background-secondary"
            >
              <ArrowLeftRight size={13} color={colors.textSecondary} />
            </Pressable>
          ) : null}
          {onRemove ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('comparisonUi.removeNamed', { name: player.fullName })}
              onPress={onRemove}
              hitSlop={8}
              className="h-7 w-7 items-center justify-center rounded-full bg-background-secondary"
            >
              <X size={13} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
