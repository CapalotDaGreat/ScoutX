import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { type FootballIdentity } from '@/features/player-profile/types/footballIdentity';
import { ProfileSection } from '@/features/player-profile/components/identity/ProfileSection';

export type BiographyIdentitySectionProps = {
  identity: FootballIdentity;
  biography: string;
};

export function BiographyIdentitySection({ identity, biography }: BiographyIdentitySectionProps) {
  return (
    <ProfileSection
      title="Professional Story"
      subtitle="How you present yourself to clubs and scouts"
    >
      {identity.biographyHeadline ? (
        <Text variant="body-lg" className="font-sans-semibold">
          {identity.biographyHeadline}
        </Text>
      ) : null}
      <View className="gap-2">
        <Text variant="caption" color="secondary" className="uppercase tracking-wider">
          Biography
        </Text>
        <Text variant="body" color="secondary">
          {biography || 'Tell scouts about your journey, strengths, and ambitions.'}
        </Text>
      </View>
    </ProfileSection>
  );
}
