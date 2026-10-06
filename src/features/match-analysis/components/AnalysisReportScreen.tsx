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
import { IdentityConfirmationCard } from '@/features/match-analysis/components/IdentityConfirmationCard';
import { getMatchAnalysisJob, updateMatchAnalysisJob } from '@/features/match-analysis/repositories/MatchAnalysisRepository';
import { confirmIdentity, rejectIdentity } from '@/features/match-analysis/services/identityConfirmation';
import { hasApplyableEstimatedStats, type MatchAnalysisJob, type MatchEstimatedStats } from '@/features/match-analysis/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

type ReportTab = 'overview' | 'timeline' | 'technical' | 'tactical' | 'coaching' | 'video' | 'ask';

export type AnalysisReportScreenProps = {
  jobId: string;
  onBack: () => void;
};

function formatUnknown(value: number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  return String(value);
}

function StatGrid({ stats }: { stats: MatchEstimatedStats }) {
  const rows: Array<[string, string]> = [
    ['Minutes', formatUnknown(stats.minutesPlayed)],
    ['Goals', formatUnknown(stats.goals)],
    ['Assists', formatUnknown(stats.assists)],
    ['Shots', formatUnknown(stats.shots)],
    ['Pass %', formatUnknown(stats.passCompletionPct)],
    ['Tackles', formatUnknown(stats.tackles)],
    ['Rating', formatUnknown(stats.matchRating)],
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

  const frameUrls = Object.fromEntries(
    (job?.frames ?? []).map((frame) => [frame.id, frame.downloadUrl]),
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
            <Card padding="lg" className="gap-2">
              <Heading level={3}>{t('tabs.technical')}</Heading>
              <Text variant="body-sm" color="secondary">{t('report.cvUnavailable')}</Text>
            </Card>
          ) : null}

          {tab === 'tactical' ? (
            <Card padding="lg" className="gap-2">
              <Heading level={3}>{t('tabs.tactical')}</Heading>
              <Text variant="body-sm">{report.tacticalSummary ?? t('report.cvUnavailable')}</Text>
            </Card>
          ) : null}

          {tab === 'coaching' ? (
            <Card padding="lg" className="gap-2">
              <Heading level={3}>{t('tabs.coaching')}</Heading>
              {report.coachingNotes.trim() ? (
                <Text variant="body-sm">{report.coachingNotes}</Text>
              ) : (
                <Text variant="body-sm" color="secondary">{t('ask.insufficient')}</Text>
              )}
            </Card>
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

          {tab === 'ask' ? <AskThisMatchCard job={job} /> : null}

          {(job.identityCandidates ?? []).length > 0 ? (
            <IdentityConfirmationCard
              candidates={job.identityCandidates ?? []}
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
