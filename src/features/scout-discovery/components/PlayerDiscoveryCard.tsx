import { memo } from 'react';

import { Image, Pressable, View, type ViewStyle } from 'react-native';

import Animated, { FadeInUp } from 'react-native-reanimated';

import { Badge } from '@/components/primitives/Badge';

import { Text } from '@/components/primitives/Text';

import { MiniRadarChart } from '@/features/scout-discovery/components/MiniRadarChart';

import { PlayerFormStrip } from '@/features/scout-discovery/components/PlayerFormStrip';

import { PlayerQuickActions } from '@/features/scout-discovery/components/PlayerQuickActions';

import { RatingPill } from '@/features/scout-discovery/components/RatingPill';

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

  isFavourite?: boolean;

  onToggleFavourite?: (playerId: string) => void;

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

  isFavourite = false,

  onToggleFavourite,

}: PlayerDiscoveryCardProps) {

  const { colors } = useTheme();



  const handlePress = () => {

    void triggerHaptic('light');

    onPress(player);

  };



  return (

    <Animated.View entering={FadeInUp.delay(Math.min(index, 8) * 35).duration(320)}>

      <Pressable

        accessibilityRole="button"

        accessibilityLabel={`${player.fullName}, ${player.position.join('/')}, overall ${player.overallRating}`}

        onPress={handlePress}

        className={cn(

          'overflow-hidden rounded-2xl border border-border bg-surface shadow-sm dark:border-neutral-800 dark:bg-neutral-900',

          className,

        )}

        style={({ pressed }) =>

          pressed ? ({ transform: [{ scale: 0.985 }] } satisfies ViewStyle) : undefined

        }

      >

        <View className="relative h-32">

          <Image

            source={{ uri: player.coverImageUrl }}

            className="h-full w-full"

            resizeMode="cover"

          />

          <View className="absolute inset-0 bg-black/30" />

          <View className="absolute left-3 top-3 flex-row gap-2">

            {player.verified ? <Badge label="Verified" variant="accent" size="sm" /> : null}

            <Badge

              label={availabilityLabel[player.availability]}

              variant={availabilityVariant[player.availability]}

              size="sm"

            />

          </View>

          {onToggleFavourite ? (

            <View className="absolute right-3 top-3">

              <PlayerQuickActions

                isFavourite={isFavourite}

                onToggleFavourite={() => onToggleFavourite(player.id)}

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

            <View className="rounded-lg bg-black/55 px-2.5 py-1">

              <Text variant="caption" className="font-sans-bold text-white">

                OVR {player.overallRating}

              </Text>

            </View>

          </View>

        </View>



        <View className="gap-3 p-4">

          <View className="flex-row items-start gap-3">

            <Image

              source={{ uri: player.avatarUrl }}

              className="h-12 w-12 rounded-full border-2 border-surface dark:border-neutral-900"

            />

            <View className="flex-1">

              <View className="flex-row items-center gap-1">

                <Text weight="semibold" numberOfLines={1}>

                  {player.fullName}

                </Text>

                {player.verified ? (

                  <CheckCircle2 size={14} color={colors.accent} strokeWidth={2} />

                ) : null}

              </View>

              <Text variant="caption" color="secondary">

                {player.age} · {player.nationality} · {player.position.join(' / ')}

              </Text>

              <Text variant="caption" color="secondary">

                {player.preferredFoot} foot · {player.heightCm}cm · {player.weightKg}kg

              </Text>

            </View>

            <MiniRadarChart stats={player.radarStats} size={64} />

          </View>



          <View className="flex-row gap-2">

            <RatingPill label="Potential" value={player.potentialRating} emphasis="primary" className="flex-1" />

            <RatingPill label="Goals" value={player.goals} className="flex-1" />

            <RatingPill label="Assists" value={player.assists} className="flex-1" />

            <RatingPill label="Sprint" value={`${player.sprintSpeedKmh}`} className="flex-1" />

          </View>



          <View className="flex-row items-center justify-between">

            <PlayerFormStrip form={player.form} size="md" />

            <Text variant="caption" color="secondary">

              {player.matchCount} matches

            </Text>

          </View>

        </View>

      </Pressable>

    </Animated.View>

  );

});


