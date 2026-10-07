import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { useSnackbar } from '@/components/feedback/Snackbar';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { useMatchAnalysis } from '@/features/match-analysis/hooks/useMatchAnalysis';
import {
  buildHighlightCandidatesFromReport,
  buildHighlightReelPlan,
} from '@/features/highlight-reel-studio/services/reelCandidateService';
import {
  type HighlightReelPreset,
  type HighlightCandidate,
} from '@/features/highlight-reel-studio/types';

const PRESETS: HighlightReelPreset[] = ['best-of', 'scout', 'social', 'tactical', 'development'];

function CandidateCard({
  candidate,
  onRemove,
  removeLabel,
}: {
  candidate: HighlightCandidate;
  onRemove: () => void;
  removeLabel: string;
}) {
  const { t } = useAppTranslation(['media', 'matchAnalysis']);
  const title = candidate.title || t('media:studio.untitled');
  const evidence = [
    t('media:studio.evidence.confidence', { pct: Math.round(candidate.confidence * 100) }),
    ...(candidate.targetJersey ? [t('media:studio.evidence.jersey', { jersey: candidate.targetJersey })] : []),
    t('media:studio.evidence.coverage', {
      band: candidate.coverageBand
        ? t(`matchAnalysis:band.${candidate.coverageBand}`)
        : t('media:studio.evidence.coverageUnknown'),
    }),
  ];
  return (
    <Card variant="default" padding="md" className="gap-1">
      <View className="flex-row items-center justify-between gap-2">
        <Text weight="semibold" className="min-w-0 flex-1">
          {title}
        </Text>
        <Button
          variant="ghost"
          size="sm"
          accessibilityLabel={`${removeLabel}: ${title}`}
          onPress={onRemove}
        >
          {removeLabel}
        </Button>
      </View>
      <Text variant="caption" color="secondary">
        {t('media:studio.candidateMeta', {
          kind: t(`media:studio.eventKind.${candidate.eventKind}`),
          status: t(candidate.status === 'needs-confirmation' ? 'media:studio.needsReview' : 'media:studio.aiSuggested'),
          pct: Math.round(candidate.confidence * 100),
        })}
      </Text>
      <Text variant="body-sm" color="secondary">
        {candidate.description || t('media:studio.descriptionFallback')}
      </Text>
      <Text variant="caption" color="secondary">
        {t('media:studio.reason')}
      </Text>
      <Text variant="caption" color="secondary">
        {t('media:studio.evidence.line', { items: evidence.join(' · ') })}
      </Text>
    </Card>
  );
}

export type HighlightReelStudioModalProps = {
  visible: boolean;
  playerId: string | null;
  onClose: () => void;
};

export function HighlightReelStudioModal({ visible, playerId, onClose }: HighlightReelStudioModalProps) {
  const { recentJobs } = useMatchAnalysis(playerId);
  const [preset, setPreset] = useState<HighlightReelPreset>('best-of');
  const [targetSeconds, setTargetSeconds] = useState(45);

  const latestCompleteJob = recentJobs.find((job) => job.status === 'complete' && job.report);
  const latestReport = latestCompleteJob?.report;

  const { showSnackbar } = useSnackbar();
  const { t } = useAppTranslation(['media', 'common']);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const latestJobId = latestCompleteJob?.id;

  useEffect(() => {
    setRemovedIds([]);
  }, [latestJobId, visible]);

  const candidates = useMemo(() => {
    if (!latestCompleteJob?.report) {
      return [];
    }
    return buildHighlightCandidatesFromReport(
      latestCompleteJob.report,
      latestCompleteJob.targeting.jerseyNumber,
    ).filter((candidate) => !removedIds.includes(candidate.id));
  }, [latestCompleteJob, removedIds]);

  const removeCandidate = (candidate: HighlightCandidate) => {
    setRemovedIds((current) => [...current, candidate.id]);
    showSnackbar({
      message: t('common:removedItem', { name: candidate.title }),
      actionLabel: t('common:undo'),
      onAction: () => setRemovedIds((current) => current.filter((id) => id !== candidate.id)),
    });
  };

  const reelPlan = useMemo(() => {
    if (!candidates.length) {
      return null;
    }
    return buildHighlightReelPlan(candidates, preset, targetSeconds);
  }, [candidates, preset, targetSeconds]);

  return (
    <Modal visible={visible} onClose={onClose} title={t('media:studio.title')} size="fullscreen">
      <ScrollView className="flex-1" contentContainerStyle={{ gap: 16, paddingBottom: 32 }}>
        <Text variant="body-sm" color="secondary">
          {t('media:studio.intro')}
        </Text>

        <Card variant="default" padding="lg" className="gap-3">
          <Heading level={3}>{t('media:studio.styleTitle')}</Heading>
          <View className="flex-row flex-wrap gap-2">
            {PRESETS.map((item) => (
              <Button
                key={item}
                variant={preset === item ? 'accent' : 'secondary'}
                size="sm"
                accessibilityState={{ selected: preset === item }}
                onPress={() => setPreset(item)}
              >
                {t(`media:studio.preset.${item}.label`)}
              </Button>
            ))}
          </View>
          <Text variant="caption" color="secondary">
            {t('media:studio.targetLength', { seconds: targetSeconds })}
          </Text>
          <Button variant="secondary" size="sm" onPress={() => setTargetSeconds((current) => (current === 45 ? 90 : 45))}>
            {t('media:studio.toggleLength')}
          </Button>
        </Card>

        {latestReport && candidates.length > 0 && reelPlan ? (
          <>
            <Card variant="elevated" padding="lg" className="gap-2">
              <Heading level={3}>{t(`media:studio.preset.${reelPlan.preset}.title`)}</Heading>
              <Text variant="body-sm" color="secondary">
                {t(`media:studio.preset.${reelPlan.preset}.description`)}
              </Text>
              <Text variant="caption" color="secondary">
                {t('media:studio.planMeta', {
                  pct: reelPlan.qualityScore,
                  coverage: t(`media:studio.coverage.${reelPlan.coverage}`),
                })}
              </Text>
            </Card>

            <Card variant="default" padding="lg" className="gap-3">
              <Heading level={3}>{t('media:studio.momentsTitle')}</Heading>
              <View className="gap-2">
                {reelPlan.candidates.map((candidate) => (
                  <CandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    removeLabel={t('common:remove')}
                    onRemove={() => removeCandidate(candidate)}
                  />
                ))}
              </View>
            </Card>
          </>
        ) : latestReport && removedIds.length > 0 ? (
          <Card variant="default" padding="lg">
            <Text variant="body-sm" color="secondary">
              {t('common:allRemoved')}
            </Text>
          </Card>
        ) : (
          <Card variant="default" padding="lg">
            <Text variant="body-sm" color="secondary">
              {t('media:studio.empty')}
            </Text>
          </Card>
        )}

        <Button variant="ghost" onPress={onClose}>
          {t('common:close')}
        </Button>
      </ScrollView>
    </Modal>
  );
}
