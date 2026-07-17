import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { COMPARISON_PLAYER_COLORS } from '@/features/player-comparison/constants';
import { type ComparisonPlayerProfile } from '@/features/player-comparison/types';

export type ComparisonCareerSectionProps = {
  profiles: ComparisonPlayerProfile[];
};

export function ComparisonCareerSection({ profiles }: ComparisonCareerSectionProps) {
  if (profiles.length === 0) {
    return null;
  }

  return (
    <View className="gap-3">
      {profiles.map((profile, index) => (
        <Card key={profile.player.id} variant="outlined" padding="md" className="gap-3">
          <View className="flex-row items-center gap-2">
            <View
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: COMPARISON_PLAYER_COLORS[index] }}
            />
            <Text weight="semibold">{profile.player.fullName}</Text>
            <Text variant="caption" color="secondary">
              · {profile.career.journeyMilestones} milestones
            </Text>
          </View>

          <View className="gap-2">
            <Text variant="caption" color="secondary" className="uppercase">
              Club progression
            </Text>
            {profile.career.clubs.map((club, clubIndex) => (
              <View key={`${profile.player.id}-${club}`} className="flex-row items-center gap-2">
                <View className="h-5 w-5 items-center justify-center rounded-full bg-accent-muted">
                  <Text variant="caption" className="font-sans-bold text-accent">
                    {clubIndex + 1}
                  </Text>
                </View>
                <Text variant="body-sm">{club}</Text>
              </View>
            ))}
          </View>
        </Card>
      ))}
    </View>
  );
}
