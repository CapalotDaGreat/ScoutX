import { Pressable, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { PlayerCardImage } from '@/components/player-card/PlayerCardImage';
import { playerInitials } from '@/components/player-card/playerCardPresentation';
import { Text } from '@/components/primitives/Text';
import { type PlayerProfile } from '@/features/player-profile/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';

type Props = {
  profile: PlayerProfile;
  onOpenPassport: () => void;
};

/** Compact "who am I" row on Home > Today. The full profile lives one tap away in the Passport segment. */
export function HomeIdentityStrip({ profile, onOpenPassport }: Props) {
  const { t } = useAppTranslation('portfolio');
  const { colors } = useTheme();
  const position = profile.identity.preferredPositions[0] ?? profile.position;
  const club = profile.identity.currentClub || profile.club;
  const context = [position, club].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${profile.fullName}. ${t('homeIdentity.openPassport')}`}
      onPress={onOpenPassport}
      className="min-h-[64px] flex-row items-center gap-3 rounded-xl bg-pitch px-3 py-2.5 active:opacity-90"
      style={{ backgroundColor: colors.pitch }}
    >
      <PlayerCardImage playerId={profile.id} uri={profile.avatarUrl}
        className="h-11 w-11 shrink-0 overflow-hidden rounded-full"
        fallback={<View className="h-full w-full items-center justify-center" style={{ backgroundColor: colors.pitchRaised }}>
          <Text className="font-display" style={{ color: colors.onPitch, fontSize: 18, lineHeight: 22 }}>{playerInitials(profile.fullName)}</Text>
        </View>} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="font-display" style={{ color: colors.onPitch, fontSize: 22, lineHeight: 24 }}>
          {profile.fullName.trim() || playerInitials(profile.fullName)}
        </Text>
        {context ? (
          <Text variant="caption" numberOfLines={1} style={{ color: colors.onPitchMuted }}>{context}</Text>
        ) : null}
      </View>
      <Text variant="caption" weight="semibold" style={{ color: colors.highlight }}>{t('homeSegments.passport')}</Text>
      <ChevronRight size={18} color={colors.highlight} strokeWidth={2} />
    </Pressable>
  );
}
