import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { darkColors } from '@/theme/tokens/colors';
import { type CareerReplayData } from '@/features/career-replay/types';

export const CAREER_REPLAY_SHARE_CARD_WIDTH = 360;
export const CAREER_REPLAY_SHARE_CARD_HEIGHT = 450;

export type CareerReplayShareCardViewProps = {
  data: CareerReplayData;
};

export function CareerReplayShareCardView({ data }: CareerReplayShareCardViewProps) {
  return (
    <View
      className="overflow-hidden rounded-lg"
      style={{ width: CAREER_REPLAY_SHARE_CARD_WIDTH, height: CAREER_REPLAY_SHARE_CARD_HEIGHT, backgroundColor: darkColors.background }}
    >
      <View className="h-1 w-full" style={{ backgroundColor: darkColors.accent }} />

      <View className="flex-1 justify-between p-6">
        <View className="gap-2">
          <View className="self-start">
            <Text variant="caption" style={{ color: darkColors.gold }}>
              PitchProof Career Replay
            </Text>
          </View>
          <Text weight="semibold" className="text-2xl" numberOfLines={2} adjustsFontSizeToFit style={{ color: darkColors.textPrimary }}>
            {data.playerName}
          </Text>
          <Text variant="body-sm" numberOfLines={2} style={{ color: darkColors.textSecondary }}>
            {data.seasonLabel} · {data.position} · {data.club}
          </Text>
        </View>

        <View className="flex-row flex-wrap gap-3">
          {data.highlights.slice(0, 4).map((item) => (
            <View
              key={item.label}
              className="min-w-[45%] flex-1 border-t px-3 py-3"
              style={{ borderColor: darkColors.border }}
            >
              <Text variant="caption" numberOfLines={1} style={{ color: darkColors.textSecondary }}>
                {item.label}
              </Text>
              <Text weight="semibold" className="text-2xl" style={{ color: darkColors.textPrimary }}>
                {item.value}
              </Text>
            </View>
          ))}
        </View>

        <View className="gap-2">
          <Text variant="body-sm" numberOfLines={3} style={{ color: darkColors.textSecondary }}>
            {data.narrative}
          </Text>
          {data.bestRating !== null && data.bestRatingOpponent ? (
            <Text variant="caption" numberOfLines={2} style={{ color: darkColors.gold }}>
              Best match rating {data.bestRating.toFixed(1)} vs {data.bestRatingOpponent}
            </Text>
          ) : null}
          <Text variant="caption" style={{ color: darkColors.textSecondary }}>
            pitchproof.online · Football Passport
          </Text>
        </View>
      </View>
    </View>
  );
}
