import { Image, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Avatar } from '@/components/primitives/Avatar';
import { Badge } from '@/components/primitives/Badge';
import { Button } from '@/components/primitives/Button';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import {
  AVAILABILITY_OPTIONS,
  TRANSFER_STATUS_OPTIONS,
} from '@/features/player-profile/constants/footballIdentityOptions';
import { type PlayerProfile } from '@/features/player-profile/types';

export type ProfileHeroProps = {
  profile: PlayerProfile;
  onEditPress?: () => void;
};

function getOptionLabel<T extends string>(
  options: { label: string; value: T }[],
  value: T,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

export function ProfileHero({ profile, onEditPress }: ProfileHeroProps) {
  const { identity } = profile;
  const primaryPosition = identity.preferredPositions[0] ?? profile.position;

  return (
    <Animated.View
      entering={FadeInUp.duration(500)}
      className="overflow-hidden rounded-3xl border border-border bg-surface dark:border-neutral-800 dark:bg-neutral-900"
    >
      <Image source={{ uri: profile.coverImageUrl }} className="h-44 w-full" resizeMode="cover" />

      <View className="px-5 pb-5 pt-0">
        <View className="-mt-8 flex-row items-end justify-between">
          <Avatar
            source={{ uri: profile.avatarUrl }}
            name={profile.fullName}
            size="2xl"
            showBorder
            className="border-4 border-surface dark:border-neutral-900"
          />
          <Button variant="accent" size="sm" onPress={onEditPress}>
            Edit Profile
          </Button>
        </View>

        <View className="mt-4 gap-2">
          {identity.biographyHeadline ? (
            <Text variant="body-sm" color="secondary">
              {identity.biographyHeadline}
            </Text>
          ) : null}
          <View className="flex-row flex-wrap items-center gap-2">
            <Heading level={2}>{profile.fullName}</Heading>
            {identity.jerseyNumber ? (
              <Badge label={`#${identity.jerseyNumber}`} variant="outline" size="sm" />
            ) : null}
            <Badge label={primaryPosition} variant="accent" />
          </View>
        </View>

        <View className="mt-2 flex-row flex-wrap gap-2">
          <Badge label={identity.currentClub} variant="default" />
          <Badge
            label={getOptionLabel(AVAILABILITY_OPTIONS, identity.availability)}
            variant={identity.availability === 'available' ? 'success' : 'warning'}
            size="sm"
          />
          <Badge
            label={getOptionLabel(TRANSFER_STATUS_OPTIONS, identity.transferStatus)}
            variant="accent"
            size="sm"
          />
        </View>

        <View className="mt-3 flex-row flex-wrap gap-3">
          <Text variant="body-sm" color="secondary">
            {profile.nationality}
          </Text>
          <Text variant="body-sm" color="secondary">
            •
          </Text>
          <Text variant="body-sm" color="secondary">
            {profile.height} · {profile.weight}
          </Text>
          {identity.hasCaptainExperience ? (
            <>
              <Text variant="body-sm" color="secondary">
                •
              </Text>
              <Text variant="body-sm" color="secondary">
                Captain
              </Text>
            </>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}
