import { View } from 'react-native';
import { IdentityTagList } from '@/features/player-profile/components/identity/IdentityTagList';
import { IdentityFieldCard } from '@/features/player-profile/components/identity/IdentityFieldCard';
import { ProfileSection } from '@/features/player-profile/components/identity/ProfileSection';
import { useIdentityLabels } from '@/features/player-profile/hooks/useIdentityLabels';
import { type FootballIdentity } from '@/features/player-profile/types/footballIdentity';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type PersonalIdentitySectionProps = {
  identity: FootballIdentity;
};

export function PersonalIdentitySection({ identity }: PersonalIdentitySectionProps) {
  const { t } = useAppTranslation('portfolio');
  const labels = useIdentityLabels();

  return (
    <ProfileSection
      title={t('identity.sectionTitles.personal.title')}
      subtitle={t('identity.sectionTitles.personal.subtitle')}
    >
      <View className="flex-row flex-wrap gap-3">
        <IdentityFieldCard
          label={t('identity.fields.jerseyNumber')}
          value={identity.jerseyNumber != null ? String(identity.jerseyNumber) : labels.notStated}
        />
        <IdentityFieldCard
          label={t('identity.fields.captain')}
          value={identity.hasCaptainExperience ? t('identity.yes') : t('identity.no')}
        />
      </View>
      <IdentityFieldCard
        label={t('identity.fields.academicStatus')}
        value={labels.academic(identity.academicStatus)}
        className="min-w-full"
      />
      <IdentityTagList
        label={t('identity.fields.languages')}
        values={identity.languagesSpoken}
        emptyLabel={labels.notStated}
      />
    </ProfileSection>
  );
}
