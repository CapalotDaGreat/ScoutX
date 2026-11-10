import { Image, Pressable, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Pencil } from 'lucide-react-native';

import { PitchSurface } from '@/components/football/PitchSurface';
import { PlayerIdentityPanel } from '@/components/player-card/PlayerIdentityPanel';
import { Badge } from '@/components/primitives/Badge';
import { Text } from '@/components/primitives/Text';
import { useIdentityLabels } from '@/features/player-profile/hooks/useIdentityLabels';
import { type PlayerProfile } from '@/features/player-profile/types';
import { VerificationBadgeStrip } from '@/features/trust-system';
import { type TrustProfile } from '@/features/trust-system/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/theme';

export type ProfileHeroProps = {
  profile: PlayerProfile;
  trustProfile?: TrustProfile | null;
  onEditPress?: () => void;
};

/** Owner profile header of the player-card family: identity on the pitch surface, status chips below. */
export function ProfileHero({ profile, trustProfile, onEditPress }: ProfileHeroProps) {
  const { t } = useAppTranslation('portfolio');
  const labels = useIdentityLabels();
  const reduceMotion = useReducedMotion();
  const { colors } = useTheme();
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
  const hasStatus = Boolean(identity.jerseyNumber || identity.availability || identity.transferStatus);

  return (
    <Animated.View entering={reduceMotion ? undefined : FadeInUp.duration(380)}>
      <PitchSurface>
        {coverUri ? (
          <Image source={{ uri: coverUri }} className="h-24 w-full" resizeMode="cover" accessibilityIgnoresInvertColors />
        ) : null}
        <View className="p-4">
          <PlayerIdentityPanel expanded tone="pitch" showPositionPitch playerId={profile.id} name={profile.fullName}
            portrait={avatarUri} position={primaryPosition || null} context={identity.currentClub || profile.club}
            facts={metaParts.join(' · ')}
            evidenceNote="Your profile · self-entered, not match-verified analysis" />
          {onEditPress ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('editProfile')}
              onPress={onEditPress}
              className="mt-4 min-h-[44px] flex-row items-center justify-center gap-2 self-start rounded-full bg-pitch-raised px-4 active:opacity-85"
              style={{ backgroundColor: colors.pitchRaised }}
            >
              <Pencil size={16} color={colors.onPitch} strokeWidth={2} />
              <Text variant="label" weight="semibold" style={{ color: colors.onPitch }}>{t('editProfile')}</Text>
            </Pressable>
          ) : null}
        </View>
      </PitchSurface>

      {identity.biographyHeadline ? (
        <Text variant="body" color="secondary" className="mt-4">
          {identity.biographyHeadline}
        </Text>
      ) : null}
      {hasStatus ? (
        <View className="mt-3 flex-row flex-wrap items-center gap-2">
          {identity.jerseyNumber ? <Badge label={`#${identity.jerseyNumber}`} variant="default" size="sm" /> : null}
          {identity.availability ? (
            <Badge
              label={labels.availability(identity.availability)}
              variant={identity.availability === 'available' ? 'success' : 'warning'}
              size="sm"
            />
          ) : null}
          {identity.transferStatus ? (
            <Badge label={labels.transfer(identity.transferStatus)} variant="info" size="sm" />
          ) : null}
        </View>
      ) : null}
      {trustProfile ? (
        <View className="mt-3">
          <VerificationBadgeStrip profile={trustProfile} compact />
        </View>
      ) : null}
    </Animated.View>
  );
}
