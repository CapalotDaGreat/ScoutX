import { View } from 'react-native';
import { Badge } from '@/components/primitives/Badge';
import { Text } from '@/components/primitives/Text';
import { IdentityTagList } from '@/features/player-profile/components/identity/IdentityTagList';
import { ProfileSection } from '@/features/player-profile/components/identity/ProfileSection';
import { useIdentityLabels } from '@/features/player-profile/hooks/useIdentityLabels';
import { type FootballIdentity } from '@/features/player-profile/types/footballIdentity';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type ProfessionalIdentitySectionProps = {
  identity: FootballIdentity;
};

export function ProfessionalIdentitySection({ identity }: ProfessionalIdentitySectionProps) {
  const { t } = useAppTranslation('portfolio');
  const labels = useIdentityLabels();
  const hasStatus = Boolean(
    identity.contractStatus || identity.availability || identity.transferStatus,
  );

  return (
    <ProfileSection
      title={t('identity.sectionTitles.professional.title')}
      subtitle={t('identity.sectionTitles.professional.subtitle')}
    >
      {hasStatus ? (
        <View className="flex-row flex-wrap gap-2">
          {identity.contractStatus ? (
            <Badge label={labels.contract(identity.contractStatus)} variant="default" />
          ) : null}
          {identity.availability ? (
            <Badge
              label={labels.availability(identity.availability)}
              variant={identity.availability === 'available' ? 'success' : 'warning'}
            />
          ) : null}
          {identity.transferStatus ? (
            <Badge label={labels.transfer(identity.transferStatus)} variant="accent" />
          ) : null}
        </View>
      ) : (
        <Text variant="body-sm" color="secondary">
          {labels.notStated}
        </Text>
      )}
      <IdentityTagList
        label={t('identity.fields.preferredCountries')}
        values={identity.preferredCountries}
        emptyLabel={labels.notStated}
      />
      <IdentityTagList
        label={t('identity.fields.preferredLeagues')}
        values={identity.preferredLeagues}
        emptyLabel={labels.notStated}
      />
    </ProfileSection>
  );
}
