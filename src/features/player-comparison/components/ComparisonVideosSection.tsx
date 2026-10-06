import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Badge } from '@/components/primitives/Badge';
import { Text } from '@/components/primitives/Text';
import { COMPARISON_PLAYER_COLORS } from '@/features/player-comparison/constants';
import { type ComparisonPlayerProfile } from '@/features/player-comparison/types';
import { Video } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type ComparisonVideosSectionProps = {
  profiles: ComparisonPlayerProfile[];
};

export function ComparisonVideosSection({ profiles }: ComparisonVideosSectionProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation(['scout']);

  if (profiles.length === 0) {
    return null;
  }

  return (
    <View className="gap-3">
      {profiles.map((profile, index) => (
        <Card key={profile.player.id} variant="default" padding="md" className="gap-3">
          <View className="flex-row items-center gap-2">
            <View
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: COMPARISON_PLAYER_COLORS[index] }}
            />
            <Text weight="semibold">{profile.player.fullName}</Text>
          </View>

          <View className="flex-row items-start gap-3">
            <Video size={22} color={colors.accent} />
            <View className="flex-1 gap-2">
              {profile.videos ? (
                <>
                  <Text variant="body-sm" className="font-sans-semibold">
                    {profile.videos.featuredTitle ?? t('scout:comparison.videosOnFile')}
                  </Text>
                  <Text variant="caption" color="secondary">
                    {profile.videos.videoCount !== null
                      ? t('scout:comparison.videoCount', { count: profile.videos.videoCount })
                      : t('scout:comparison.videoCountUnknown')}
                  </Text>
                  {profile.videos.categories.length > 0 ? (
                    <View className="flex-row flex-wrap gap-2">
                      {profile.videos.categories.map((category) => (
                        <Badge key={category} label={category} variant="default" size="sm" />
                      ))}
                    </View>
                  ) : null}
                </>
              ) : (
                <Text variant="body-sm" color="secondary">
                  {t('scout:comparison.noVideos')}
                </Text>
              )}
            </View>
          </View>
        </Card>
      ))}
    </View>
  );
}
