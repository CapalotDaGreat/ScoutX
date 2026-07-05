import { View } from 'react-native';
import { VerificationBadge } from '@/features/trust-system/components/VerificationBadge';
import { getVerificationLabel } from '@/features/trust-system/models/TrustModel';
import { type TrustProfile } from '@/features/trust-system/types';

export type VerificationBadgeStripProps = {
  profile: TrustProfile;
  compact?: boolean;
};

export function VerificationBadgeStrip({ profile, compact = false }: VerificationBadgeStripProps) {
  const badges: Array<{ entity: 'player' | 'scout' | 'club'; label?: string }> = [];

  if (profile.player.verified) {
    badges.push({ entity: 'player' });
  }
  if (profile.scout.verified) {
    badges.push({ entity: 'scout' });
  }
  if (profile.club.verified) {
    badges.push({
      entity: 'club',
      label: getVerificationLabel('club', profile),
    });
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
