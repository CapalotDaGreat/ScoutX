import { View } from 'react-native';
import { Badge } from '@/components/primitives/Badge';
import { IdentityTagList } from '@/features/player-profile/components/identity/IdentityTagList';
import { ProfileSection } from '@/features/player-profile/components/identity/ProfileSection';
import {
  AVAILABILITY_OPTIONS,
  CONTRACT_STATUS_OPTIONS,
  getOptionLabel,
  TRANSFER_STATUS_OPTIONS,
} from '@/features/player-profile/constants/footballIdentityOptions';
import { type FootballIdentity } from '@/features/player-profile/types/footballIdentity';

export type ProfessionalIdentitySectionProps = {
  identity: FootballIdentity;
};

export function ProfessionalIdentitySection({ identity }: ProfessionalIdentitySectionProps) {
  return (
    <ProfileSection title="Professional Status" subtitle="Contract, availability and transfer intent">
      <View className="flex-row flex-wrap gap-2">
        <Badge
          label={getOptionLabel(CONTRACT_STATUS_OPTIONS, identity.contractStatus)}
          variant="default"
        />
        <Badge
          label={getOptionLabel(AVAILABILITY_OPTIONS, identity.availability)}
          variant={identity.availability === 'available' ? 'success' : 'warning'}
        />
        <Badge
          label={getOptionLabel(TRANSFER_STATUS_OPTIONS, identity.transferStatus)}
          variant="accent"
        />
      </View>
      <IdentityTagList label="Preferred Countries" values={identity.preferredCountries} />
      <IdentityTagList label="Preferred Leagues" values={identity.preferredLeagues} />
    </ProfileSection>
  );
}
