import { View } from 'react-native';
import { VerificationBadge } from '@/features/trust-system/components/VerificationBadge';
import { type TrustEntityType, type TrustProfile } from '@/features/trust-system/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type VerificationBadgeStripProps = {
  profile: TrustProfile;
  compact?: boolean;
};

export function VerificationBadgeStrip({ profile, compact = false }: VerificationBadgeStripProps) {
  const { t } = useAppTranslation('trust');
  const badges: Array<{ entity: TrustEntityType; label?: string }> = [];

  if (profile.player.verified) {
    badges.push({ entity: 'player' });
  }
  if (profile.scout.verified) {
    badges.push({ entity: 'scout' });
  }
  if (profile.club.verified) {
    badges.push({
      entity: 'club',
      label: profile.club.clubName
        ? t('entityWithClub', { club: profile.club.clubName })
        : t('entity.club'),
    });
  }
  if (profile.coach?.verified) {
    badges.push({ entity: 'coach' });
  }

  if (badges.length === 0) {
    return null;
  }

  return (
    <View className={`flex-row flex-wrap ${compact ? 'gap-1.5' : 'gap-2'}`}>
      {badges.map((badge) => (
        <VerificationBadge
          key={badge.entity}
          entity={badge.entity}
          label={badge.label}
          size={compact ? 'sm' : 'md'}
        />
      ))}
    </View>
  );
}
