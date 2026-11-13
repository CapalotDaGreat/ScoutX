import { View } from 'react-native';
import { BadgeCheck, UserRound } from 'lucide-react-native';

import { Text } from '@/components/primitives/Text';
import { PositionPitch } from '@/components/football/PositionPitch';
import { PlayerCardImage } from './PlayerCardImage';
import { playerInitials } from './playerCardPresentation';
import { useTheme } from '@/theme';

type Props = {
  playerId: string;
  name: string;
  portrait: string;
  position: string | null;
  context: string;
  facts?: string;
  verified?: boolean;
  expanded?: boolean;
  /** Distinguishes trust-backed verification from self-entered profile fields. */
  evidenceNote?: string | null;
  /** 'pitch' when the panel sits on a PitchSurface (profile and Passport heroes). */
  tone?: 'surface' | 'pitch';
  /** Draws the stated position on a small pitch. Off for dense lists. */
  showPositionPitch?: boolean;
  /** Primary position for the pitch marker when `position` lists several. */
  pitchPosition?: string | null;
};

/**
 * The shared identity block of the player-card family (discovery card, scout header, owner
 * profile, public Passport). Explicit identity fields only; the caller controls the public/private
 * boundary. One provenance line says where the identity comes from; it is never implied by colour.
 */
export function PlayerIdentityPanel({
  playerId,
  name,
  portrait,
  position,
  context,
  facts,
  verified = false,
  expanded = false,
  evidenceNote = null,
  tone = 'surface',
  showPositionPitch = false,
  pitchPosition,
}: Props) {
  const { colors } = useTheme();
  const onPitch = tone === 'pitch';
  const ink = onPitch ? colors.onPitch : colors.textPrimary;
  const inkMuted = onPitch ? colors.onPitchMuted : colors.textSecondary;
  const inkQuiet = onPitch ? colors.onPitchMuted : colors.textTertiary;
  const frame = onPitch ? colors.pitchRaised : colors.backgroundSecondary;
  const ProvenanceIcon = verified ? BadgeCheck : UserRound;
  const provenance = evidenceNote
    ?? (verified
      ? 'Trust-verified identity · stats only when public and recorded'
      : 'Player-entered profile · not match-verified analysis');
  return (
    <View className="gap-3">
    <View className="flex-row items-center gap-4">
      <PlayerCardImage playerId={playerId} uri={portrait}
        className={expanded ? 'h-28 w-20 shrink-0 overflow-hidden rounded-xl' : 'h-[88px] w-[68px] shrink-0 overflow-hidden rounded-lg'}
        fallback={<View className="h-full w-full items-center justify-center" style={{ backgroundColor: frame }}>
          <Text className="font-display" style={{ color: inkMuted, fontSize: expanded ? 38 : 28, lineHeight: expanded ? 42 : 32 }}>{playerInitials(name)}</Text>
        </View>} />
      <View className="min-w-0 flex-1 gap-1">
        {position ? (
          <View
            className="self-start rounded-full px-2.5 py-0.5"
            style={{ backgroundColor: onPitch ? colors.highlight : colors.accentMuted }}
          >
            <Text variant="caption" weight="bold" style={{ color: onPitch ? colors.highlightForeground : colors.accent }}>{position}</Text>
          </View>
        ) : null}
        <View className="flex-row items-center gap-2">
          <Text accessibilityRole={expanded ? 'header' : undefined} numberOfLines={expanded ? 3 : 2} className="min-w-0 flex-1 font-display" style={{ color: ink, fontSize: expanded ? 32 : 24, lineHeight: expanded ? 34 : 26 }}>
            {name.trim() || playerInitials(name)}
          </Text>
        </View>
        {context ? <Text variant="body-sm" numberOfLines={2} style={{ color: inkMuted }}>{context}</Text> : null}
        {facts ? <Text variant="caption" numberOfLines={2} style={{ color: inkQuiet }}>{facts}</Text> : null}
        {expanded ? null : (
          <>
        <View className="mt-0.5 flex-row items-start gap-1.5">
          <ProvenanceIcon
            size={14}
            color={verified ? (onPitch ? colors.highlight : colors.verification) : inkQuiet}
            style={{ marginTop: 2 }}
            accessibilityLabel={verified ? 'Verified profile' : undefined}
          />
          <Text variant="caption" numberOfLines={2} className="min-w-0 flex-1" style={{ color: inkQuiet }}>
            {provenance}
          </Text>
        </View>
          </>
        )}
      </View>
      {showPositionPitch ? <PositionPitch position={pitchPosition ?? position} width={expanded ? 52 : 44} tone={tone} /> : null}
    </View>
    {expanded ? (
      <>
        <View className="mt-0.5 flex-row items-start gap-1.5">
          <ProvenanceIcon
            size={14}
            color={verified ? (onPitch ? colors.highlight : colors.verification) : inkQuiet}
            style={{ marginTop: 2 }}
            accessibilityLabel={verified ? 'Verified profile' : undefined}
          />
          <Text variant="caption" numberOfLines={3} className="min-w-0 flex-1" style={{ color: inkQuiet }}>
            {provenance}
          </Text>
        </View>
      </>
    ) : null}
    </View>
  );
}
