import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { type PassportShareCardData } from '@/features/share-cards/services/passportShareCardData';

export const PASSPORT_SHARE_CARD_WIDTH = 360;
export const PASSPORT_SHARE_CARD_HEIGHT = 480;

export type FootballPassportShareCardViewProps = {
  data: PassportShareCardData;
};

export function FootballPassportShareCardView({ data }: FootballPassportShareCardViewProps) {
  const stats = [
    { label: 'Matches', value: String(data.matches) },
    { label: 'Goals', value: String(data.goals) },
    { label: 'Assists', value: String(data.assists) },
    { label: 'Endorsements', value: String(data.endorsements) },
  ];

  return (
    <View
      className="overflow-hidden rounded-3xl bg-[#151617]"
      style={{ width: PASSPORT_SHARE_CARD_WIDTH, height: PASSPORT_SHARE_CARD_HEIGHT }}
    >
      <View className="bg-[#1C1E22] px-6 py-4 border-b border-[#2F343A]">
        <Text variant="caption" className="uppercase tracking-widest text-[#D9A441]">
          Football Passport
        </Text>
        <Text weight="semibold" className="text-3xl text-[#F7F6F3]">
          {data.playerName}
        </Text>
        <Text variant="body-sm" className="text-[#B7BDC8]">
          {data.position} · {data.club} · {data.nationality}
        </Text>
      </View>

      <View className="flex-1 justify-between p-6">
        <View className="flex-row flex-wrap gap-3">
          {stats.map((item) => (
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
            {data.tagline}
          </Text>
          <Text variant="caption" className="text-[#2FBF71]">
            {data.portfolioUrl.replace('https://', '')}
          </Text>
          <Text variant="caption" className="text-[#8B939E]">
            pitchproof.online · ScoutX Football Passport
          </Text>
        </View>
      </View>
    </View>
  );
}
