import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { type CareerReplayData } from '@/features/career-replay/types';

export const CAREER_REPLAY_SHARE_CARD_WIDTH = 360;
export const CAREER_REPLAY_SHARE_CARD_HEIGHT = 450;

export type CareerReplayShareCardViewProps = {
  data: CareerReplayData;
};

export function CareerReplayShareCardView({ data }: CareerReplayShareCardViewProps) {
  return (
    <View
      className="overflow-hidden rounded-3xl bg-[#151617]"
      style={{ width: CAREER_REPLAY_SHARE_CARD_WIDTH, height: CAREER_REPLAY_SHARE_CARD_HEIGHT }}
    >
      <View className="h-2 w-full bg-[#2FBF71]" />
      <View className="h-1 w-full bg-[#D9A441]/40" />

      <View className="flex-1 justify-between p-6">
        <View className="gap-2">
          <View className="self-start rounded-full bg-[#3A3018] px-3 py-1">
            <Text variant="caption" className="text-[#D9A441]">
              PitchProof Career Replay
            </Text>
          </View>
          <Text weight="semibold" className="text-3xl text-[#F7F6F3]">
            {data.playerName}
          </Text>
          <Text variant="body-sm" className="text-[#B7BDC8]">
            {data.seasonLabel} · {data.position} · {data.club}
          </Text>
        </View>

        <View className="flex-row flex-wrap gap-3">
          {data.highlights.slice(0, 4).map((item) => (
            <View
              key={item.label}
              className="min-w-[45%] flex-1 rounded-2xl bg-[#25282D] px-3 py-3"
            >
              <Text variant="caption" className="uppercase text-[#8B939E]">
                {item.label}
              </Text>
              <Text weight="semibold" className="text-2xl text-[#F7F6F3]">
                {item.value}
              </Text>
            </View>
          ))}
        </View>

        <View className="gap-2">
          <Text variant="body-sm" className="text-[#B7BDC8]">
            {data.narrative}
          </Text>
          {data.bestRating !== null && data.bestRatingOpponent ? (
            <Text variant="caption" className="text-[#D9A441]">
              Best match rating {data.bestRating.toFixed(1)} vs {data.bestRatingOpponent}
            </Text>
          ) : null}
          <Text variant="caption" className="text-[#8B939E]">
            pitchproof.online · Football Passport
          </Text>
        </View>
      </View>
    </View>
  );
}
