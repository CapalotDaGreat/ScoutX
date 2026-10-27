import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { ChoiceChip } from '@/components/primitives/ChoiceChip';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { AskThisMatchCard } from '@/features/match-analysis/components/AskThisMatchCard';
import { HighlightReelStudioModal } from '@/features/highlight-reel-studio/components/HighlightReelStudioModal';
import {
  GpsVideoSyncCard,
  QualityReportCard,
  StructuredCoachingCard,
} from '@/features/match-analysis/components/AnalysisIntelligenceCards';
import {
  buildQualityReport,
  buildStructuredCoaching,
  parseVideoSync,
  type StructuredCoaching,
  type VideoSync,
} from '@/features/match-analysis/services/analysisIntelligence';
import { DevelopmentRepository } from '@/features/development/repositories/DevelopmentRepository';
import { createDevelopmentGoal } from '@/features/development/models/DevelopmentModels';
import type { DevelopmentGoal } from '@/features/development/types';
import { GpsSessionRepository } from '@/features/gps/repositories/GpsSessionRepository';
import type { GpsSession } from '@/features/gps/types';
import { IdentityConfirmationCard } from '@/features/match-analysis/components/IdentityConfirmationCard';
import { TargetAnchorPanel } from '@/features/match-analysis/components/TargetAnchorPanel';
import { targetAnchorSelectionEnabled } from '@/features/match-analysis/hooks/useTargetAnchors';
import { TechniqueAssessmentCard } from '@/features/match-analysis/components/TechniqueAssessmentCard';
import { parseTechniqueAssessment } from '@/features/match-analysis/services/techniqueAssessment';
import { getMatchAnalysisJob, subscribeMatchAnalysisJob, updateMatchAnalysisJob } from '@/features/match-analysis/repositories/MatchAnalysisRepository';
import { useJobFrames } from '@/features/match-analysis/hooks/useJobFrames';
import { requestConfirmAnalysisIdentity } from '@/features/match-analysis/services/matchAnalysisCallable';
import { VideoIntelligenceSections } from '@/features/match-analysis/components/VideoIntelligenceSections';
import { hasApplyableEstimatedStats, type MatchAnalysisJob, type MatchEstimatedStats } from '@/features/match-analysis/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { ReportEvidenceOverview } from './intelligence/ReportEvidenceOverview';
import { TrackingReportSection } from '@/features/match-analysis/components/TrackingReportSection';
import { useTracking } from '@/features/match-analysis/hooks/useTracking';
import { MatchReviewView } from '@/features/match-review/components/MatchReviewView';
import { useTrackingDiscovery, useTrackingProgress } from '@/features/match-review/hooks/useMatchReviewData';
import type { Insight } from '@/features/match-review/services/coach';

type ReportTab = 'review' | 'overview' | 'tracking' | 'timeline' | 'technical' | 'tactical' | 'coaching' | 'video' | 'ask';

export type AnalysisReportScreenProps = {
  jobId: string;
  onBack: () => void;
  /** Opens a reel built from this report's highlight moments. */
  onOpenReel?: (reelId: string) => void;
  /** Deep-linked section of the match review (push notifications). */
  initialSection?: 'moments' | 'review';
};

function formatUnknown(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : String(value);
}

function StatGrid({ stats }: { stats: MatchEstimatedStats }) {
  const { t } = useAppTranslation('matchAnalysis');
  const rows: Array<[string, string]> = [
    [t('stat.minutes'), formatUnknown(stats.minutesPlayed)],
    [t('stat.goals'), formatUnknown(stats.goals)],
    [t('stat.assists'), formatUnknown(stats.assists)],
    [t('stat.shots'), formatUnknown(stats.shots)],
    [t('stat.passPct'), formatUnknown(stats.passCompletionPct)],
    [t('stat.tackles'), formatUnknown(stats.tackles)],
    [t('stat.rating'), formatUnknown(stats.matchRating)],
  ];
  return (
    <View className="flex-row flex-wrap gap-2">
      {rows.map(([label, value]) => (
        <View key={label} className="min-w-[30%] flex-1 rounded-lg border border-border bg-background-secondary px-3 py-2">
          <Text variant="caption" color="secondary">{label}</Text>
          <Text weight="bold" className="mt-1">{value}</Text>
        </View>
      ))}
    </View>
  );
}

export function AnalysisReportScreen({ jobId, onBack, onOpenReel, initialSection }: AnalysisReportScreenProps) {
  const { t } = useAppTranslation('matchAnalysis');
  const [studioVisible, setStudioVisible] = useState(false);
  const [job, setJob] = useState<MatchAnalysisJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ReportTab>('overview');
  const [selectedFrameIds, setSelectedFrameIds] = useState<string[]>([]);
  const [identityBusy, setIdentityBusy] = useState(false);
  const [identityError, setIdentityError] = useState(false);
  const [goals, setGoals] = useState<DevelopmentGoal[]>([]);
  const [gpsSessions, setGpsSessions] = useState<GpsSession[]>([]);
  const playerId = job?.playerId ?? null;
  const { tracking } = useTracking(jobId);
  const progress = useTrackingProgress(jobId);
  const discovery = useTrackingDiscovery(jobId);
  const reviewAvailable = tracking !== null || progress !== null;
  const [tabChosen, setTabChosen] = useState(false);
  useEffect(() => {
    // The player-first review is the default view as soon as it exists (unless the user picked a tab).
    if (reviewAvailable && !tabChosen) setTab('review');
  }, [reviewAvailable, tabChosen]);

  useEffect(() => {
    if (!playerId) return undefined;
    let cancelled = false;
    void DevelopmentRepository.getInstance()
      .listGoals(playerId)
      .then((next) => {
        if (!cancelled) setGoals(next);
      })
      .catch(() => undefined);
    void GpsSessionRepository.getInstance()
      .fetchSessions(playerId)
      .then((next) => {
        if (!cancelled) setGpsSessions(next.filter((session) => session.status === 'completed'));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  useEffect(() => {
    setJob(null);
    setError(null);
    setIdentityError(false);
    return subscribeMatchAnalysisJob(jobId, (next) => {
      setJob(next);
      setError(next ? null : t('report.missing'));
      setSelectedFrameIds(next?.identityConfirmation?.frameIds ?? []);
    }, () => {
      setJob(null);
      setError(t('report.missing'));
    });
  }, [jobId, t]);

  const report = job?.report;
  const videoUri = job?.videoDownloadUrl ?? null;
  const canSeekVideo = Boolean(videoUri);
  const player = useVideoPlayer(videoUri, (instance) => {
    instance.loop = false;
  });

  const tabs = useMemo(
    () =>
      (['review', 'overview', 'tracking', 'timeline', 'technical', 'tactical', 'coaching', 'video', 'ask'] as const)
        .filter((id) => (id === 'review' ? reviewAvailable || !job?.report : id === 'tracking' ? tracking !== null : Boolean(job?.report)))
        .map((id) => ({
          id,
          label: id === 'review' ? t('review.tab') : t(`tabs.${id}`),
        })),
    [t, tracking, reviewAvailable, job?.report],
  );

  /** Seek only when the source video is still retained; otherwise open the honest "no video" panel. */
  const seekTo = (timestampSec: number) => {
    setTab('video');
    const duration = job?.measuredDurationSec ?? job?.durationSec ?? 0;
    if (!canSeekVideo || !Number.isFinite(timestampSec) || timestampSec < 0 || duration <= 0 || timestampSec > duration) {
      return;
    }
    player.currentTime = timestampSec;
  };

  const quality = useMemo(
    () => (job?.report ? buildQualityReport(job.report, { identityConfirmation: job.identityConfirmation, events: job.events }) : null),
    [job],
  );
  const coaching = useMemo(
    () =>
      job?.report
        ? buildStructuredCoaching(job.report.coachingMoments ?? [], job.events ?? job.report.events ?? [], goals)
        : [],
    [goals, job],
  );
  const videoSync = parseVideoSync(job?.videoSync);

  const handleSaveSync = async (sync: VideoSync) => {
    if (!job) return;
    await updateMatchAnalysisJob(job.id, { videoSync: sync });
    setJob({ ...job, videoSync: sync });
  };

  const handleCreateGoal = async (item: StructuredCoaching) => {
    if (!job) return;
    const repository = DevelopmentRepository.getInstance();
    const goal = createDevelopmentGoal(
      job.playerId,
      repository.newId('goal'),
      {
        title: item.whatToImprove.slice(0, 120),
        category: 'technical',
        metricKey: 'none',
        targetValue: null,
        targetLabel: '',
        timeframeEnd: null,
        practiceSuggestions: item.howToTrain ? [item.howToTrain] : [],
        evidenceIds: [`${job.id}:${item.id}`],
        origin: 'coaching_moment',
      },
      null,
      new Date(),
    );
    await repository.saveGoal(goal);
    setGoals((current) => [goal, ...current]);
  };

  /** "Add as development goal" from an evidence-backed review insight. */
  const handleCreateReviewGoal = async (insight: Insight) => {
    if (!job) return;
    const repository = DevelopmentRepository.getInstance();
    const goal = createDevelopmentGoal(job.playerId, repository.newId('goal'), {
      title: t('review.focus.skill', { topic: (t as unknown as (k: string) => string)(`review.topic.${insight.topic}`) }).slice(0, 120),
      category: 'technical', metricKey: 'none', targetValue: null, targetLabel: '', timeframeEnd: null,
      practiceSuggestions: insight.drill ? [(t as unknown as (k: string) => string)(`review.drill.${insight.drill.id}.how`)] : [],
      evidenceIds: insight.momentIds.slice(0, 5).map((id) => `${job.id}:${id}`),
      origin: 'coaching_moment',
    }, null, new Date());
    await repository.saveGoal(goal);
    setGoals((current) => [goal, ...current]);
  };

  const handleConfirmIdentity = async () => {
    if (!job) {
      return;
    }
    setIdentityBusy(true);
    setIdentityError(false);
    try {
      // The server releases coaching that was held back until identity was confirmed.
      await requestConfirmAnalysisIdentity({ jobId: job.id, decision: 'confirmed', frameIds: selectedFrameIds.slice(0, 6),
        expectedGeneration: job.pipelineGeneration ?? 0, expectedAnchorRevision: job.experimentalTargetIdentity?.revision ?? 0 });
      setJob((await getMatchAnalysisJob(job.id)) ?? job);
    } catch {
      setIdentityError(true);
    } finally {
      setIdentityBusy(false);
    }
  };

  const handleRejectIdentity = async () => {
    if (!job) {
      return;
    }
    setIdentityBusy(true);
    setIdentityError(false);
    try {
      await requestConfirmAnalysisIdentity({ jobId: job.id, decision: 'rejected', frameIds: [],
        expectedGeneration: job.pipelineGeneration ?? 0, expectedAnchorRevision: job.experimentalTargetIdentity?.revision ?? 0 });
      setJob((await getMatchAnalysisJob(job.id)) ?? job);
      setSelectedFrameIds([]);
    } catch {
      setIdentityError(true);
    } finally {
      setIdentityBusy(false);
    }
  };

  const { candidates, frameUrls } = useJobFrames(job);
  const frameTimestamps = Object.fromEntries(
    (job?.frames ?? []).map((frame) => [frame.id, frame.timestampSec]),
  );

  return (
    <Screen
      title={t('report.title')}
      subtitle={job ? `${job.match.date} vs ${job.match.opponent}` : undefined}
      headerLeading={<Button variant="ghost" onPress={onBack}>{t('report.back')}</Button>}
      loading={!job && !error}
    >
      {error ? (
        <EmptyState title={t('report.title')} description={error}
          actionLabel={t('report.back')} onAction={onBack} />
      ) : null}
      {job ? (
        <View className="gap-4">
          {report ? (
          <View className="gap-2 border-l-4 border-accent py-3 pl-4">
            <Heading level={3}>{report.headline}</Heading>
            <Text variant="caption" color="secondary">
              {t('report.coverageBand', {
                band: t(`band.${report.confidenceDimensions?.overallCoverage ?? report.coverage.confidenceLabel}`),
              })}
            </Text>
            <Text variant="body-sm" color="secondary">{report.methodology}</Text>
          </View>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {tabs.map((item) => (
              <ChoiceChip
                key={item.id}
                label={item.label}
                selected={tab === item.id}
                onPress={() => { setTabChosen(true); setTab(item.id); }}
              />
            ))}
          </ScrollView>

          {tab === 'review' || (!report && !reviewAvailable) ? (
            <MatchReviewView
              jobId={jobId}
              playerId={job.playerId}
              match={job.match}
              position={job.targeting.position ?? null}
              job={{ ...job, jerseyNumber: job.targeting.jerseyNumber }}
              tracking={tracking}
              progress={progress}
              discovery={discovery}
              goals={goals}
              initialSection={initialSection}
              onOpenReel={onOpenReel}
              onCreateGoal={handleCreateReviewGoal}
            />
          ) : null}

          {tab === 'tracking' && tracking ? <TrackingReportSection jobId={jobId} tracking={tracking} /> : null}

          {tab === 'overview' && report ? (
            <View className="gap-4">
              <ReportEvidenceOverview job={job} canSeekVideo={canSeekVideo} onSeek={seekTo} />
              <VideoIntelligenceSections job={job} />
              {quality ? <QualityReportCard quality={quality} /> : null}
              {onOpenReel && ((report.moments?.length ?? 0) > 0 || (report.evidence?.length ?? 0) > 0) ? (
                <Card padding="lg" className="gap-2">
                  <Heading level={3}>{t('report.reelTitle')}</Heading>
                  <Text variant="body-sm" color="secondary">{t('report.reelHint')}</Text>
                  <Button variant="secondary" onPress={() => setStudioVisible(true)} testID="report-build-reel">
                    {t('report.reelAction')}
                  </Button>
                </Card>
              ) : null}
              <View className="gap-3 border-y border-border py-4">
                <Heading level={3}>{t('report.stats')}</Heading>
                <StatGrid stats={report.estimatedStats} />
                {!hasApplyableEstimatedStats(report.estimatedStats) ? (
                  <Text variant="caption" color="secondary">{t('report.statsUnknown')}</Text>
                ) : null}
              </View>
              <View className="gap-2 border-b border-border pb-4">
                <Heading level={3}>{t('report.stages')}</Heading>
                {(report.pipelineStages ?? []).map((stage) => (
                  <View key={stage.id} className="border-l-2 border-border px-3 py-2">
                    <Text weight="semibold">{stage.label}</Text>
                    <Text variant="caption" color="secondary">{t(`stageStatus.${stage.status}`)}</Text>
                    {stage.note ? <Text variant="body-sm" color="secondary">{stage.note}</Text> : null}
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {tab === 'timeline' && report ? (
            <ReportEvidenceOverview job={job} timeline canSeekVideo={canSeekVideo} onSeek={seekTo} />
          ) : null}

          {tab === 'technical' && report ? (
            <View className="gap-4">
              <TechniqueAssessmentCard
                assessment={parseTechniqueAssessment(report.techniqueAssessment)}
                frameTimestamps={frameTimestamps}
                onSeek={seekTo}
                canSeekVideo={canSeekVideo}
              />
              <Card padding="lg" className="gap-2">
                <Heading level={3}>{t('tabs.technical')}</Heading>
                <Text variant="body-sm" color="secondary">{t('report.cvUnavailable')}</Text>
              </Card>
            </View>
          ) : null}

          {tab === 'tactical' && report ? (
            <Card padding="lg" className="gap-2">
              <Heading level={3}>{t('tabs.tactical')}</Heading>
              <Text variant="body-sm">{report.tacticalSummary ?? t('report.cvUnavailable')}</Text>
            </Card>
          ) : null}

          {tab === 'coaching' && report ? (
            <View className="gap-3">
              <StructuredCoachingCard
                items={coaching}
                onSeek={seekTo}
                onCreateGoal={handleCreateGoal}
                canSeekVideo={canSeekVideo}
              />
              {report.coachingNotes.trim() ? (
                <Card padding="lg" className="gap-2">
                  <Heading level={3}>{t('tabs.coaching')}</Heading>
                  <Text variant="body-sm">{report.coachingNotes}</Text>
                </Card>
              ) : null}
            </View>
          ) : null}

          {tab === 'video' ? (
            <Card padding="lg" className="gap-3">
              <Heading level={3}>{t('tabs.video')}</Heading>
              {videoUri ? (
                <View className="overflow-hidden rounded-xl bg-black">
                  <VideoView player={player} style={{ width: '100%', height: 220 }} contentFit="contain" nativeControls />
                </View>
              ) : (
                <Text variant="body-sm" color="secondary">{t('report.noVideo')}</Text>
              )}
            </Card>
          ) : null}

          {tab === 'video' && videoUri ? (
            <GpsVideoSyncCard
              sessions={gpsSessions}
              sync={videoSync}
              videoDurationSec={job.durationSec}
              getCurrentTime={() => player.currentTime}
              onSaveSync={handleSaveSync}
              onSeek={seekTo}
            />
          ) : null}

          {tab === 'ask' ? <AskThisMatchCard job={job} onSeek={seekTo} canSeekVideo={canSeekVideo} /> : null}

          {candidates.length > 0 ? (
            <IdentityConfirmationCard
              candidates={candidates}
              confirmation={job.identityConfirmation}
              selectedFrameIds={selectedFrameIds}
              onToggleFrame={(frameId) => {
                setSelectedFrameIds((current) =>
                  current.includes(frameId) ? current.filter((id) => id !== frameId) : [...current, frameId],
                );
              }}
              onConfirm={() => void handleConfirmIdentity()}
              onReject={() => void handleRejectIdentity()}
              frameUrls={frameUrls}
              busy={identityBusy}
            />
          ) : null}
          {identityError ? <Text color="error" accessibilityRole="alert">{t('identity.saveError')}</Text> : null}
          {targetAnchorSelectionEnabled && job.status === 'complete' && job.videoStoragePath ? (
            <TargetAnchorPanel key={job.id} job={job} frameUrls={frameUrls} />
          ) : null}
        </View>
      ) : null}
      {onOpenReel && job ? (
        <HighlightReelStudioModal
          visible={studioVisible}
          playerId={job.playerId}
          jobId={job.id}
          onClose={() => setStudioVisible(false)}
          onReelCreated={(reelId) => {
            setStudioVisible(false);
            onOpenReel(reelId);
          }}
        />
      ) : null}
    </Screen>
  );
}
