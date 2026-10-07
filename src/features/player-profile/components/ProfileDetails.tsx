import { View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { ProfileField } from '@/features/player-profile/components/ProfileField';
import { ProfileSection } from '@/features/player-profile/components/identity/ProfileSection';
import { type PlayerProfile } from '@/features/player-profile/types';
import { type PreferredFoot } from '@/features/player-profile/types/footballIdentity';
import { useIdentityLabels } from '@/features/player-profile/hooks/useIdentityLabels';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useReducedMotion } from '@/hooks/useReducedMotion';

function isPreferredFoot(value: string): value is PreferredFoot {
  return value === 'left' || value === 'right' || value === 'both';
}

export type ProfileDetailsProps = {
  profile: PlayerProfile;
};

export function ProfileDetails({ profile }: ProfileDetailsProps) {
  const { t } = useAppTranslation('portfolio');
  const labels = useIdentityLabels();
  const reduceMotion = useReducedMotion();
  const orUnknown = (value: string) => value.trim() || labels.notStated;
  const foot = profile.preferredFoot.trim().toLowerCase();
  return (
    <Animated.View entering={reduceMotion ? undefined : FadeInUp.delay(150).duration(500)}>
      <ProfileSection title={t('profileUi.physicalTitle')} subtitle={t('profileUi.physicalSubtitle')}>
        <View className="flex-row flex-wrap gap-3">
          <ProfileField label={t('editModal.nationality')} value={orUnknown(profile.nationality)} />
          <ProfileField label={t('editModal.height')} value={orUnknown(profile.height)} />
          <ProfileField label={t('editModal.weight')} value={orUnknown(profile.weight)} />
          <ProfileField
            label={t('identity.fields.strongFoot')}
            value={isPreferredFoot(foot) ? labels.foot(foot) : orUnknown(profile.preferredFoot)}
          />
        </View>
      </ProfileSection>
    </Animated.View>
  );
}
