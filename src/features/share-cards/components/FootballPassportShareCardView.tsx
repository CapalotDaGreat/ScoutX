import { Image, View } from 'react-native';
import { PitchSurface } from '@/components/football/PitchSurface';
import { Text } from '@/components/primitives/Text';
import { darkColors } from '@/theme/tokens/colors';
import { type PassportShareCardData } from '@/features/share-cards/services/passportShareCardData';
import { playerInitials } from '@/components/player-card/playerCardPresentation';

export const PASSPORT_SHARE_CARD_WIDTH = 360;
export const PASSPORT_SHARE_CARD_HEIGHT = 480;

export type FootballPassportShareCardViewProps = {
  data: PassportShareCardData;
};

function formatStat(value: number | null): string {
  return value === null ? '—' : String(value);
}

export function FootballPassportShareCardView({ data }: FootballPassportShareCardViewProps) {
  const stats = [
    ...(data.includeStatistics
      ? [
          { label: 'Matches', value: formatStat(data.matches) },
          { label: 'Goals', value: formatStat(data.goals) },
          { label: 'Assists', value: formatStat(data.assists) },
        ]
      : [{ label: 'Stats', value: 'Private' }]),
    ...(data.includeEndorsements
      ? [{ label: 'Endorsements', value: formatStat(data.endorsements) }]
      : [{ label: 'Endorsements', value: 'Private' }]),
  ];

  // The card is an image for other apps, so it uses one fixed scheme and fixed sizes: it must not follow
  // the viewer's theme or text-size setting, or the captured picture would clip.
  const c = darkColors;
  const facts = [data.club, data.nationality].filter((part) => part?.trim()).join(' · ');
  const fixed = { allowFontScaling: false, maxFontSizeMultiplier: 1 } as const;

  return (
    <PitchSurface
      className="rounded-none"
      style={{ width: PASSPORT_SHARE_CARD_WIDTH, height: PASSPORT_SHARE_CARD_HEIGHT, backgroundColor: c.pitch }}
    >
      <View className="flex-1 justify-between p-6">
        <View>
          <Text {...fixed} variant="caption" weight="bold" style={{ color: c.highlight }}>
            Football Passport · profile
          </Text>
          <View className="mt-4 flex-row items-center gap-4">
            {data.includePhoto && data.photoUrl ? (
              <Image
                source={{ uri: data.photoUrl }}
                accessibilityIgnoresInvertColors
                style={{ width: 72, height: 92, borderRadius: 14, backgroundColor: c.pitchRaised }}
              />
            ) : (
              <View
                className="items-center justify-center"
                style={{ width: 72, height: 92, borderRadius: 14, backgroundColor: c.pitchRaised }}
              >
                <Text {...fixed} className="font-display" style={{ color: c.onPitch, fontSize: 28, lineHeight: 32 }}>
                  {playerInitials(data.playerName)}
                </Text>
              </View>
            )}
            <View className="min-w-0 flex-1">
              {data.position?.trim() ? (
                <View className="mb-1.5 self-start rounded-full px-2.5 py-0.5" style={{ backgroundColor: c.highlight }}>
                  <Text {...fixed} variant="caption" weight="bold" numberOfLines={1} style={{ color: c.highlightForeground }}>
                    {data.position}
                  </Text>
                </View>
              ) : null}
              <Text
                {...fixed}
                className="font-display"
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                style={{ color: c.onPitch, fontSize: 34, lineHeight: 36 }}
              >
                {data.playerName}
              </Text>
              {facts ? (
                <Text {...fixed} variant="body-sm" numberOfLines={2} style={{ color: c.onPitchMuted }}>
                  {facts}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        <View className="flex-row flex-wrap gap-2.5">
          {stats.map((item) => (
            <View
              key={item.label}
              className="min-w-[45%] flex-1 rounded-xl px-3 py-2.5"
              style={{ backgroundColor: c.pitchRaised }}
            >
              <Text {...fixed} variant="caption" numberOfLines={1} style={{ color: c.onPitchMuted }}>
                {item.label}
              </Text>
              <Text
                {...fixed}
                className={item.value === 'Private' ? 'font-sans-semibold' : 'font-display'}
                numberOfLines={1}
                style={{ color: c.onPitch, fontSize: item.value === 'Private' ? 16 : 28, lineHeight: 32 }}
              >
                {item.value}
              </Text>
            </View>
          ))}
        </View>

        <View className="gap-1.5">
          {data.tagline?.trim() ? (
            <Text {...fixed} variant="body-sm" numberOfLines={2} style={{ color: c.onPitchMuted }}>
              {data.tagline}
            </Text>
          ) : null}
          <Text {...fixed} variant="body-sm" weight="semibold" numberOfLines={2} style={{ color: c.highlight }}>
            {data.portfolioUrl.replace('https://', '')}
          </Text>
          <Text {...fixed} variant="caption" style={{ color: c.onPitchMuted }}>
            PitchProof Football Passport · player-entered profile
          </Text>
        </View>
      </View>
    </PitchSurface>
  );
}
