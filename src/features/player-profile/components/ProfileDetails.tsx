import { View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { ProfileField } from '@/features/player-profile/components/ProfileField';
import { type PlayerProfile } from '@/features/player-profile/types';

export type ProfileDetailsProps = {
  profile: PlayerProfile;
};

export function ProfileDetails({ profile }: ProfileDetailsProps) {
  return (
    <Animated.View entering={FadeInUp.delay(150).duration(500)}>
      <Card variant="default" padding="lg" className="gap-4">
        <Heading level={3}>Profile Overview</Heading>
        <View className="flex-row flex-wrap gap-3">
          <ProfileField label="Position" value={profile.position} />
          <ProfileField label="Club" value={profile.club} />
          <ProfileField label="Nationality" value={profile.nationality} />
          <ProfileField label="Preferred Foot" value={profile.preferredFoot} />
          <ProfileField label="Height" value={profile.height} />
          <ProfileField label="Weight" value={profile.weight} />
        </View>

        <View className="gap-2">
          <Text variant="caption" color="secondary" className="uppercase tracking-wider">
            Biography
          </Text>
          <Text variant="body" color="secondary">
            {profile.biography}
          </Text>
        </View>
      </Card>
    </Animated.View>
  );
}
