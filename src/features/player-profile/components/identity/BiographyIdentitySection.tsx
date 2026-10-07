import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { type FootballIdentity } from '@/features/player-profile/types/footballIdentity';
import { ProfileSection } from '@/features/player-profile/components/identity/ProfileSection';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type BiographyIdentitySectionProps = {
  identity: FootballIdentity;
  biography: string;
};

export function BiographyIdentitySection({ identity, biography }: BiographyIdentitySectionProps) {
  const { t } = useAppTranslation('portfolio');
  return (
    <ProfileSection title={t('profileUi.storyTitle')} subtitle={t('profileUi.storySubtitle')}>
      {identity.biographyHeadline ? (
        <Text variant="body-lg" className="font-sans-semibold">
          {identity.biographyHeadline}
        </Text>
      ) : null}
      <View className="gap-2">
        <Text variant="caption" color="secondary" className="uppercase tracking-wider">
          {t('editModal.biography')}
        </Text>
        <Text variant="body" color="secondary">
          {biography || t('profileUi.biographyEmpty')}
        </Text>
      </View>
    </ProfileSection>
  );
}
