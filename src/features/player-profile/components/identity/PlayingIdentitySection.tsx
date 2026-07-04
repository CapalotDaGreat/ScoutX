import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { IdentityRatingField } from '@/features/player-profile/components/identity/IdentityRatingField';
import { IdentityTagList } from '@/features/player-profile/components/identity/IdentityTagList';
import { ProfileSection } from '@/features/player-profile/components/identity/ProfileSection';
import { formatFootLabel } from '@/features/player-profile/models/FootballIdentityModel';
import { type FootballIdentity } from '@/features/player-profile/types/footballIdentity';

export type PlayingIdentitySectionProps = {
  identity: FootballIdentity;
};

export function PlayingIdentitySection({ identity }: PlayingIdentitySectionProps) {
  return (
    <ProfileSection title="Playing Identity" subtitle="Positions, style and technical profile">
      <IdentityTagList label="Preferred Positions" values={identity.preferredPositions} />
      <IdentityTagList label="Secondary Positions" values={identity.secondaryPositions} />
      <View className="flex-row flex-wrap gap-3">
        <View className="min-w-[45%] flex-1 gap-1 rounded-xl border border-border bg-background-secondary/70 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/80">
          <Text variant="caption" color="secondary" className="uppercase tracking-wider">
            Preferred Formation
          </Text>
          <Text variant="body" className="font-sans-medium">
            {identity.preferredFormation || '—'}
          </Text>
        </View>
        <View className="min-w-[45%] flex-1 gap-1 rounded-xl border border-border bg-background-secondary/70 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/80">
          <Text variant="caption" color="secondary" className="uppercase tracking-wider">
            Playing Style
          </Text>
          <Text variant="body" className="font-sans-medium">
            {identity.preferredPlayingStyle || '—'}
          </Text>
        </View>
      </View>
      <View className="flex-row flex-wrap gap-3">
        <View className="min-w-[30%] flex-1 gap-1 rounded-xl border border-border bg-background-secondary/70 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/80">
          <Text variant="caption" color="secondary" className="uppercase tracking-wider">
            Strong Foot
          </Text>
          <Text variant="body" className="font-sans-medium">
            {formatFootLabel(identity.strongFoot)}
          </Text>
        </View>
        <View className="min-w-[30%] flex-1">
          <IdentityRatingField label="Weak Foot" value={identity.weakFootRating} />
        </View>
        <View className="min-w-[30%] flex-1">
          <IdentityRatingField label="Skill Moves" value={identity.skillMovesRating} />
        </View>
      </View>
    </ProfileSection>
  );
}
