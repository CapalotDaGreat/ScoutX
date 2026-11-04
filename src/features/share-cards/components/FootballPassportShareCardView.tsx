import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { darkColors } from '@/theme/tokens/colors';
import { type PassportShareCardData } from '@/features/share-cards/services/passportShareCardData';

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

  return (
    <View
      className="overflow-hidden rounded-lg"
      style={{ width: PASSPORT_SHARE_CARD_WIDTH, height: PASSPORT_SHARE_CARD_HEIGHT, backgroundColor: darkColors.background }}
    >
      <View className="px-6 py-4 border-b" style={{ backgroundColor: darkColors.surface, borderColor: darkColors.border }}>
        <Text variant="caption" style={{ color: darkColors.gold }}>
          Football Passport
        </Text>
        <Text weight="semibold" className="text-2xl" numberOfLines={2} adjustsFontSizeToFit style={{ color: darkColors.textPrimary }}>
          {data.playerName}
        </Text>
        <Text variant="body-sm" numberOfLines={2} style={{ color: darkColors.textSecondary }}>
          {data.position} · {data.club} · {data.nationality}
        </Text>
      </View>

      <View className="flex-1 justify-between p-6">
        <View className="flex-row flex-wrap gap-3">
          {stats.map((item) => (
            <View
              key={item.label}
              className="min-w-[45%] flex-1 border-t px-3 py-3"
              style={{ borderColor: darkColors.border }}
            >
              <Text variant="caption" style={{ color: darkColors.textSecondary }}>
                {item.label}
              </Text>
              <Text weight="semibold" className="text-2xl" style={{ color: darkColors.textPrimary }}>
                {item.value}
              </Text>
            </View>
          ))}
        </View>

        <View className="gap-2">
          <Text variant="body-sm" numberOfLines={2} style={{ color: darkColors.textSecondary }}>
            {data.tagline}
          </Text>
          <Text variant="caption" numberOfLines={2} style={{ color: darkColors.accent }}>
            {data.portfolioUrl.replace('https://', '')}
          </Text>
          <Text variant="caption" style={{ color: darkColors.textSecondary }}>
            pitchproof.online · PitchProof Football Passport
          </Text>
        </View>
      </View>
    </View>
  );
}
