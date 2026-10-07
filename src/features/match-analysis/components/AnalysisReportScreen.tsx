import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { ChoiceChip } from '@/components/primitives/ChoiceChip';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { AskThisMatchCard } from '@/features/match-analysis/components/AskThisMatchCard';
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
import { TechniqueAssessmentCard } from '@/features/match-analysis/components/TechniqueAssessmentCard';
import { parseTechniqueAssessment } from '@/features/match-analysis/services/techniqueAssessment';
import { getMatchAnalysisJob, updateMatchAnalysisJob } from '@/features/match-analysis/repositories/MatchAnalysisRepository';
import { useJobFrames } from '@/features/match-analysis/hooks/useJobFrames';
import { confirmIdentity, rejectIdentity } from '@/features/match-analysis/services/identityConfirmation';
import { hasApplyableEstimatedStats, type MatchAnalysisJob, type MatchEstimatedStats } from '@/features/match-analysis/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

type ReportTab = 'overview' | 'timeline' | 'technical' | 'tactical' | 'coaching' | 'video' | 'ask';

export type AnalysisReportScreenProps = {
  jobId: string;
  onBack: () => void;
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

export function AnalysisReportScreen({ jobId, onBack }: AnalysisReportScreenProps) {
  const { t } = useAppTranslation('matchAnalysis');
  const [job, setJob] = useState<MatchAnalysisJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ReportTab>('overview');
  const [selectedFrameIds, setSelectedFrameIds] = useState<string[]>([]);
  const [identityBusy, setIdentityBusy] = useState(false);
  const [goals, setGoals] = useState<DevelopmentGoal[]>([]);
  const [gpsSessions, setGpsSessions] = useState<GpsSession[]>([]);
  const playerId = job?.playerId ?? null;

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
    let cancelled = false;
    void getMatchAnalysisJob(jobId)
      .then((next) => {
        if (!cancelled) {
          setJob(next);
          setSelectedFrameIds(next?.identityConfirmation?.frameIds ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(t('report.missing'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [jobId, t]);

  const report = job?.report;
  const videoUri = job?.videoDownloadUrl ?? null;
  const player = useVideoPlayer(videoUri, (instance) => {
    instance.loop = false;
  });

  const tabs = useMemo(
    () =>
      (['overview', 'timeline', 'technical', 'tactical', 'coaching', 'video', 'ask'] as const).map((id) => ({
        id,
        label: t(`tabs.${id}`),
      })),
    [t],
  );

  const seekTo = (timestampSec: number) => {
    setTab('video');
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

  const handleConfirmIdentity = async () => {
    if (!job) {
      return;
    }
    setIdentityBusy(true);
    try {
      const identityConfirmation = confirmIdentity(selectedFrameIds, new Date().toISOString());
      await updateMatchAnalysisJob(job.id, { identityConfirmation });
      setJob({ ...job, identityConfirmation });
    } finally {
      setIdentityBusy(false);
    }
  };

  const handleRejectIdentity = async () => {
    if (!job) {
      return;
    }
    const identityConfirmation = rejectIdentity();
    await updateMatchAnalysisJob(job.id, { identityConfirmation });
    setJob({ ...job, identityConfirmation });
    setSelectedFrameIds([]);
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
      error={error}
      onRetry={onBack}
    >
      {job && report ? (
        <View className="gap-4">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {tabs.map((item) => (
              <ChoiceChip
                key={item.id}
                label={item.label}
                selected={tab === item.id}
                onPress={() => setTab(item.id)}
              />
            ))}
          </ScrollView>

          {tab === 'overview' ? (
            <View className="gap-4">
              <Card padding="lg" className="gap-2">
                <Heading level={3}>{report.headline}</Heading>
                <Text variant="caption" color="secondary">
                  {t('report.coverageBand', {
                    band: t(`band.${report.confidenceDimensions?.overallCoverage ?? report.coverage.confidenceLabel}`),
                  })}
                </Text>
                <Text variant="body-sm" color="secondary">{report.methodology}</Text>
              </Card>
              {quality ? <QualityReportCard quality={quality} /> : null}
              <Card padding="lg" className="gap-3">
                <Heading level={3}>{t('report.stats')}</Heading>
                <StatGrid stats={report.estimatedStats} />
                {!hasApplyableEstimatedStats(report.estimatedStats) ? (
                  <Text variant="caption" color="secondary">{t('report.statsUnknown')}</Text>
                ) : null}
              </Card>
              <Card padding="lg" className="gap-2">
                <Heading level={3}>{t('report.stages')}</Heading>
                {(report.pipelineStages ?? []).map((stage) => (
                  <View key={stage.id} className="rounded-lg border border-border px-3 py-2">
                    <Text weight="semibold">{stage.label}</Text>
                    <Text variant="caption" color="secondary">{t(`stageStatus.${stage.status}`)}</Text>
                    {stage.note ? <Text variant="body-sm" color="secondary">{stage.note}</Text> : null}
                  </View>
                ))}
              </Card>
            </View>
          ) : null}

          {tab === 'timeline' ? (
            <Card padding="lg" className="gap-2">
              <Heading level={3}>{t('tabs.timeline')}</Heading>
              {(report.moments ?? []).length === 0 ? (
                <Text variant="body-sm" color="secondary">{t('report.emptyTimeline')}</Text>
              ) : (
                report.moments.map((moment) => (
                  <Button
                    key={`${moment.timestampSec}-${moment.label}`}
                    variant="ghost"
                    onPress={() => seekTo(moment.timestampSec)}
                  >
                    {`${Math.floor(moment.timestampSec / 60)}:${String(moment.timestampSec % 60).padStart(2, '0')} · ${moment.label}`}
                  </Button>
                ))
              )}
            </Card>
          ) : null}

          {tab === 'technical' ? (
            <View className="gap-4">
              <TechniqueAssessmentCard
                assessment={parseTechniqueAssessment(report.techniqueAssessment)}
                frameTimestamps={frameTimestamps}
                onSeek={seekTo}
              />
              <Card padding="lg" className="gap-2">
                <Heading level={3}>{t('tabs.technical')}</Heading>
                <Text variant="body-sm" color="secondary">{t('report.cvUnavailable')}</Text>
              </Card>
            </View>
          ) : null}

          {tab === 'tactical' ? (
            <Card padding="lg" className="gap-2">
              <Heading level={3}>{t('tabs.tactical')}</Heading>
              <Text variant="body-sm">{report.tacticalSummary ?? t('report.cvUnavailable')}</Text>
            </Card>
          ) : null}

          {tab === 'coaching' ? (
            <View className="gap-3">
              <StructuredCoachingCard items={coaching} onSeek={seekTo} onCreateGoal={handleCreateGoal} />
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

          {tab === 'ask' ? <AskThisMatchCard job={job} onSeek={seekTo} /> : null}

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
        </View>
      ) : null}
    </Screen>
  );
}
