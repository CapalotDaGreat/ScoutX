import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { ClubHistoryList } from '@/features/player-profile/components/identity/ClubHistoryList';
import { ProfileSection } from '@/features/player-profile/components/identity/ProfileSection';
import { type FootballIdentity } from '@/features/player-profile/types/footballIdentity';
import { useIdentityLabels } from '@/features/player-profile/hooks/useIdentityLabels';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type CareerIdentitySectionProps = {
  identity: FootballIdentity;
};

export function CareerIdentitySection({ identity }: CareerIdentitySectionProps) {
  const { t } = useAppTranslation('portfolio');
  const labels = useIdentityLabels();
  return (
    <>
      <ProfileSection title={t('profileUi.currentClubTitle')} subtitle={t('profileUi.currentClubSubtitle')}>
        <View className="rounded-xl border border-border bg-background-secondary/70 px-4 py-4">
          <Text variant="body-lg" className="font-sans-semibold">
            {identity.currentClub.trim() || labels.notStated}
          </Text>
        </View>
      </ProfileSection>

      <ProfileSection title={t('profileUi.clubHistoryTitle')} subtitle={t('profileUi.clubHistorySubtitle')}>
        <ClubHistoryList entries={identity.clubHistory} />
      </ProfileSection>
    </>
  );
}
