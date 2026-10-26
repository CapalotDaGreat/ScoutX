import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, ScrollView, View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import {
  canRetryMatchAnalysis,
  useMatchAnalysis,
} from '@/features/match-analysis/hooks/useMatchAnalysis';
import { LimitReachedCard } from '@/features/premium/components/LimitReachedCard';
import { toUserMessage } from '@/utils/userFacingError';
import { waitForModalDismiss } from '@/features/highlight-videos/services/videoLibraryPermission';
import {
  estimatedStatsToMatchLogPayload,
  hasApplyableEstimatedStats,
  type MatchAnalysisJob,
  type MatchEstimatedStats,
} from '@/features/match-analysis/types';
import { AnalysisPreviewCard } from '@/features/match-analysis/components/AnalysisPreviewCard';
import { AnalysisTrendsCard } from '@/features/match-analysis/components/AnalysisTrendsCard';
import { IdentityConfirmationCard } from '@/features/match-analysis/components/IdentityConfirmationCard';
import { buildAnalysisPreview } from '@/features/match-analysis/services/analysisPreviewService';
import { readFootageTrackInfo, type FootageTrackInfo } from '@/features/match-analysis/services/footageProbeService';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { type MatchLogPayload } from '@/features/player-statistics/types';
import { type PickedVideoAsset } from '@/features/highlight-videos/types';
import {
  UploadAcknowledgementPanel,
  useMediaUploadAcknowledged,
} from '@/features/media-library/components/UploadAcknowledgementPanel';
import { markAnalysisReviewed, workflowEvents } from '@/features/today/services/workflowStores';
import { UploadProgressCard } from '@/features/media-upload';
import { useJobFrames } from '@/features/match-analysis/hooks/useJobFrames';
import { ChoiceChip } from '@/components/primitives/ChoiceChip';
import { FilePickError } from '@/features/match-analysis/services/matchVideoFilePickerService';
import { VideoConsentSheet } from '@/features/match-analysis/components/VideoConsentSheet';
import { ImportFromLinkPanel } from '@/features/match-analysis/components/ImportFromLinkPanel';
import { CorrectionControls, CorrectionFootnote } from '@/features/match-analysis/components/CorrectionControls';
import { useAnalysisCorrections } from '@/features/match-analysis/hooks/useAnalysisCorrections';
import { VideoIntelligenceSections } from '@/features/match-analysis/components/VideoIntelligenceSections';
import {
  ANALYSIS_INTENTS,
  CLIP_CONTEXTS,
  MODE_LIMITS,
  processingModeFor,
  selectAnalysisMode,
  shortClipSampleTimes,
  type AnalysisIntent,
  type ClipContext,
} from '@/features/match-analysis/services/analysisMode';
import { TARGET_POSITIONS, type TargetPosition, type VideoConsentChoices } from '@/features/match-analysis/types';

export type MatchAnalysisModalProps = {
  visible: boolean;
  playerId: string | null;
  onClose: () => void;
  onApplyStats?: (payload: MatchLogPayload) => Promise<void>;
  onOpenHighlightReelStudio?: () => void;
  onOpenReport?: (jobId: string) => void;
  /** Opens this existing job (report or retry) once recent jobs have loaded. */
  initialJobId?: string | null;
  /** Prefills the match form when analyzing a match the player already logged. */
  prefillMatch?: { opponent: string; competition: string; date: string } | null;
};

type Translate = ReturnType<typeof useAppTranslation>['t'];

function formatUnknown(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : String(value);
}

function formatClock(totalSec: number): string {
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`;
}

function jobStatusLabel(t: Translate, job: MatchAnalysisJob): string {
  switch (job.status) {
    case 'complete':
      return t('matchAnalysis:jobStatus.ready');
    case 'failed':
      return canRetryMatchAnalysis(job) ? t('matchAnalysis:jobStatus.failedRetry') : t('matchAnalysis:jobStatus.failed');
    case 'processing':
    case 'queued':
      return t('matchAnalysis:jobStatus.analyzing');
    case 'uploading':
      return t('matchAnalysis:jobStatus.uploadInterrupted');
    case 'cancelled':
      return t('matchAnalysis:jobStatus.cancelled');
    case 'expired':
      return t('matchAnalysis:jobStatus.expired');
    default:
      return t('matchAnalysis:jobStatus.draft');
  }
}

/** Translated message for a server reason code, falling back to the stored text. */
export function jobErrorMessage(t: Translate, job: MatchAnalysisJob): string | null {
  if (job.errorCode) return t(`matchAnalysis:errors.${job.errorCode}`);
  return job.error ?? null;
}

function StatGrid({ stats }: { stats: MatchEstimatedStats }) {
  const { t } = useAppTranslation('matchAnalysis');
  const rows: Array<[string, string]> = [
    [t('stat.minutes'), formatUnknown(stats.minutesPlayed)],
    [t('stat.goals'), formatUnknown(stats.goals)],
    [t('stat.assists'), formatUnknown(stats.assists)],
    [t('stat.shotsOnTarget'), `${formatUnknown(stats.shotsOnTarget)}/${formatUnknown(stats.shots)}`],
    [t('stat.passPct'), formatUnknown(stats.passCompletionPct)],
    [t('stat.passes'), `${formatUnknown(stats.passesCompleted)}/${formatUnknown(stats.passesAttempted)}`],
    [t('stat.keyPasses'), formatUnknown(stats.keyPasses)],
    [t('stat.tackles'), formatUnknown(stats.tackles)],
    [t('stat.duelsWonLost'), `${formatUnknown(stats.duelsWon)} / ${formatUnknown(stats.duelsLost)}`],
    [t('stat.cardsYellowRed'), `${formatUnknown(stats.yellowCards)} / ${formatUnknown(stats.redCards)}`],
    [t('stat.rating'), formatUnknown(stats.matchRating)],
  ];

  return (
    <View className="flex-row flex-wrap gap-2">
      {rows.map(([label, value]) => (
        <View
          key={label}
          className="min-w-[120px] flex-1 border-b border-border px-3 py-3"
        >
          <Text variant="caption" color="secondary">
            {label}
          </Text>
          <Text weight="bold" className="mt-1">
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const STAGE_STATUSES = ['pending', 'active', 'complete', 'failed', 'unavailable'] as const;
type StageStatus = (typeof STAGE_STATUSES)[number];

function toStageStatus(value: string): StageStatus {
  return (STAGE_STATUSES as readonly string[]).includes(value) ? (value as StageStatus) : 'pending';
}

function PipelineStageList({ stages }: { stages: Array<{ id?: string; label: string; status: string; note?: string }> }) {
  const { t } = useAppTranslation('matchAnalysis');
  return (
    <View className="gap-2">
      {stages.map((stage) => (
        <View key={stage.id ?? stage.label} className="gap-1 border-b border-border py-3">
          <Text weight="semibold">{stage.id ? t(`stages.${stage.id}`, { defaultValue: stage.label }) : stage.label}</Text>
          <Text variant="caption" color="secondary">
            {t(`stageStatus.${toStageStatus(stage.status)}`)}
          </Text>
          {stage.note ? (
            <Text variant="body-sm" color="secondary">
              {stage.note}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function SegmentList({ segments }: { segments: Array<{ label: string; startSec: number; endSec: number; excludedFromPerformance: boolean }> }) {
  const { t } = useAppTranslation('matchAnalysis');
  return (
    <View className="gap-2">
      {segments.map((segment) => (
        <View key={`${segment.label}-${segment.startSec}`} className="gap-1 border-b border-border py-3">
          <Text weight="semibold">{segment.label}</Text>
          <Text variant="caption" color="secondary">
            {formatClock(segment.startSec)}–{formatClock(segment.endSec)}
            {segment.excludedFromPerformance ? ` · ${t('modalReport.excluded')}` : ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ReportView({
  job,
  applying,
  onApply,
  onOpenHighlightReelStudio,
  onOpenReport,
}: {
  job: MatchAnalysisJob;
  applying: boolean;
  onApply?: () => void;
  onOpenHighlightReelStudio?: () => void;
  onOpenReport?: () => void;
}) {
  const { t } = useAppTranslation('matchAnalysis');
  const corrections = useAnalysisCorrections(job);
  const report = job.report;
  if (!report) {
    return null;
  }

  return (
    <View className="gap-4">
      {onOpenReport ? (
        <Button variant="secondary" onPress={onOpenReport}>
          {t('modalReport.openFull')}
        </Button>
      ) : null}
      <Card variant="outlined" padding="md" className="gap-2 rounded-lg">
        <Heading level={3}>{report.headline}</Heading>
        <Text variant="caption" color="secondary">
          {t('modalReport.quality', { band: t(`band.${report.coverage?.confidenceLabel ?? 'Insufficient'}`), jersey: job.targeting.jerseyNumber })}
        </Text>
        <Text variant="body-sm" color="secondary" className="mt-1">
          {report.methodology}
        </Text>
      </Card>

      <VideoIntelligenceSections job={job} />

      <View className="gap-3 border-t border-border pt-4">
        <Heading level={3}>{t('modalReport.coverageTitle')}</Heading>
        <View className="gap-1">
          <Text variant="body-sm">{t('modalReport.visible', { pct: report.coverage?.visiblePct ?? 0 })}</Text>
          <Text variant="body-sm">{t('modalReport.offCamera', { pct: report.coverage?.likelyOffCameraPct ?? 0 })}</Text>
          <Text variant="body-sm">{t('modalReport.unknown', { pct: report.coverage?.unknownPct ?? 100 })}</Text>
          <Text variant="body-sm" color="secondary">
            {report.coverage?.note ?? t('modalReport.noCoverage')}
          </Text>
        </View>
      </View>

      <View className="gap-3 border-t border-border pt-4">
        <Heading level={3}>{t('modalReport.pipelineTitle')}</Heading>
        <PipelineStageList stages={report.pipelineStages ?? []} />
      </View>

      <View className="gap-3 border-t border-border pt-4">
        <Heading level={3}>{t('modalReport.segmentsTitle')}</Heading>
        <SegmentList segments={report.segments ?? []} />
      </View>

      <View className="gap-3 border-t border-border pt-4">
        <Heading level={3}>{t('modalReport.statsTitle')}</Heading>
        <StatGrid stats={report.estimatedStats} />
        {onApply && hasApplyableEstimatedStats(report.estimatedStats) && job.identityConfirmation?.state === 'confirmed' ? (
          <Button variant="accent" loading={applying} onPress={onApply}>
            {t('modalReport.apply')}
          </Button>
        ) : null}
        {onApply && (!hasApplyableEstimatedStats(report.estimatedStats) || job.identityConfirmation?.state !== 'confirmed') ? (
          <Text variant="caption" color="secondary">
            {t('modalReport.applyBlocked')}
          </Text>
        ) : null}
        {onOpenHighlightReelStudio ? (
          <Button variant="secondary" onPress={onOpenHighlightReelStudio}>
            {t('modalReport.buildReel')}
          </Button>
        ) : null}
      </View>

      <View className="gap-2 border-t border-border pt-4">
        <Heading level={3}>{t('modalReport.strengths')}</Heading>
        {report.strengths.map((item) => (
          <Text key={item} variant="body-sm">
            • {item}
          </Text>
        ))}
      </View>

      <View className="gap-2 border-t border-border pt-4">
        <Heading level={3}>{t('modalReport.improvements')}</Heading>
        {report.improvements.map((item) => (
          <Text key={item} variant="body-sm">
            • {item}
          </Text>
        ))}
      </View>

      {report.coachingNotes.trim() ? (
        <View className="gap-2 border-t border-border pt-4">
          <Heading level={3}>{t('modalReport.coachNotes')}</Heading>
          <Text variant="body-sm">{report.coachingNotes}</Text>
        </View>
      ) : null}

      {report.evidence?.length ? (
        <View className="gap-2 border-t border-border pt-4">
          <Heading level={3}>{t('modalReport.evidenceTitle')}</Heading>
          {report.evidence.map((item, index) => (
            <View key={`${item.label}-${index}`} className="gap-1 border-b border-border pb-2 last:border-0 last:pb-0">
              <Text weight="semibold">
                {t(`modalReport.evidenceKind.${item.kind === 'unknown' || item.kind === 'inference' ? item.kind : 'observation'}`)} · {item.label}
              </Text>
              <Text variant="body-sm" color="secondary">
                {item.detail}
              </Text>
              <Text variant="caption" color="secondary">
                {t('modalReport.confidence', { pct: Math.round(item.confidence * 100) })}{item.timestampSec != null ? ` · ${formatClock(item.timestampSec)}` : ''}
              </Text>
              {item.id && item.kind === 'observation' ? <CorrectionControls api={corrections} kind="observation" targetId={item.id} /> : null}
            </View>
          ))}
          <CorrectionFootnote api={corrections} />
        </View>
      ) : null}

      {report.moments.length > 0 ? (
        <Card variant="default" padding="lg" className="gap-2">
          <Heading level={3}>{t('modalReport.moments')}</Heading>
          {report.moments.map((moment) => (
            <View key={`${moment.timestampSec}-${moment.label}`} className="gap-1">
              <Text weight="semibold">
                {formatClock(moment.timestampSec)} · {moment.label}
              </Text>
              <Text variant="body-sm" color="secondary">
                {moment.detail}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
}

export function MatchAnalysisModal({
  visible,
  playerId,
  onClose,
  onApplyStats,
  onOpenHighlightReelStudio,
  onOpenReport,
  initialJobId = null,
  prefillMatch = null,
}: MatchAnalysisModalProps) {
  const {
    activeJob,
    recentJobs,
    isBusy,
    phaseLabel,
    error,
    quotaError,
    pickVideo,
    pickVideoFile,
    startAnalysis,
    retryAnalysis,
    cancelAnalysis,
    analyzeWithDeviceFrames,
    canAnalyzeOnDevice,
    isInProgress,
    confirmPlayerIdentity,
    revokeConsent,
    resetActive,
    setActiveJob,
    upload,
    resumeUpload,
    cancelUpload,
  } = useMatchAnalysis(playerId);
  const { candidates, frameUrls } = useJobFrames(activeJob);
  const identityCorrections = useAnalysisCorrections(activeJob);
  const serverProcessing = isInProgress && activeJob?.status !== 'uploading';
  const { t } = useAppTranslation(['matchAnalysis', 'common']);
  const [selectedFrameIds, setSelectedFrameIds] = useState<string[]>([]);

  const [picked, setPicked] = useState<PickedVideoAsset | null>(null);
  const [jerseyNumber, setJerseyNumber] = useState('');
  const [kitPrimaryColor, setKitPrimaryColor] = useState('');
  const [kitSecondaryColor, setKitSecondaryColor] = useState('');
  const [opponent, setOpponent] = useState('');
  const [competition, setCompetition] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState('');
  const [notes, setNotes] = useState('');
  const [teamName, setTeamName] = useState('');
  const [position, setPosition] = useState<TargetPosition>('unknown');
  const [intent, setIntent] = useState<AnalysisIntent>('match');
  const [clipContext, setClipContext] = useState<ClipContext>('auto');
  const [consentOpen, setConsentOpen] = useState(false);
  const [preparingFile, setPreparingFile] = useState(false);
  const [applying, setApplying] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const uploadAcknowledged = useMediaUploadAcknowledged();

  const showReport = activeJob?.status === 'complete' && activeJob.report;
  const retryable = !isBusy && canRetryMatchAnalysis(activeJob);

  useEffect(() => {
    setSelectedFrameIds(activeJob?.identityConfirmation?.frameIds ?? []);
  }, [activeJob?.id, activeJob?.identityConfirmation?.state]);

  const appliedInitialRef = useRef<string | null>(null);
  useEffect(() => {
    if (!visible) {
      appliedInitialRef.current = null;
      return;
    }
    if (!initialJobId || appliedInitialRef.current === initialJobId) {
      return;
    }
    const job = recentJobs.find((item) => item.id === initialJobId);
    if (job) {
      appliedInitialRef.current = initialJobId;
      setActiveJob(job);
    }
  }, [initialJobId, recentJobs, setActiveJob, visible]);

  useEffect(() => {
    if (!visible || !prefillMatch) {
      return;
    }
    setOpponent(prefillMatch.opponent);
    setCompetition(prefillMatch.competition);
    setDate(prefillMatch.date.slice(0, 10));
  }, [prefillMatch, visible]);

  const shownReportJobId = visible && showReport ? activeJob.id : null;
  useEffect(() => {
    if (!shownReportJobId || !playerId) {
      return;
    }
    markAnalysisReviewed(playerId, shownReportJobId)
      .then(() => workflowEvents.emit())
      .catch((reviewError: unknown) => {
        if (__DEV__) {
          console.warn('[MatchAnalysisModal] Could not store reviewed state', reviewError);
        }
      });
  }, [playerId, shownReportJobId]);

  const durationLabel = useMemo(() => {
    if (!picked) {
      return null;
    }
    return t('matchAnalysis:modalForm.filmSelected', { minutes: Math.round(picked.durationSec / 60) });
  }, [picked, t]);

  const [trackInfo, setTrackInfo] = useState<{ uri: string; info: FootageTrackInfo | null } | null>(null);
  useEffect(() => {
    if (!picked || Platform.OS === 'web') return;
    let active = true;
    void readFootageTrackInfo(picked.uri)
      .catch(() => null)
      .then((info) => {
        if (active) setTrackInfo({ uri: picked.uri, info });
      });
    return () => {
      active = false;
    };
  }, [picked]);
  const pickedTrack = picked && trackInfo?.uri === picked.uri ? trackInfo.info : null;
  const readingTrack = Boolean(picked && Platform.OS !== 'web' && trackInfo?.uri !== picked.uri);

  const preview = useMemo(
    () => (picked
      ? buildAnalysisPreview({
        durationSec: picked.durationSec,
        fileSizeBytes: picked.fileSizeBytes,
        width: pickedTrack?.width,
        height: pickedTrack?.height,
        frameRate: pickedTrack?.frameRate,
        trackBitrate: pickedTrack?.trackBitrate,
        trackSupported: pickedTrack?.trackSupported,
      })
      : null),
    [picked, pickedTrack],
  );

  const analysisMode = picked ? selectAnalysisMode(picked.durationSec, intent) : null;
  const processingMode = analysisMode && picked ? processingModeFor(analysisMode, picked.durationSec) : null;
  const deviceFrameCount = picked && processingMode === 'device_frames' ? shortClipSampleTimes(picked.durationSec).length : 0;
  const segmentReview = activeJob?.segmentReview;

  const handlePick = async () => {
    try {
      setIsPicking(true);
      await waitForModalDismiss();
      const video = await pickVideo();
      if (video) {
        setPicked(video);
        resetActive();
      }
    } catch (err) {
      Alert.alert(t('matchAnalysis:modalForm.videoTitle'), toUserMessage(err, t('matchAnalysis:modalForm.pickFailed')));
    } finally {
      setIsPicking(false);
    }
  };

  const handlePickFile = async () => {
    try {
      setPreparingFile(true);
      setIsPicking(true);
      await waitForModalDismiss();
      const video = await pickVideoFile();
      if (video) {
        setPicked(video);
        resetActive();
      }
    } catch (err) {
      const message = err instanceof FilePickError
        ? t(`matchAnalysis:video.files.${err.code}`, { minutes: MODE_LIMITS.maxDurationSec / 60 })
        : toUserMessage(err, t('matchAnalysis:modalForm.pickFailed'));
      Alert.alert(t('matchAnalysis:modalForm.videoTitle'), message);
    } finally {
      setPreparingFile(false);
      setIsPicking(false);
    }
  };

  const handleAnalyze = async () => {
    if (!picked) {
      Alert.alert(t('matchAnalysis:modalForm.videoTitle'), t('matchAnalysis:modalForm.pickFirst'));
      return;
    }
    if (!jerseyNumber.trim()) {
      Alert.alert(t('matchAnalysis:modalForm.jerseyTitle'), t('matchAnalysis:modalForm.jerseyRequired'));
      return;
    }
    if (!opponent.trim()) {
      Alert.alert(t('matchAnalysis:modalForm.matchTitle'), t('matchAnalysis:modalForm.opponentRequired'));
      return;
    }
    if (preview && !preview.canProceed) {
      Alert.alert(
        t('matchAnalysis:modalForm.videoTitle'),
        preview.blockers[0] ? t(`matchAnalysis:preview.blocker.${preview.blockers[0]}`) : t('matchAnalysis:modalForm.cannotAnalyze'),
      );
      return;
    }
    if (!analysisMode) {
      Alert.alert(t('matchAnalysis:modalForm.videoTitle'), t('matchAnalysis:video.mode.tooLong', { minutes: MODE_LIMITS.maxDurationSec / 60 }));
      return;
    }
    setConsentOpen(true);
  };

  const handleConsent = async (consent: VideoConsentChoices) => {
    if (!picked) {
      return;
    }
    setConsentOpen(false);
    try {
      await startAnalysis({
        analysisIntent: intent,
        clipContext: processingMode === 'device_frames' ? clipContext : 'auto',
        consent,
        localVideoUri: picked.uri,
        fileName: picked.fileName,
        durationSec: picked.durationSec,
        fileSizeBytes: picked.fileSizeBytes,
        targeting: {
          jerseyNumber: jerseyNumber.trim(),
          kitPrimaryColor: kitPrimaryColor.trim() || 'unknown',
          kitSecondaryColor: kitSecondaryColor.trim() || 'unknown',
          teamName: teamName.trim() || undefined,
          position,
          notes: notes.trim() || undefined,
        },
        match: {
          opponent: opponent.trim(),
          competition: competition.trim(),
          date,
          result: result.trim() || undefined,
        },
      });
    } catch {
      // The hook surfaces a friendly message through `error`.
    }
  };

  const handleRetry = async () => {
    if (!activeJob) {
      return;
    }
    try {
      await retryAnalysis(activeJob);
    } catch {
      // The hook surfaces a friendly message through `error`.
    }
  };

  const handleApply = async () => {
    if (!activeJob?.report || !onApplyStats) {
      return;
    }
    setApplying(true);
    try {
      const payload = estimatedStatsToMatchLogPayload(
        activeJob.match,
        activeJob.report.estimatedStats,
        `AI match analysis. ${activeJob.report.coachingNotes}`.trim(),
      );
      if (!payload) {
        Alert.alert(t('matchAnalysis:modalForm.noEvidenceTitle'), t('matchAnalysis:modalForm.noEvidenceBody'));
        return;
      }
      await onApplyStats(payload);
      Alert.alert(t('matchAnalysis:modalForm.savedTitle'), t('matchAnalysis:modalForm.savedBody'));
    } catch (err) {
      Alert.alert(t('matchAnalysis:modalForm.saveFailedTitle'), toUserMessage(err, t('matchAnalysis:modalForm.saveFailed')));
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal visible={visible && !isPicking} onClose={onClose} title={t('modal.title')} size="fullscreen">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ gap: 20, padding: 16, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="body-sm" color="secondary">
          {t('modal.intro')}
        </Text>

        {error && !retryable ? (
          <Text variant="body-sm" color="error">
            {error}
          </Text>
        ) : null}
        {quotaError ? <LimitReachedCard info={quotaError} /> : null}

        <UploadProgressCard
          state={upload.state}
          onPause={upload.pause}
          onResume={() => void resumeUpload().catch(() => undefined)}
          onCancel={() => void cancelUpload()}
        />

        {retryable && activeJob ? (
          <Card>
            <View className="gap-3">
              <Heading level={3}>
                {t('matchAnalysis:modalForm.jobTitle', { date: activeJob.match.date, opponent: activeJob.match.opponent })}
              </Heading>
              <Text variant="body-sm" color="error">
                {jobErrorMessage(t, activeJob) ?? error ?? t('matchAnalysis:modalForm.failedFallback')}
              </Text>
              <Text variant="caption" color="secondary">
                {t('matchAnalysis:modalForm.retryNote')}
              </Text>
              <Button variant="accent" onPress={() => void handleRetry()}>
                {t('modal.retry')}
              </Button>
              {canAnalyzeOnDevice ? (
                <Button variant="secondary" onPress={() => void analyzeWithDeviceFrames(activeJob).catch(() => undefined)}>
                  {t('matchAnalysis:pipeline.deviceFallback')}
                </Button>
              ) : null}
            </View>
          </Card>
        ) : null}

        {serverProcessing && activeJob ? (
          <Card>
            <View className="gap-3">
              <Heading level={3}>{t('matchAnalysis:pipeline.title')}</Heading>
              <Text variant="caption" color="secondary">
                {t('matchAnalysis:pipeline.stageBased')}
              </Text>
              {activeJob.status === 'queued' ? (
                <Text variant="body-sm" color="secondary">
                  {t('matchAnalysis:pipeline.queued')}
                </Text>
              ) : null}
              {segmentReview && segmentReview.total > 0 ? (
                <Text variant="body-sm" weight="semibold">
                  {t('matchAnalysis:video.segments', {
                    done: segmentReview.reviewed.length + segmentReview.failed.length,
                    total: segmentReview.total,
                  })}
                </Text>
              ) : null}
              <PipelineStageList stages={activeJob.pipelineStages ?? []} />
              <Button variant="ghost" onPress={() => void cancelAnalysis(activeJob)}>
                {t('matchAnalysis:pipeline.cancel')}
              </Button>
              {activeJob.consentVersion ? (
                <Button variant="ghost" onPress={() => void revokeConsent(activeJob)}>
                  {t('matchAnalysis:video.consent.withdraw')}
                </Button>
              ) : null}
            </View>
          </Card>
        ) : null}

        {showReport && activeJob ? (
          <ReportView
            job={activeJob}
            applying={applying}
            onApply={onApplyStats ? () => void handleApply() : undefined}
            onOpenHighlightReelStudio={onOpenHighlightReelStudio}
            onOpenReport={onOpenReport ? () => onOpenReport(activeJob.id) : undefined}
          />
        ) : (
          <View className="gap-3">
            {uploadAcknowledged === false ? (
              <UploadAcknowledgementPanel />
            ) : (
              <View className="gap-2">
                <Button variant="secondary" onPress={() => void handlePick()} disabled={isBusy || isPicking || preparingFile}>
                  {picked ? t('modal.change') : t('modal.pick')}
                </Button>
                <Button
                  variant="secondary"
                  loading={preparingFile}
                  onPress={() => void handlePickFile()}
                  disabled={isBusy || isPicking}
                  testID="pick-from-files"
                >
                  {preparingFile ? t('matchAnalysis:video.files.preparing') : t('matchAnalysis:video.files.pick')}
                </Button>
                <ImportFromLinkPanel />
              </View>
            )}
            {preview ? <AnalysisPreviewCard preview={preview} loading={readingTrack} /> : null}
            {durationLabel ? (
              <Text variant="caption" color="secondary">
                {durationLabel}
                {picked?.fileSizeBytes
                  ? ` · ${(picked.fileSizeBytes / (1024 * 1024)).toFixed(0)} MB`
                  : ''}
              </Text>
            ) : null}

            <View className="gap-2">
              <Text weight="semibold">{t('matchAnalysis:video.intent.title')}</Text>
              <View className="flex-row flex-wrap gap-2">
                {ANALYSIS_INTENTS.map((item) => (
                  <ChoiceChip key={item} label={t(`matchAnalysis:video.intent.${item}`)} selected={intent === item} onPress={() => setIntent(item)} />
                ))}
              </View>
              {analysisMode ? (
                <Text variant="caption" color="secondary" testID="analysis-mode">
                  {t(`matchAnalysis:video.mode.${analysisMode}`)}
                </Text>
              ) : null}
            </View>
            {processingMode === 'device_frames' ? (
              <View className="gap-2">
                <Text weight="semibold">{t('matchAnalysis:video.clipContext.title')}</Text>
                <View className="flex-row flex-wrap gap-2">
                  {CLIP_CONTEXTS.map((item) => (
                    <ChoiceChip key={item} label={t(`matchAnalysis:video.clipContext.${item}`)} selected={clipContext === item} onPress={() => setClipContext(item)} />
                  ))}
                </View>
              </View>
            ) : null}
            <View className="gap-2">
              <Text weight="semibold">{t('matchAnalysis:video.position.title')}</Text>
              <View className="flex-row flex-wrap gap-2">
                {TARGET_POSITIONS.map((item) => (
                  <ChoiceChip key={item} label={item === 'goalkeeper' || item === 'defender' || item === 'midfielder' || item === 'forward' || item === 'unknown' ? t(`matchAnalysis:video.position.${item}`) : item} selected={position === item} onPress={() => setPosition(item)} />
                ))}
              </View>
            </View>
            <Input
              label={t('matchAnalysis:video.teamName')}
              value={teamName}
              onChangeText={setTeamName}
              placeholder={t('matchAnalysis:video.teamNamePlaceholder')}
            />
            <Input
              label={t('matchAnalysis:modalForm.jersey')}
              value={jerseyNumber}
              onChangeText={setJerseyNumber}
              keyboardType="number-pad"
              placeholder="10"
            />
            <View className="flex-row flex-wrap gap-3">
              <View className="min-w-[140px] flex-1">
                <Input
                  label={t('matchAnalysis:modalForm.kitPrimary')}
                  value={kitPrimaryColor}
                  onChangeText={setKitPrimaryColor}
                  placeholder={t('matchAnalysis:modalForm.kitPrimaryPlaceholder')}
                />
              </View>
              <View className="min-w-[140px] flex-1">
                <Input
                  label={t('matchAnalysis:modalForm.kitSecondary')}
                  value={kitSecondaryColor}
                  onChangeText={setKitSecondaryColor}
                  placeholder={t('matchAnalysis:modalForm.kitSecondaryPlaceholder')}
                />
              </View>
            </View>
            <Input label={t('matchAnalysis:modalForm.opponent')} value={opponent} onChangeText={setOpponent} placeholder={t('matchAnalysis:modalForm.opponentPlaceholder')} />
            <Input
              label={t('matchAnalysis:modalForm.competition')}
              value={competition}
              onChangeText={setCompetition}
              placeholder={t('matchAnalysis:modalForm.competitionPlaceholder')}
            />
            <Input label={t('matchAnalysis:modalForm.date')} value={date} onChangeText={setDate} />
            <Input
              label={t('matchAnalysis:modalForm.result')}
              value={result}
              onChangeText={setResult}
              placeholder={t('matchAnalysis:modalForm.resultPlaceholder')}
            />
            <Input
              label={t('matchAnalysis:modalForm.notes')}
              value={notes}
              onChangeText={setNotes}
              placeholder={t('matchAnalysis:modalForm.notesPlaceholder')}
            />

            {consentOpen && processingMode ? (
              <VideoConsentSheet
                processingMode={processingMode}
                frameCount={deviceFrameCount}
                busy={isBusy}
                onAgree={(consent) => void handleConsent(consent)}
                onCancel={() => setConsentOpen(false)}
              />
            ) : (
              <Button variant="accent" loading={isBusy} onPress={() => void handleAnalyze()} disabled={Boolean(preview && !preview.canProceed)}>
                {phaseLabel ?? t('modal.analyze')}
              </Button>
            )}

          </View>
        )}

        {recentJobs.length > 0 ? (
          <View className="gap-2">
            <Heading level={3}>{t('modal.recent')}</Heading>
            {recentJobs.slice(0, 5).map((job) => (
              <Button
                key={job.id}
                variant="ghost"
                onPress={() => {
                  setActiveJob(job);
                }}
              >
                {`${t('matchAnalysis:modalForm.jobTitle', { date: job.match.date, opponent: job.match.opponent })} · ${jobStatusLabel(t, job)}`}
              </Button>
            ))}
            <AnalysisTrendsCard jobs={recentJobs} />
          </View>
        ) : null}

        {showReport ? (
          <Button
            variant="secondary"
            onPress={() => {
              resetActive();
              setPicked(null);
            }}
          >
            {t('modal.another')}
          </Button>
        ) : null}

        {activeJob && candidates.length > 0 ? (
          <IdentityConfirmationCard
            candidates={candidates}
            confirmation={activeJob.identityConfirmation}
            selectedFrameIds={selectedFrameIds}
            onToggleFrame={(frameId) => {
              setSelectedFrameIds((current) =>
                current.includes(frameId) ? current.filter((id) => id !== frameId) : [...current, frameId],
              );
            }}
            onConfirm={() => void confirmPlayerIdentity(activeJob, selectedFrameIds)}
            onReject={() => void confirmPlayerIdentity(activeJob, [])}
            frameUrls={frameUrls}
            corrections={identityCorrections}
          />
        ) : null}

        <Button variant="ghost" onPress={onClose}>
          {t('modal.close')}
        </Button>
      </ScrollView>
    </Modal>
  );
}
