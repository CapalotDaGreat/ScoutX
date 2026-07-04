import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { COMPARISON_PLAYER_COLORS } from '@/features/player-comparison/constants';
import { type ComparisonPlayerProfile } from '@/features/player-comparison/types';

export type ComparisonAchievementsSectionProps = {
  profiles: ComparisonPlayerProfile[];
};

export function ComparisonAchievementsSection({ profiles }: ComparisonAchievementsSectionProps) {
  if (profiles.length === 0) {
    return null;
  }

  const maxAchievements = Math.max(...profiles.map((profile) => profile.career.achievements.length), 0);

  return (
    <View className="gap-3">
      {profiles.map((profile, index) => (
        <Card key={profile.player.id} variant="outlined" padding="md" className="gap-2">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <View
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: COMPARISON_PLAYER_COLORS[index] }}
              />
              <Text weight="semibold">{profile.player.fullName}</Text>
            </View>
            <Text variant="caption" color="secondary">
              {profile.career.achievements.length} honours
            </Text>
          </View>

          {profile.career.achievements.length > 0 ? (
            profile.career.achievements.map((achievement) => (
              <Text key={achievement} variant="body-sm">
                • {achievement}
              </Text>
            ))
          ) : (
            <Text variant="body-sm" color="secondary">
              No honours recorded.
            </Text>
          )}
        </Card>
      ))}

      {maxAchievements > 0 ? (
        <Text variant="caption" color="secondary">
          Side-by-side honours help scouts spot pedigree gaps quickly.
        </Text>
      ) : null}
    </View>
  );
}
