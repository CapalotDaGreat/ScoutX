import { Image, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { Badge } from '@/components/primitives/Badge';
import { Text } from '@/components/primitives/Text';
import { MiniRadarChart } from '@/features/scout-discovery/components/MiniRadarChart';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';

export type PlayerCarouselProps = {
  players: DiscoverablePlayer[];
  onPlayerPress: (player: DiscoverablePlayer) => void;
  variant?: 'compact' | 'premium';
};

export function PlayerCarousel({
  players,
  onPlayerPress,
  variant = 'premium',
}: PlayerCarouselProps) {
  if (players.length === 0) {
    return null;
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View className="flex-row gap-3 pr-4">
        {players.map((player, index) => (
          <Animated.View key={player.id} entering={FadeInRight.delay(index * 50).duration(300)}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`View ${player.fullName}`}
              onPress={() => onPlayerPress(player)}
              className={
                variant === 'premium'
                  ? 'w-64 overflow-hidden rounded-2xl border border-border bg-surface'
                  : 'w-52 overflow-hidden rounded-xl border border-border bg-surface'
              }
            >
              <View className="relative h-28">
                <Image
                  source={{ uri: player.coverImageUrl }}
                  className="h-full w-full"
                  resizeMode="cover"
                />
                <View className="absolute inset-0 bg-black/20" />
                <View className="absolute left-3 top-3">
                  {player.verified ? <Badge label="Verified" variant="prestige" size="sm" /> : null}
                </View>
                <View className="absolute bottom-3 right-3 rounded-md bg-black/55 px-2 py-1">
                  <Text variant="caption" className="font-sans-bold text-white">
                    OVR {player.overallRating}
                  </Text>
                </View>
              </View>
              <View className="gap-2 p-3">
                <View className="flex-row items-center gap-2">
                  <Image
                    source={{ uri: player.avatarUrl }}
                    className="h-9 w-9 rounded-full"
                  />
                  <View className="flex-1">
                    <Text weight="semibold" numberOfLines={1}>
                      {player.fullName}
                    </Text>
                    <Text variant="caption" color="secondary" numberOfLines={1}>
                      {player.club} · {player.position.join('/')}
                    </Text>
                  </View>
                  {variant === 'premium' ? <MiniRadarChart stats={player.radarStats} size={56} /> : null}
                </View>
                <Text variant="caption" color="secondary">
                  POT {player.potentialRating} · {player.nationality}
                </Text>
              </View>
            </Pressable>
          </Animated.View>
        ))}
      </View>
    </ScrollView>
  );
}
