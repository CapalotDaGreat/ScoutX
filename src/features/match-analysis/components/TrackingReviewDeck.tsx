import { useRef, useState } from 'react';
import { Animated, Image, PanResponder, View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { useStorageUrls } from '@/features/match-analysis/hooks/useTracking';
import {
  answerTrackingQuestion,
  formatClock,
  minutes,
  nextQuestion,
  undoTrackingAnswer,
  type TrackingAnswer,
  type TrackingReport,
} from '@/features/match-analysis/services/trackingV3Service';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { triggerHaptic } from '@/utils/haptics';

const SWIPE_DISTANCE = 110;

export type TrackingReviewDeckProps = {
  jobId: string;
  report: TrackingReport;
  /** True while the server re-solves after an answer (stats are stale). */
  updating: boolean;
};

/**
 * "Is this you?" cards. Swipe right = yes, left = not me; buttons for unsure / skip / undo.
 * Answers only change this match's analysis and are never used to train models.
 */
export function TrackingReviewDeck({ jobId, report, updating }: TrackingReviewDeckProps) {
  const { t } = useAppTranslation('matchAnalysis');
  const [answered, setAnswered] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const question = nextQuestion(report, answered);
  const urls = useStorageUrls([question?.imagePath, report.referenceImagePath]);
  const pan = useRef(new Animated.ValueXY()).current;
  const remaining = report.reviewQuestions.filter((q) => !answered.has(q.id)).length;

  const submit = async (answer: TrackingAnswer) => {
    if (!question || busy) return;
    setBusy(true);
    setError(null);
    try {
      await answerTrackingQuestion(jobId, question.id, answer);
      void triggerHaptic('light').catch(() => undefined);
      setAnswered((prev) => new Set(prev).add(question.id));
    } catch {
      setError(t('tracking.review.error'));
    } finally {
      pan.setValue({ x: 0, y: 0 });
      setBusy(false);
    }
  };

  // The responder is created once; it always calls the latest submit through this ref.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  const responder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderMove: Animated.event([null, { dx: pan.x }], { useNativeDriver: false }),
    onPanResponderRelease: (_e, g) => {
      if (g.dx > SWIPE_DISTANCE) void submitRef.current('yes');
      else if (g.dx < -SWIPE_DISTANCE) void submitRef.current('not_me');
      else Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
    },
  })).current;

  if (report.reviewQuestions.length === 0) return null;
  const rotate = pan.x.interpolate({ inputRange: [-200, 0, 200], outputRange: ['-8deg', '0deg', '8deg'] });

  return (
    <Card className="gap-3">
      <Heading level={3}>{t('tracking.review.title')}</Heading>
      <Text color="secondary" variant="caption">{t('tracking.review.subtitle')}</Text>
      {updating ? <Text color="warning" variant="caption">{t('tracking.review.updating')}</Text> : null}
      {question ? (
        <>
          <Animated.View
            {...responder.panHandlers}
            accessibilityRole="adjustable"
            accessibilityLabel={t('tracking.review.cardA11y', { time: formatClock(question.t) })}
            style={{ transform: [{ translateX: pan.x }, { rotate }] }}
          >
            <View className="flex-row gap-3">
              <View className="flex-1 items-center">
                <Text variant="caption" color="secondary">{t('tracking.review.candidate')}</Text>
                {urls[question.imagePath ?? ''] ? (
                  <Image source={{ uri: urls[question.imagePath ?? ''] }} style={{ width: 140, height: 200, borderRadius: 10 }} resizeMode="contain" />
                ) : (
                  <View style={{ width: 140, height: 200 }} className="items-center justify-center rounded-md bg-background-secondary">
                    <Text variant="caption" color="tertiary">{formatClock(question.t)}</Text>
                  </View>
                )}
              </View>
              {report.referenceImagePath && urls[report.referenceImagePath] ? (
                <View className="flex-1 items-center">
                  <Text variant="caption" color="secondary">{t('tracking.review.reference')}</Text>
                  <Image source={{ uri: urls[report.referenceImagePath] }} style={{ width: 140, height: 200, borderRadius: 10 }} resizeMode="contain" />
                </View>
              ) : null}
            </View>
          </Animated.View>
          <Text weight="semibold">{t('tracking.review.question', { number: report.target.number ?? '' , time: formatClock(question.t) })}</Text>
          <Text variant="caption" color="secondary">
            {t('tracking.review.affects', { minutes: minutes(question.affectedSec) })} · {t('tracking.review.remaining', { count: remaining })}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <Button size="sm" onPress={() => void submit('yes')} disabled={busy} accessibilityLabel={t('tracking.review.yes')}>{t('tracking.review.yes')}</Button>
            <Button size="sm" variant="destructive" onPress={() => void submit('not_me')} disabled={busy}>{t('tracking.review.notMe')}</Button>
            <Button size="sm" variant="ghost" onPress={() => void submit('unsure')} disabled={busy}>{t('tracking.review.unsure')}</Button>
            <Button size="sm" variant="ghost" onPress={() => void submit('skip')} disabled={busy}>{t('tracking.review.skip')}</Button>
          </View>
        </>
      ) : (
        <Text>{t('tracking.review.done')}</Text>
      )}
      {answered.size > 0 ? (
        <Button size="sm" variant="link" disabled={busy} onPress={() => {
          setBusy(true);
          void undoTrackingAnswer(jobId).then(() => setAnswered(new Set())).catch(() => setError(t('tracking.review.error')))
            .finally(() => setBusy(false));
        }}>{t('tracking.review.undo')}</Button>
      ) : null}
      {error ? <Text color="error" variant="caption">{error}</Text> : null}
      <Text variant="caption" color="tertiary">{t('tracking.review.privacy')}</Text>
    </Card>
  );
}
