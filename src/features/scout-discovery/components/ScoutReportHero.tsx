import { Image, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Avatar } from '@/components/primitives/Avatar';
import { Badge } from '@/components/primitives/Badge';
import { Text } from '@/components/primitives/Text';
import { Heading } from '@/components/primitives/Heading';
import { PlayerFormStrip } from '@/features/scout-discovery/components/PlayerFormStrip';
import { RatingPill } from '@/features/scout-discovery/components/RatingPill';
import { VerificationBadge } from '@/features/trust-system';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';

export type ScoutReportHeroProps = {
  player: DiscoverablePlayer;
};

export function ScoutReportHero({ player }: ScoutReportHeroProps) {
  return (
    <Animated.View entering={FadeInDown.duration(400)} className="gap-4">
      <View className="overflow-hidden rounded-2xl">
        <Image source={{ uri: player.coverImageUrl }} className="h-48 w-full" resizeMode="cover" />
        <View className="absolute inset-0 bg-black/35" />
        <View className="absolute bottom-0 left-0 right-0 p-4">
          <Text variant="overline" className="text-white/80">
            Scouting Report
          </Text>
          <View className="mt-2 flex-row items-end gap-3">
            <Avatar
              source={{ uri: player.avatarUrl }}
              size="xl"
              className="border-4 border-white/20"
            />
            <View className="flex-1 pb-1">
              <View className="flex-row flex-wrap items-center gap-2">
                <Heading level={2} className="text-white">
                  {player.fullName}
                </Heading>
                {player.verified ? (
                  <VerificationBadge entity="player" size="sm" />
                ) : null}
              </View>
              <Text variant="body-sm" className="text-white/85">
                {player.age} yrs · {player.nationality} · {player.club}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View className="flex-row gap-3">
        <RatingPill label="Overall" value={player.overallRating} emphasis="primary" className="flex-1" />
        <RatingPill label="Potential" value={player.potentialRating} className="flex-1" />
        <RatingPill label="Sprint" value={`${player.sprintSpeedKmh}`} className="flex-1" />
      </View>

      <View className="flex-row flex-wrap gap-2">
        {player.position.map((pos) => (
          <Badge key={pos} label={pos} variant="outline" size="sm" />
        ))}
        <Badge
          label={player.availability.replace('_', ' ')}
          variant={player.availability === 'available' ? 'success' : 'warning'}
          size="sm"
        />
      </View>

      <PlayerFormStrip form={player.form} size="md" />
    </Animated.View>
  );
}
