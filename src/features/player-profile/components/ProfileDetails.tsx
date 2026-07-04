import { View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { ProfileField } from '@/features/player-profile/components/ProfileField';
import { ProfileSection } from '@/features/player-profile/components/identity/ProfileSection';
import { type PlayerProfile } from '@/features/player-profile/types';

export type ProfileDetailsProps = {
  profile: PlayerProfile;
};

export function ProfileDetails({ profile }: ProfileDetailsProps) {
  return (
    <Animated.View entering={FadeInUp.delay(150).duration(500)}>
      <ProfileSection title="Physical Profile" subtitle="Core athletic attributes">
        <View className="flex-row flex-wrap gap-3">
          <ProfileField label="Nationality" value={profile.nationality} />
          <ProfileField label="Height" value={profile.height} />
          <ProfileField label="Weight" value={profile.weight} />
          <ProfileField label="Strong Foot" value={profile.preferredFoot} />
        </View>
      </ProfileSection>
    </Animated.View>
  );
}
