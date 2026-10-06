import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { FreshnessLabel } from '@/components/evidence/FreshnessLabel';
import type { FootballStory, YearInReviewSnapshot } from '@/features/career-story/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type CareerStorySectionProps = {
  story: FootballStory;
  snapshot: YearInReviewSnapshot;
};

export function CareerStorySection({ story, snapshot }: CareerStorySectionProps) {
  const { t } = useAppTranslation(['career']);

  return (
    <Card variant="outlined" padding="md" className="gap-3">
      <Text variant="body" className="font-sans-semibold">
        {t('career:yearInReview')} · {snapshot.year}
      </Text>
      <FreshnessLabel updatedAt={snapshot.generatedAt} sampleSize={snapshot.momentCount} />
      <Text variant="body-sm" color="secondary">
        {snapshot.momentCount === 0 ? t('career:yearEmpty') : snapshot.narrative.text}
      </Text>
      <Text variant="caption" color="secondary">
        {t('career:storyLabel')}
      </Text>
      <Text variant="body" className="font-sans-semibold">
        {t('career:storyTitle')}
      </Text>
      {story.paragraphs.length === 0 ? (
        <Text variant="body-sm" color="secondary">
          {t('career:storyEmpty')}
        </Text>
      ) : (
        story.paragraphs.map((paragraph) => (
          <Text key={paragraph} variant="body-sm">
            {paragraph}
          </Text>
        ))
      )}
    </Card>
  );
}
