import { View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Avatar } from '@/components/primitives/Avatar';
import { Badge } from '@/components/primitives/Badge';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { getRecommendationTypeLabel } from '@/features/trust-system/models/TrustModel';
import { type TrustRecommendation } from '@/features/trust-system/types';
import { CalendarDays, Quote } from 'lucide-react-native';
import { useTheme } from '@/theme';

export type RecommendationCardProps = {
  recommendation: TrustRecommendation;
  index?: number;
};

export function RecommendationCard({ recommendation, index = 0 }: RecommendationCardProps) {
  const { colors } = useTheme();
  const dateLabel = new Date(recommendation.updatedAt).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });

  return (
    <Animated.View entering={FadeInUp.delay(index * 50).duration(350)}>
      <Card variant="outlined" padding="md" className="gap-3">
        <View className="flex-row items-start gap-3">
          <Avatar
            source={{ uri: recommendation.authorAvatarUrl }}
            name={recommendation.authorName}
            size="md"
          />
          <View className="flex-1 gap-1">
            <Text weight="semibold">{recommendation.authorName}</Text>
            <Text variant="body-sm" color="secondary">
              {recommendation.authorTitle}
            </Text>
            <Text variant="caption" color="secondary">
              {recommendation.authorOrganization}
            </Text>
          </View>
          {recommendation.featured ? (
            <Badge label="Featured" variant="accent" size="sm" />
          ) : null}
        </View>

        <View className="flex-row flex-wrap items-center gap-2">
          <Badge
            label={getRecommendationTypeLabel(recommendation.type)}
            variant={recommendation.type === 'coach_recommendation' ? 'info' : 'accent'}
            size="sm"
          />
          {recommendation.category ? (
            <Badge label={recommendation.category} variant="outline" size="sm" />
          ) : null}
          {recommendation.yearsKnown ? (
            <Badge
              label={`${recommendation.yearsKnown} yr${recommendation.yearsKnown === 1 ? '' : 's'} known`}
              variant="outline"
              size="sm"
            />
          ) : null}
        </View>

        <Text variant="caption" color="secondary">
          {recommendation.relationship}
        </Text>

        {recommendation.headline ? (
          <Text weight="semibold">{recommendation.headline}</Text>
        ) : null}

        <View className="flex-row gap-2">
          <View className="mt-0.5">
            <Quote size={16} color={colors.textSecondary} />
          </View>
          <Text variant="body-sm" color="secondary" className="flex-1">
            {recommendation.body}
          </Text>
        </View>

        {recommendation.skills.length > 0 ? (
          <View className="flex-row flex-wrap gap-1.5">
            {recommendation.skills.map((skill) => (
              <Badge key={skill} label={skill} variant="default" size="sm" />
            ))}
          </View>
        ) : null}

        <View className="flex-row items-center gap-1">
          <CalendarDays size={14} color={colors.textSecondary} />
          <Text variant="caption" color="secondary">
            {dateLabel}
          </Text>
        </View>
      </Card>
    </Animated.View>
  );
}
