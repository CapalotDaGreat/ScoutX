import { ScrollView, View } from 'react-native';
import { Image, Pressable } from 'react-native';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';

export type FeaturedPlayersCarouselProps = {
  title: string;
  players: DiscoverablePlayer[];
  onPlayerPress: (player: DiscoverablePlayer) => void;
};

export function FeaturedPlayersCarousel({
  title,
  players,
  onPlayerPress,
}: FeaturedPlayersCarouselProps) {
  if (players.length === 0) {
    return null;
  }

  return (
    <View className="gap-3">
      {title ? <Heading level={3}>{title}</Heading> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-3 pr-4">
          {players.map((player) => (
            <Pressable
              key={player.id}
              accessibilityRole="button"
              accessibilityLabel={`View ${player.fullName}`}
              onPress={() => onPlayerPress(player)}
              className="w-56 overflow-hidden rounded-2xl border border-border bg-surface"
            >
              <Image
                source={{ uri: player.coverImageUrl }}
                className="h-24 w-full"
                resizeMode="cover"
              />
              <View className="gap-1 p-3">
                <Text weight="semibold" numberOfLines={1}>
                  {player.fullName}
                </Text>
                <Text variant="caption" color="secondary">
                  {player.club} · OVR {player.overallRating}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
