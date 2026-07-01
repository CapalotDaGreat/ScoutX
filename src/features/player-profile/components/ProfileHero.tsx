import { Image, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Avatar } from '@/components/primitives/Avatar';
import { Badge } from '@/components/primitives/Badge';
import { Button } from '@/components/primitives/Button';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { type PlayerProfile } from '@/features/player-profile/types';

export type ProfileHeroProps = {
  profile: PlayerProfile;
  onEditPress?: () => void;
};

export function ProfileHero({ profile, onEditPress }: ProfileHeroProps) {
  return (
    <Animated.View entering={FadeInUp.duration(500)} className="overflow-hidden rounded-3xl border border-border bg-surface dark:border-neutral-800 dark:bg-neutral-900">
      <Image
        source={{ uri: profile.coverImageUrl }}
        className="h-40 w-full"
        resizeMode="cover"
      />

      <View className="px-5 pb-5 pt-0">
        <View className="-mt-8 flex-row items-end justify-between">
          <Avatar source={{ uri: profile.avatarUrl }} name={profile.fullName} size="2xl" showBorder className="border-4 border-surface dark:border-neutral-900" />
          <Button variant="accent" size="sm" onPress={onEditPress}>
            Edit Profile
          </Button>
        </View>

        <View className="mt-4 flex-row flex-wrap items-center gap-2">
          <Heading level={2}>{profile.fullName}</Heading>
          <Badge label={profile.position} variant="accent" />
        </View>

        <View className="mt-2 flex-row flex-wrap gap-3">
          <Text variant="body-sm" color="secondary">
            Club: {profile.club}
          </Text>
          <Text variant="body-sm" color="secondary">
            •
          </Text>
          <Text variant="body-sm" color="secondary">
            Nationality: {profile.nationality}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}
