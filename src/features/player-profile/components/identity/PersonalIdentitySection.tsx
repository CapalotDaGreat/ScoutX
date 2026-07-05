import { View } from 'react-native';
import { IdentityTagList } from '@/features/player-profile/components/identity/IdentityTagList';
import { IdentityFieldCard } from '@/features/player-profile/components/identity/IdentityFieldCard';
import { ProfileSection } from '@/features/player-profile/components/identity/ProfileSection';
import {
  ACADEMIC_STATUS_OPTIONS,
  getOptionLabel,
} from '@/features/player-profile/constants/footballIdentityOptions';
import { type FootballIdentity } from '@/features/player-profile/types/footballIdentity';

export type PersonalIdentitySectionProps = {
  identity: FootballIdentity;
};

export function PersonalIdentitySection({ identity }: PersonalIdentitySectionProps) {
  return (
    <ProfileSection title="Personal & Academic" subtitle="Languages, education and leadership">
      <View className="flex-row flex-wrap gap-3">
        <IdentityFieldCard
          label="Jersey Number"
          value={identity.jerseyNumber != null ? String(identity.jerseyNumber) : '—'}
        />
        <IdentityFieldCard
          label="Captain Experience"
          value={identity.hasCaptainExperience ? 'Yes' : 'No'}
        />
      </View>
      <IdentityFieldCard
        label="Academic Status"
        value={getOptionLabel(ACADEMIC_STATUS_OPTIONS, identity.academicStatus)}
        className="min-w-full"
      />
      <IdentityTagList label="Languages Spoken" values={identity.languagesSpoken} />
    </ProfileSection>
  );
}
