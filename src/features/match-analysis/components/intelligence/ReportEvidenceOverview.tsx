import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { Heading } from '@/components/primitives/Heading';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import type { MatchAnalysisJob } from '../../types';
import { recordingTimestamp, reportEvidence } from './reportEvidence';

export function ReportEvidenceOverview({ job, timeline = false, canSeekVideo, onSeek }: {
  job: MatchAnalysisJob;
  timeline?: boolean;
  canSeekVideo: boolean;
  onSeek: (seconds: number) => void;
}) {
  const { t } = useAppTranslation('matchAnalysis');
  const report = job.report;
  if (!report) return null;
  const evidence = reportEvidence(job).sort((a, b) => (a.timestampSec ?? Infinity) - (b.timestampSec ?? Infinity));
  const review = job.segmentReview;
  const sampled = report.sampledCoverage;
  return (
    <View className="gap-3 border-y border-border py-4" testID={timeline ? 'report-evidence-timeline' : 'report-evidence-overview'}>
      <Heading level={3}>{t(timeline ? 'tabs.timeline' : 'video.sectionsTitle')}</Heading>
      {!timeline ? <>
        {review ? <Text variant="body-sm">{t('video.segments', { done: new Set(review.reviewed).size, total: review.total })}</Text> : null}
        {review && review.failed.length > 0 ? <Text variant="body-sm" color="warning">{t('stageStatus.failed')}: {new Set(review.failed).size}</Text> : null}
        {(report.sections ?? []).length > 0 ? <View className="flex-row flex-wrap gap-3">
          {(['AVAILABLE', 'LIMITED', 'INSUFFICIENT_EVIDENCE', 'NOT_AVAILABLE'] as const).map((availability) => (
            <Text key={availability} variant="caption" color="secondary">{t(`video.availability.${availability}`)}: {report.sections?.filter((section) => section.availability === availability).length}</Text>
          ))}
        </View> : null}
        {sampled ? <>
          <Text variant="body-sm">{t('video.clip.frames', { count: sampled.sampledFrameCount })} · {sampled.identifiedFrameCount}/{sampled.sampledFrameCount} · {t(`band.${sampled.confidenceLabel}`)}</Text>
          <Text variant="caption" color="secondary">{t('video.reason.sampled_frames_only')}</Text>
        </> : null}
        <Text variant="caption" color="secondary">{report.modelId} · {report.generatedAt}</Text>
        {report.versions ? <>
          <Text variant="caption" color="secondary">{t('video.version', { version: report.versions.analysisVersion, pipeline: report.versions.pipelineVersion })}</Text>
          <Text variant="caption" color="secondary">{[report.versions.visionModel, report.versions.reasoningModel, report.versions.cvWorkerVersion].filter(Boolean).join(' · ')}</Text>
        </> : null}
      </> : null}
      {evidence.length === 0 ? <Text variant="body-sm" color="secondary">{t('report.emptyTimeline')}</Text> : null}
      {(timeline ? evidence : evidence.slice(0, 3)).map(({ point, timestampSec, frameIds }, index) => (
        <View key={`${point.id ?? index}`} className="gap-1 border-l-2 border-border pl-3">
          <Text weight="semibold">{point.label}</Text>
          <Text variant="body-sm">{point.detail}</Text>
          <Text variant="caption" color="secondary">{t(`coaching.kind.${point.kind}`)} {point.source ? `· ${point.source}` : ''} {frameIds.length ? `· ${frameIds.join(', ')}` : ''}</Text>
          {timestampSec !== null ? (canSeekVideo ?
            <Button variant="ghost" accessibilityLabel={t('technique.seekA11y', { time: recordingTimestamp(timestampSec) })} onPress={() => onSeek(timestampSec)}>{recordingTimestamp(timestampSec)}</Button> :
            <Text variant="caption" color="secondary">{t('report.timestampOnly', { time: recordingTimestamp(timestampSec) })}</Text>
          ) : <Text variant="caption" color="secondary">{t('video.availability.INSUFFICIENT_EVIDENCE')}</Text>}
        </View>
      ))}
    </View>
  );
}
