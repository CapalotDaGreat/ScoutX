import { View } from 'react-native';
import { IdentityFieldCard } from '@/features/player-profile/components/identity/IdentityFieldCard';
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
        <IdentityFieldCard
          label="Preferred Formation"
          value={identity.preferredFormation || '—'}
        />
        <IdentityFieldCard
          label="Playing Style"
          value={identity.preferredPlayingStyle || '—'}
        />
      </View>
      <View className="flex-row flex-wrap gap-3">
        <IdentityFieldCard
          label="Strong Foot"
          value={formatFootLabel(identity.strongFoot)}
          className="min-w-[30%]"
        />
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
