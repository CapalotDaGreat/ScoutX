import { memo, useState } from 'react';
import { Image, Pressable, View, type ViewStyle } from 'react-native';
import { Badge } from '@/components/primitives/Badge';
import { StarRating } from '@/components/primitives/StarRating';
import { Text } from '@/components/primitives/Text';
import { AnimatedListItem } from '@/components/feedback/AnimatedListItem';
import { PlayerFormStrip } from '@/features/scout-discovery/components/PlayerFormStrip';
import { PlayerQuickActions } from '@/features/scout-discovery/components/PlayerQuickActions';
import { joinKnown } from '@/features/scout-discovery/models/DiscoverablePlayerModel';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';
import { cn } from '@/utils/cn';
import { triggerHaptic } from '@/utils/haptics';
import { CheckCircle2 } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type PlayerDiscoveryCardProps = {
  player: DiscoverablePlayer;
  onPress: (player: DiscoverablePlayer) => void;
  index?: number;
  className?: string;
  isSaved?: boolean;
  onToggleSave?: (playerId: string) => void;
  /** True while a save mutation for this player is in flight; blocks duplicate taps. */
  saveDisabled?: boolean;
  isInComparison?: boolean;
  canAddToComparison?: boolean;
  onToggleCompare?: (playerId: string) => void;
};

const availabilityVariant = {
  available: 'success' as const,
  unavailable: 'default' as const,
  on_loan: 'warning' as const,
};

const availabilityLabelKey = {
  available: 'available',
  unavailable: 'unavailable',
  on_loan: 'onLoan',
} as const;

export function playerInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toUpperCase();
}

export const PlayerDiscoveryCard = memo(function PlayerDiscoveryCard({
  player,
  onPress,
  index = 0,
  className,
  isSaved = false,
  onToggleSave,
  saveDisabled = false,
  isInComparison = false,
  canAddToComparison = true,
  onToggleCompare,
}: PlayerDiscoveryCardProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation(['scout', 'trust']);
  const [coverFailed, setCoverFailed] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const handlePress = () => {
    void triggerHaptic('light');
    onPress(player);
  };

  const showCover = player.coverImageUrl.trim().length > 0 && !coverFailed;
  const showAvatar = player.avatarUrl.trim().length > 0 && !avatarFailed;
  const footLabel = player.preferredFoot ? t(`scout:filters.${player.preferredFoot}`) : null;
  const evidenceParts = [
    t('scout:discover.matchesCount', { count: player.matchCount }),
    player.hasHighlightVideos ? t('scout:discover.hasHighlights') : null,
    player.analysisSampleCount > 0
      ? t('scout:discover.analysisSamples', { count: player.analysisSampleCount })
      : null,
  ].filter(Boolean);

  return (
    <AnimatedListItem index={index}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={joinKnown([
          player.fullName,
          player.primaryPosition,
          player.club || null,
          t('scout:discover.matchesCount', { count: player.matchCount }),
        ])}
        accessibilityHint={t('scout:playerCard.openHint')}
        onPress={handlePress}
        className={cn(
          'overflow-hidden rounded-2xl border border-border bg-surface',
          className,
        )}
        style={({ pressed }) =>
          pressed ? ({ transform: [{ scale: 0.985 }] } satisfies ViewStyle) : undefined
        }
      >
        <View className="relative h-32 bg-background-secondary">
          {showCover ? (
            <Image
              source={{ uri: player.coverImageUrl }}
              className="h-full w-full"
              resizeMode="cover"
              onError={() => setCoverFailed(true)}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View className="flex-1 items-center justify-center" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Text variant="body-lg" color="tertiary" className="font-sans-bold">
                {playerInitials(player.fullName)}
              </Text>
            </View>
          )}
          {showCover ? <View className="absolute inset-0 bg-black/30" /> : null}
          <View className="absolute left-3 top-3 flex-row gap-2">
            {player.verified ? (
              <Badge label={t('trust:verified')} variant="prestige" size="sm" />
            ) : null}
            {player.availability ? (
              <Badge
                label={t(`scout:filters.${availabilityLabelKey[player.availability]}`)}
                variant={availabilityVariant[player.availability]}
                size="sm"
              />
            ) : null}
          </View>
          {onToggleSave || onToggleCompare ? (
            <View className="absolute right-3 top-3">
              <PlayerQuickActions
                isFavourite={isSaved}
                onToggleFavourite={onToggleSave ? () => onToggleSave(player.id) : undefined}
                favouriteDisabled={saveDisabled}
                isInComparison={isInComparison}
                canAddToComparison={canAddToComparison}
                onToggleCompare={onToggleCompare ? () => onToggleCompare(player.id) : undefined}
              />
            </View>
          ) : null}
          {showCover && (player.club || player.league) ? (
            <View className="absolute bottom-3 left-3 right-3">
              <Text variant="caption" className="text-white/80" numberOfLines={1}>
                {player.league}
              </Text>
              <Text variant="body-sm" className="font-sans-bold text-white" numberOfLines={1}>
                {player.club}
              </Text>
            </View>
          ) : null}
        </View>

        <View className="gap-3 p-4">
          <View className="flex-row items-start gap-3">
            {showAvatar ? (
              <Image
                source={{ uri: player.avatarUrl }}
                className="h-12 w-12 rounded-full border-2 border-surface"
                onError={() => setAvatarFailed(true)}
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View
                className="h-12 w-12 items-center justify-center rounded-full bg-background-secondary"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Text variant="body-sm" weight="bold" color="secondary">
                  {playerInitials(player.fullName)}
                </Text>
              </View>
            )}
            <View className="min-w-0 flex-1">
              <View className="flex-row items-center gap-1">
                <Text weight="semibold" numberOfLines={1} className="flex-shrink">
                  {player.fullName}
                </Text>
                {player.verified ? (
                  <CheckCircle2 size={14} color={colors.accent} strokeWidth={2} />
                ) : null}
              </View>
              <Text variant="caption" color="secondary" numberOfLines={2}>
                {joinKnown([
                  player.primaryPosition,
                  player.secondaryPositions.length > 0 ? player.secondaryPositions.join(' / ') : null,
                  player.club || null,
                ])}
              </Text>
              <Text variant="caption" color="tertiary" numberOfLines={1}>
                {joinKnown([
                  player.age,
                  player.nationality || null,
                  footLabel ? t('scout:playerCard.footValue', { foot: footLabel }) : null,
                ])}
              </Text>
            </View>
          </View>

          {player.weakFoot !== null || player.skillMoves !== null ? (
            <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
              {player.weakFoot !== null ? (
                <View className="flex-row items-center gap-1.5">
                  <Text variant="caption" color="secondary">
                    {t('scout:filters.weakFootShort')}
                  </Text>
                  <StarRating value={player.weakFoot} size="xs" label={t('scout:filters.weakFoot')} />
                </View>
              ) : null}
              {player.skillMoves !== null ? (
                <View className="flex-row items-center gap-1.5">
                  <Text variant="caption" color="secondary">
                    {t('scout:filters.skillMovesShort')}
                  </Text>
                  <StarRating
                    value={player.skillMoves}
                    size="xs"
                    label={t('scout:filters.skillMoves')}
                  />
                </View>
              ) : null}
            </View>
          ) : null}

          <View className="flex-row items-center justify-between gap-3">
            <PlayerFormStrip form={player.form} size="md" />
            <Text variant="caption" color="secondary" numberOfLines={2} className="flex-1 text-right">
              {evidenceParts.join(' · ')}
            </Text>
          </View>
        </View>
      </Pressable>
    </AnimatedListItem>
  );
});
