import { View } from 'react-native';
import { Badge } from '@/components/primitives/Badge';
import { Text } from '@/components/primitives/Text';
import { IdentityTagList } from '@/features/player-profile/components/identity/IdentityTagList';
import { ProfileSection } from '@/features/player-profile/components/identity/ProfileSection';
import {
  ACADEMIC_STATUS_OPTIONS,
  AVAILABILITY_OPTIONS,
  CONTRACT_STATUS_OPTIONS,
  TRANSFER_STATUS_OPTIONS,
} from '@/features/player-profile/constants/footballIdentityOptions';
import { type FootballIdentity } from '@/features/player-profile/types/footballIdentity';

export type ProfessionalIdentitySectionProps = {
  identity: FootballIdentity;
};

function getLabel<T extends string>(
  options: { label: string; value: T }[],
  value: T,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

export function ProfessionalIdentitySection({ identity }: ProfessionalIdentitySectionProps) {
  return (
    <ProfileSection title="Professional Status" subtitle="Contract, availability and transfer intent">
      <View className="flex-row flex-wrap gap-2">
        <Badge
          label={getLabel(CONTRACT_STATUS_OPTIONS, identity.contractStatus)}
          variant="default"
        />
        <Badge
          label={getLabel(AVAILABILITY_OPTIONS, identity.availability)}
          variant={identity.availability === 'available' ? 'success' : 'warning'}
        />
        <Badge
          label={getLabel(TRANSFER_STATUS_OPTIONS, identity.transferStatus)}
          variant="accent"
        />
      </View>
      <IdentityTagList label="Preferred Countries" values={identity.preferredCountries} />
      <IdentityTagList label="Preferred Leagues" values={identity.preferredLeagues} />
    </ProfileSection>
  );
}

export type PersonalIdentitySectionProps = {
  identity: FootballIdentity;
};

export function PersonalIdentitySection({ identity }: PersonalIdentitySectionProps) {
  return (
    <ProfileSection title="Personal & Academic" subtitle="Languages, education and leadership">
      <View className="flex-row flex-wrap gap-3">
        <View className="min-w-[45%] flex-1 gap-1 rounded-xl border border-border bg-background-secondary/70 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/80">
          <Text variant="caption" color="secondary" className="uppercase tracking-wider">
            Jersey Number
          </Text>
          <Text variant="body" className="font-sans-medium">
            {identity.jerseyNumber ?? '—'}
          </Text>
        </View>
        <View className="min-w-[45%] flex-1 gap-1 rounded-xl border border-border bg-background-secondary/70 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/80">
          <Text variant="caption" color="secondary" className="uppercase tracking-wider">
            Captain Experience
          </Text>
          <Text variant="body" className="font-sans-medium">
            {identity.hasCaptainExperience ? 'Yes' : 'No'}
          </Text>
        </View>
      </View>
      <View className="gap-1 rounded-xl border border-border bg-background-secondary/70 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/80">
        <Text variant="caption" color="secondary" className="uppercase tracking-wider">
          Academic Status
        </Text>
        <Text variant="body" className="font-sans-medium">
          {getLabel(ACADEMIC_STATUS_OPTIONS, identity.academicStatus)}
        </Text>
      </View>
      <IdentityTagList label="Languages Spoken" values={identity.languagesSpoken} />
    </ProfileSection>
  );
}
