import { memo } from 'react';
import { Image, Pressable, View, type ViewStyle } from 'react-native';
import { Badge } from '@/components/primitives/Badge';
import { Text } from '@/components/primitives/Text';
import { AnimatedListItem } from '@/components/feedback/AnimatedListItem';
import { PlayerFormStrip } from '@/features/scout-discovery/components/PlayerFormStrip';
import { PlayerQuickActions } from '@/features/scout-discovery/components/PlayerQuickActions';
import { RatingPill } from '@/features/scout-discovery/components/RatingPill';
import { formatRating, joinKnown } from '@/features/scout-discovery/models/DiscoverablePlayerModel';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';
import { cn } from '@/utils/cn';
import { triggerHaptic } from '@/utils/haptics';
import { CheckCircle2 } from 'lucide-react-native';
import { useTheme } from '@/theme';

export type PlayerDiscoveryCardProps = {
  player: DiscoverablePlayer;
  onPress: (player: DiscoverablePlayer) => void;
  index?: number;
  className?: string;
  isSaved?: boolean;
  onToggleSave?: (playerId: string) => void;
  isInComparison?: boolean;
  canAddToComparison?: boolean;
  onToggleCompare?: (playerId: string) => void;
};

const availabilityVariant = {
  available: 'success' as const,
  unavailable: 'default' as const,
  on_loan: 'warning' as const,
};

const availabilityLabel = {
  available: 'Available',
  unavailable: 'Unavailable',
  on_loan: 'On Loan',
};

export const PlayerDiscoveryCard = memo(function PlayerDiscoveryCard({
  player,
  onPress,
  index = 0,
  className,
  isSaved = false,
  onToggleSave,
  isInComparison = false,
  canAddToComparison = true,
  onToggleCompare,
}: PlayerDiscoveryCardProps) {
  const { colors } = useTheme();

  const handlePress = () => {
    void triggerHaptic('light');
    onPress(player);
  };

  return (
    <AnimatedListItem index={index}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={joinKnown([
          player.fullName,
          player.position.length > 0 ? player.position.join('/') : null,
          player.overallRating !== null ? `overall ${formatRating(player.overallRating)}` : null,
        ])}
        onPress={handlePress}
        className={cn(
          'overflow-hidden rounded-2xl border border-border bg-surface',
          className,
        )}
        style={({ pressed }) =>
          pressed ? ({ transform: [{ scale: 0.985 }] } satisfies ViewStyle) : undefined
        }
      >
        <View className="relative h-32">
          <Image source={{ uri: player.coverImageUrl }} className="h-full w-full" resizeMode="cover" />
          <View className="absolute inset-0 bg-black/30" />
          <View className="absolute left-3 top-3 flex-row gap-2">
            {player.verified ? <Badge label="Verified" variant="prestige" size="sm" /> : null}
            <Badge
              label={availabilityLabel[player.availability]}
              variant={availabilityVariant[player.availability]}
              size="sm"
            />
          </View>
          {onToggleSave || onToggleCompare ? (
            <View className="absolute right-3 top-3">
              <PlayerQuickActions
                isFavourite={isSaved}
                onToggleFavourite={onToggleSave ? () => onToggleSave(player.id) : undefined}
                isInComparison={isInComparison}
                canAddToComparison={canAddToComparison}
                onToggleCompare={onToggleCompare ? () => onToggleCompare(player.id) : undefined}
              />
            </View>
          ) : null}
          <View className="absolute bottom-3 left-3 right-3 flex-row items-end justify-between">
            <View>
              <Text variant="caption" className="text-white/80">
                {player.league}
              </Text>
              <Text variant="body-sm" className="font-sans-bold text-white">
                {player.club}
              </Text>
            </View>
            {player.overallRating !== null ? (
              <View className="rounded-lg bg-black/55 px-2.5 py-1">
                <Text variant="caption" className="font-sans-bold text-white">
                  OVR {formatRating(player.overallRating)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View className="gap-3 p-4">
          <View className="flex-row items-start gap-3">
            <Image
              source={{ uri: player.avatarUrl }}
              className="h-12 w-12 rounded-full border-2 border-surface"
            />
            <View className="min-w-0 flex-1">
              <View className="flex-row items-center gap-1">
                <Text weight="semibold" numberOfLines={1} className="flex-shrink">
                  {player.fullName}
                </Text>
                {player.verified ? (
                  <CheckCircle2 size={14} color={colors.accent} strokeWidth={2} />
                ) : null}
              </View>
              <Text variant="caption" color="secondary">
                {joinKnown([
                  player.age,
                  player.nationality,
                  player.position.length > 0 ? player.position.join(' / ') : null,
                ])}
              </Text>
            </View>
            {player.potentialRating !== null ? (
              <RatingPill label="POT" value={formatRating(player.potentialRating)} emphasis="primary" />
            ) : null}
          </View>

          <View className="flex-row items-center justify-between">
            <PlayerFormStrip form={player.form} size="md" />
            <Text variant="caption" color="secondary">
              {player.matchCount} matches
            </Text>
          </View>
        </View>
      </Pressable>
    </AnimatedListItem>
  );
});
