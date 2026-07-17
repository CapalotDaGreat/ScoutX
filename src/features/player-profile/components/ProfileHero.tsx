import { Image, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Avatar } from '@/components/primitives/Avatar';
import { Badge } from '@/components/primitives/Badge';
import { Button } from '@/components/primitives/Button';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import {
  AVAILABILITY_OPTIONS,
  TRANSFER_STATUS_OPTIONS,
  getOptionLabel,
} from '@/features/player-profile/constants/footballIdentityOptions';
import { type PlayerProfile } from '@/features/player-profile/types';
import { VerificationBadgeStrip } from '@/features/trust-system';
import { type TrustProfile } from '@/features/trust-system/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type ProfileHeroProps = {
  profile: PlayerProfile;
  trustProfile?: TrustProfile | null;
  onEditPress?: () => void;
};

export function ProfileHero({ profile, trustProfile, onEditPress }: ProfileHeroProps) {
  const { t } = useAppTranslation('portfolio');
  const { identity } = profile;
  const primaryPosition = identity.preferredPositions[0] ?? profile.position;
  const coverUri = profile.coverImageUrl.trim();
  const avatarUri = profile.avatarUrl.trim();

  return (
    <Animated.View
      entering={FadeInUp.duration(500)}
      className="overflow-hidden rounded-3xl border border-gold/30 bg-surface"
    >
      {coverUri ? (
        <Image source={{ uri: coverUri }} className="h-36 w-full" resizeMode="cover" />
      ) : (
        <View className="h-36 w-full bg-gold-muted" />
      )}

      <View className="px-5 pb-5 pt-0">
        <View className="-mt-8 flex-row items-end justify-between">
          <Avatar
            source={avatarUri ? { uri: avatarUri } : undefined}
            name={profile.fullName}
            size="2xl"
            showBorder
            className="border-4 border-surface"
          />
          {onEditPress ? (
            <Button variant="prestige" size="sm" onPress={onEditPress}>
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
            <Heading level={2}>{profile.fullName}</Heading>
            {identity.jerseyNumber ? (
              <Badge label={`#${identity.jerseyNumber}`} variant="prestige" size="sm" />
            ) : null}
            <Badge label={primaryPosition} variant="prestige" />
          </View>
        </View>

        <View className="mt-2 flex-row flex-wrap gap-2">
          <Badge label={identity.currentClub} variant="default" />
          <Badge
            label={getOptionLabel(AVAILABILITY_OPTIONS, identity.availability)}
            variant={identity.availability === 'available' ? 'success' : 'warning'}
            size="sm"
          />
          <Badge
            label={getOptionLabel(TRANSFER_STATUS_OPTIONS, identity.transferStatus)}
            variant="outline"
            size="sm"
          />
        </View>

        {trustProfile ? (
          <View className="mt-2">
            <VerificationBadgeStrip profile={trustProfile} compact />
          </View>
        ) : null}

        <View className="mt-3 flex-row flex-wrap gap-3">
          <Text variant="body-sm" color="secondary">
            {profile.nationality}
          </Text>
          <Text variant="body-sm" color="secondary">
            •
          </Text>
          <Text variant="body-sm" color="secondary">
            {profile.height} · {profile.weight}
          </Text>
          {identity.hasCaptainExperience ? (
            <>
              <Text variant="body-sm" color="secondary">
                •
              </Text>
              <Text variant="body-sm" color="secondary">
                {t('captain')}
              </Text>
            </>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}
