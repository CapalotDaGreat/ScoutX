import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { ClubHistoryList } from '@/features/player-profile/components/identity/ClubHistoryList';
import { ProfileSection } from '@/features/player-profile/components/identity/ProfileSection';
import { type FootballIdentity } from '@/features/player-profile/types/footballIdentity';

export type CareerIdentitySectionProps = {
  identity: FootballIdentity;
};

export function CareerIdentitySection({ identity }: CareerIdentitySectionProps) {
  return (
    <>
      <ProfileSection title="Current Club" subtitle="Where you are playing right now">
        <View className="rounded-xl border border-border bg-background-secondary/70 px-4 py-4">
          <Text variant="body-lg" className="font-sans-semibold">
            {identity.currentClub}
          </Text>
        </View>
      </ProfileSection>

      <ProfileSection title="Club History" subtitle="Previous clubs and development pathway">
        <ClubHistoryList entries={identity.clubHistory} />
      </ProfileSection>
    </>
  );
}
