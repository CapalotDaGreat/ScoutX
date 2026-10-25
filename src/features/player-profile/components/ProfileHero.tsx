import { Image, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { PlayerIdentityPanel } from '@/components/player-card/PlayerIdentityPanel';
import { Badge } from '@/components/primitives/Badge';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { useIdentityLabels } from '@/features/player-profile/hooks/useIdentityLabels';
import { type PlayerProfile } from '@/features/player-profile/types';
import { VerificationBadgeStrip } from '@/features/trust-system';
import { type TrustProfile } from '@/features/trust-system/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export type ProfileHeroProps = {
  profile: PlayerProfile;
  trustProfile?: TrustProfile | null;
  onEditPress?: () => void;
};

export function ProfileHero({ profile, trustProfile, onEditPress }: ProfileHeroProps) {
  const { t } = useAppTranslation('portfolio');
  const labels = useIdentityLabels();
  const reduceMotion = useReducedMotion();
  const { identity } = profile;
  const primaryPosition = identity.preferredPositions[0] ?? profile.position;
  const bodyLine = [profile.height, profile.weight].filter(Boolean).join(' · ');
  const metaParts = [
    profile.nationality,
    bodyLine,
    identity.hasCaptainExperience ? t('captain') : '',
  ].filter(Boolean);
  const coverUri = profile.coverImageUrl.trim();
  const avatarUri = profile.avatarUrl.trim();

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInUp.duration(500)}
      className="overflow-hidden border-b border-border bg-surface"
    >
      {coverUri ? (
        <Image source={{ uri: coverUri }} className="h-28 w-full" resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : null}

      <View className="px-4 py-4">
        <PlayerIdentityPanel expanded playerId={profile.id} name={profile.fullName} portrait={avatarUri}
          position={primaryPosition || null} context={identity.currentClub || profile.club}
          facts={metaParts.join(' · ')} />
        <View className="mt-3 flex-row flex-wrap items-center justify-between gap-3">
          <Text variant="caption" color="secondary" className="min-w-0 flex-1">{t('passportHero.selfReportedNote')}</Text>
          {onEditPress ? (
            <Button variant="secondary" size="sm" onPress={onEditPress}>
              {t('editProfile')}
            </Button>
          ) : null}
        </View>

        <View className="mt-4 gap-2">
          {identity.biographyHeadline ? (
            <Text variant="body-sm" color="secondary">
              {identity.biographyHeadline}
            </Text>
          ) : null}
          <View className="flex-row flex-wrap items-center gap-2">
            {identity.jerseyNumber ? (
              <Badge label={`#${identity.jerseyNumber}`} variant="prestige" size="sm" />
            ) : null}
          </View>
        </View>

        {identity.currentClub || identity.availability || identity.transferStatus ? (
          <View className="mt-2 flex-row flex-wrap gap-2">
            {identity.currentClub ? (
              <Badge label={identity.currentClub} variant="default" />
            ) : null}
            {identity.availability ? (
              <Badge
                label={labels.availability(identity.availability)}
                variant={identity.availability === 'available' ? 'success' : 'warning'}
                size="sm"
              />
            ) : null}
            {identity.transferStatus ? (
              <Badge
                label={labels.transfer(identity.transferStatus)}
                variant="outline"
                size="sm"
              />
            ) : null}
          </View>
        ) : null}

        {trustProfile ? (
          <View className="mt-2">
            <VerificationBadgeStrip profile={trustProfile} compact />
          </View>
        ) : null}

        {metaParts.length > 0 ? (
          <Text variant="body-sm" color="secondary" className="mt-3">
            {metaParts.join('  •  ')}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}
