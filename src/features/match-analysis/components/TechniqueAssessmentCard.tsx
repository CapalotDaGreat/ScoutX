import { View } from 'react-native';
import { Badge } from '@/components/primitives/Badge';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { StarRating } from '@/components/primitives/StarRating';
import { Text } from '@/components/primitives/Text';
import { compareWithSelfRating } from '@/features/match-analysis/services/techniqueAssessment';
import { type TechniqueAssessment, type TechniqueRating } from '@/features/match-analysis/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type TechniqueAssessmentCardProps = {
  assessment: TechniqueAssessment | null;
  frameTimestamps: Record<string, number>;
  onSeek: (timestampSec: number) => void;
};

function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds) % 60).padStart(2, '0')}`;
}

function RatingRow({
  rating,
  frameTimestamps,
  onSeek,
  comparison,
}: {
  rating: TechniqueRating;
  frameTimestamps: Record<string, number>;
  onSeek: (timestampSec: number) => void;
  comparison: ReturnType<typeof compareWithSelfRating>;
}) {
  const { t } = useAppTranslation('matchAnalysis');
  const label = t(`technique.dimensions.${rating.dimension}`);
  const cited = rating.frameIds
    .map((id) => frameTimestamps[id])
    .filter((value): value is number => typeof value === 'number');

  return (
    <View className="gap-2 rounded-xl border border-border px-3 py-3">
      <View className="flex-row items-center justify-between gap-2">
        <Text weight="semibold">{label}</Text>
        {rating.stars !== null ? (
          <StarRating value={rating.stars} size="sm" label={label} />
        ) : (
          <Text variant="caption" color="tertiary">
            {t(`technique.status.${rating.status}`)}
          </Text>
        )}
      </View>
      {rating.summary ? <Text variant="body-sm">{rating.summary}</Text> : null}
      {rating.tip ? (
        <Text variant="body-sm" color="secondary">
          {t('technique.tip', { tip: rating.tip })}
        </Text>
      ) : null}
      {comparison ? (
        <Badge
          variant={comparison.result === 'matches' ? 'success' : 'warning'}
          size="sm"
          label={t(`technique.compare.${comparison.result}`, {
            self: comparison.self,
            footage: comparison.footage,
          })}
        />
      ) : null}
      {cited.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {cited.map((timestampSec) => (
            <Button
              key={`${rating.dimension}-${timestampSec}`}
              variant="ghost"
              size="sm"
              onPress={() => onSeek(timestampSec)}
              accessibilityLabel={t('technique.seekA11y', { time: formatClock(timestampSec) })}
            >
              {formatClock(timestampSec)}
            </Button>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function TechniqueAssessmentCard({
  assessment,
  frameTimestamps,
  onSeek,
}: TechniqueAssessmentCardProps) {
  const { t } = useAppTranslation('matchAnalysis');

  if (!assessment) {
    return (
      <Card padding="lg" className="gap-2">
        <Heading level={3}>{t('technique.title')}</Heading>
        <Text variant="body-sm" color="secondary">
          {t('technique.unavailable')}
        </Text>
      </Card>
    );
  }

  const identityMissing = assessment.ratings.every(
    (rating) => rating.status === 'identity_unconfirmed',
  );

  return (
    <Card padding="lg" className="gap-3">
      <View className="gap-1">
        <Heading level={3}>{t('technique.title')}</Heading>
        <Text variant="caption" color="secondary">
          {t('technique.basis')}
        </Text>
      </View>
      {identityMissing ? (
        <Text variant="body-sm" color="secondary">
          {t('technique.identityRequired')}
        </Text>
      ) : (
        <>
          {assessment.overallSummary ? (
            <Text variant="body-sm">{assessment.overallSummary}</Text>
          ) : null}
          {assessment.ratedCount === 0 ? (
            <Text variant="body-sm" color="secondary">
              {t('technique.noneRated')}
            </Text>
          ) : null}
          {assessment.ratings.map((rating) => (
            <RatingRow
              key={rating.dimension}
              rating={rating}
              frameTimestamps={frameTimestamps}
              onSeek={onSeek}
              comparison={
                rating.dimension === 'weakFoot' || rating.dimension === 'skillMoves'
                  ? compareWithSelfRating(assessment, rating.dimension)
                  : null
              }
            />
          ))}
        </>
      )}
    </Card>
  );
}
