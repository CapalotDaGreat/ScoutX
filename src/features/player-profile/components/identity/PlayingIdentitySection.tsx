import { View } from 'react-native';
import { IdentityFieldCard } from '@/features/player-profile/components/identity/IdentityFieldCard';
import { IdentityRatingField } from '@/features/player-profile/components/identity/IdentityRatingField';
import { IdentityTagList } from '@/features/player-profile/components/identity/IdentityTagList';
import { ProfileSection } from '@/features/player-profile/components/identity/ProfileSection';
import { useIdentityLabels } from '@/features/player-profile/hooks/useIdentityLabels';
import { type FootballIdentity } from '@/features/player-profile/types/footballIdentity';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type PlayingIdentitySectionProps = {
  identity: FootballIdentity;
};

export function PlayingIdentitySection({ identity }: PlayingIdentitySectionProps) {
  const { t } = useAppTranslation('portfolio');
  const labels = useIdentityLabels();

  return (
    <ProfileSection
      title={t('identity.sectionTitles.playing.title')}
      subtitle={t('identity.sectionTitles.playing.subtitle')}
    >
      <IdentityTagList
        label={t('identity.fields.preferredPositions')}
        values={identity.preferredPositions}
        emptyLabel={labels.notStated}
      />
      <IdentityTagList
        label={t('identity.fields.secondaryPositions')}
        values={identity.secondaryPositions}
        emptyLabel={labels.notStated}
      />
      <View className="flex-row flex-wrap gap-3">
        <IdentityFieldCard
          label={t('identity.fields.preferredFormation')}
          value={identity.preferredFormation || labels.notStated}
        />
        <IdentityFieldCard
          label={t('identity.fields.playingStyle')}
          value={labels.style(identity.preferredPlayingStyle)}
        />
      </View>
      <View className="flex-row flex-wrap gap-3">
        <IdentityFieldCard
          label={t('identity.fields.strongFoot')}
          value={labels.foot(identity.strongFoot)}
          className="min-w-[30%]"
        />
        <View className="min-w-[30%] flex-1">
          <IdentityRatingField
            label={t('identity.fields.weakFoot')}
            value={identity.weakFootRating}
            emptyLabel={labels.notStated}
          />
        </View>
        <View className="min-w-[30%] flex-1">
          <IdentityRatingField
            label={t('identity.fields.skillMoves')}
            value={identity.skillMovesRating}
            emptyLabel={labels.notStated}
          />
        </View>
      </View>
    </ProfileSection>
  );
}
