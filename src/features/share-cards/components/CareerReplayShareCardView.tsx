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
      className="overflow-hidden rounded-3xl bg-neutral-950"
      style={{ width: CAREER_REPLAY_SHARE_CARD_WIDTH, height: CAREER_REPLAY_SHARE_CARD_HEIGHT }}
    >
      <View className="flex-1 justify-between p-6">
        <View className="gap-2">
          <View className="self-start rounded-full bg-green-950 px-3 py-1">
            <Text variant="caption" className="text-green-300">
              ScoutX Career Replay
            </Text>
          </View>
          <Text weight="semibold" className="text-3xl text-white">
            {data.playerName}
          </Text>
          <Text variant="body-sm" className="text-neutral-400">
            {data.seasonLabel} · {data.position} · {data.club}
          </Text>
        </View>

        <View className="flex-row flex-wrap gap-3">
          {data.highlights.slice(0, 4).map((item) => (
            <View
              key={item.label}
              className="min-w-[45%] flex-1 rounded-2xl bg-neutral-900 px-3 py-3"
            >
              <Text variant="caption" className="uppercase text-neutral-500">
                {item.label}
              </Text>
              <Text weight="semibold" className="text-2xl text-white">
                {item.value}
              </Text>
            </View>
          ))}
        </View>

        <View className="gap-2">
          <Text variant="body-sm" className="text-neutral-300">
            {data.narrative}
          </Text>
          {data.bestRating !== null && data.bestRatingOpponent ? (
            <Text variant="caption" className="text-green-300">
              Best match rating {data.bestRating.toFixed(1)} vs {data.bestRatingOpponent}
            </Text>
          ) : null}
          <Text variant="caption" className="text-neutral-600">
            scoutx.app · Football Passport
          </Text>
        </View>
      </View>
    </View>
  );
}
