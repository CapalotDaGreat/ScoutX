import { useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
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
import { toUserMessage } from '@/utils/userFacingError';
import { waitForModalDismiss } from '@/features/highlight-videos/services/videoLibraryPermission';
import {
  estimatedStatsToMatchLogPayload,
  type MatchAnalysisJob,
  type MatchEstimatedStats,
} from '@/features/match-analysis/types';
import { type MatchLogPayload } from '@/features/player-statistics/types';
import { type PickedVideoAsset } from '@/features/highlight-videos/types';

export type MatchAnalysisModalProps = {
  visible: boolean;
  playerId: string | null;
  onClose: () => void;
  onApplyStats?: (payload: MatchLogPayload) => Promise<void>;
  onOpenHighlightReelStudio?: () => void;
};

function jobStatusLabel(job: MatchAnalysisJob): string {
  switch (job.status) {
    case 'complete':
      return 'Ready';
    case 'failed':
      return canRetryMatchAnalysis(job) ? 'Failed · tap to retry' : 'Failed';
    case 'processing':
    case 'queued':
      return 'Analyzing…';
    case 'uploading':
      return 'Upload interrupted';
    default:
      return 'Draft';
  }
}

function StatGrid({ stats }: { stats: MatchEstimatedStats }) {
  const rows: Array<[string, string]> = [
    ['Minutes', String(stats.minutesPlayed)],
    ['Goals', String(stats.goals)],
    ['Assists', String(stats.assists)],
    ['Shots', `${stats.shotsOnTarget}/${stats.shots} OT`],
    ['Pass %', `${stats.passCompletionPct}%`],
    ['Passes', `${stats.passesCompleted}/${stats.passesAttempted}`],
    ['Key passes', String(stats.keyPasses)],
    ['Tackles', String(stats.tackles)],
    ['Duels', `${stats.duelsWon}W / ${stats.duelsLost}L`],
    ['Cards', `${stats.yellowCards}Y / ${stats.redCards}R`],
    ['Rating', stats.matchRating.toFixed(1)],
  ];

  return (
    <View className="flex-row flex-wrap gap-2">
      {rows.map(([label, value]) => (
        <View
          key={label}
          className="min-w-[30%] flex-1 rounded-lg border border-border bg-background-secondary px-3 py-2"
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

function PipelineStageList({ stages }: { stages: Array<{ label: string; status: string; note?: string }> }) {
  return (
    <View className="gap-2">
      {stages.map((stage) => (
        <View key={stage.label} className="rounded-lg border border-border bg-background-secondary px-3 py-2">
          <Text weight="semibold">{stage.label}</Text>
          <Text variant="caption" color="secondary">
            {stage.status === 'complete' ? 'Complete' : stage.status === 'active' ? 'Active' : stage.status === 'failed' ? 'Failed' : 'Pending'}
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
  return (
    <View className="gap-2">
      {segments.map((segment) => (
        <View key={`${segment.label}-${segment.startSec}`} className="rounded-lg border border-border bg-background-secondary px-3 py-2">
          <Text weight="semibold">{segment.label}</Text>
          <Text variant="caption" color="secondary">
            {Math.floor(segment.startSec / 60)}:{String(segment.startSec % 60).padStart(2, '0')}–
            {Math.floor(segment.endSec / 60)}:{String(segment.endSec % 60).padStart(2, '0')}
            {segment.excludedFromPerformance ? ' · excluded from performance' : ''}
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
}: {
  job: MatchAnalysisJob;
  applying: boolean;
  onApply?: () => void;
  onOpenHighlightReelStudio?: () => void;
}) {
  const report = job.report;
  if (!report) {
    return null;
  }

  return (
    <View className="gap-4">
      <Card variant="elevated" padding="lg" className="gap-2">
        <Heading level={3}>{report.headline}</Heading>
        <Text variant="caption" color="secondary">
          Confidence {Math.round(report.confidence * 100)}% · Analysis quality: {report.coverage?.confidenceLabel ?? 'Limited'} · jersey #
          {job.targeting.jerseyNumber}
        </Text>
        <Text variant="body-sm" color="secondary" className="mt-1">
          {report.methodology}
        </Text>
      </Card>

      <Card variant="default" padding="lg" className="gap-3">
        <Heading level={3}>Analysis coverage</Heading>
        <View className="gap-1">
          <Text variant="body-sm">Visible: {report.coverage?.visiblePct ?? 0}%</Text>
          <Text variant="body-sm">Likely active but off camera: {report.coverage?.likelyOffCameraPct ?? 0}%</Text>
          <Text variant="body-sm">Unknown: {report.coverage?.unknownPct ?? 100}%</Text>
          <Text variant="body-sm" color="secondary">
            {report.coverage?.note ?? 'No reliable player coverage estimate was recorded.'}
          </Text>
        </View>
      </Card>

      <Card variant="default" padding="lg" className="gap-3">
        <Heading level={3}>Analysis pipeline</Heading>
        <PipelineStageList stages={report.pipelineStages ?? []} />
      </Card>

      <Card variant="default" padding="lg" className="gap-3">
        <Heading level={3}>Match segments</Heading>
        <SegmentList segments={report.segments ?? []} />
      </Card>

      <Card variant="default" padding="lg" className="gap-3">
        <Heading level={3}>Estimated match stats</Heading>
        <StatGrid stats={report.estimatedStats} />
        {onApply ? (
          <Button variant="accent" loading={applying} onPress={onApply}>
            Apply stats to my match log
          </Button>
        ) : null}
        {onOpenHighlightReelStudio ? (
          <Button variant="secondary" onPress={onOpenHighlightReelStudio}>
            Build highlight reel from this analysis
          </Button>
        ) : null}
      </Card>

      <Card variant="default" padding="lg" className="gap-2">
        <Heading level={3}>Strengths</Heading>
        {report.strengths.map((item) => (
          <Text key={item} variant="body-sm">
            • {item}
          </Text>
        ))}
      </Card>

      <Card variant="default" padding="lg" className="gap-2">
        <Heading level={3}>Areas to improve</Heading>
        {report.improvements.map((item) => (
          <Text key={item} variant="body-sm">
            • {item}
          </Text>
        ))}
      </Card>

      <Card variant="default" padding="lg" className="gap-2">
        <Heading level={3}>Coach notes</Heading>
        <Text variant="body-sm">{report.coachingNotes}</Text>
      </Card>

      {report.evidence?.length ? (
        <Card variant="default" padding="lg" className="gap-2">
          <Heading level={3}>Evidence-first review</Heading>
          {report.evidence.map((item, index) => (
            <View key={`${item.label}-${index}`} className="gap-1 border-b border-border pb-2 last:border-0 last:pb-0">
              <Text weight="semibold">
                {item.kind === 'unknown' ? 'Unknown' : item.kind === 'inference' ? 'Inference' : 'Observation'} · {item.label}
              </Text>
              <Text variant="body-sm" color="secondary">
                {item.detail}
              </Text>
              <Text variant="caption" color="secondary">
                Confidence {Math.round(item.confidence * 100)}%{item.timestampSec != null ? ` · ${Math.floor(item.timestampSec / 60)}:${String(item.timestampSec % 60).padStart(2, '0')}` : ''}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      {report.moments.length > 0 ? (
        <Card variant="default" padding="lg" className="gap-2">
          <Heading level={3}>Key moments</Heading>
          {report.moments.map((moment) => (
            <View key={`${moment.timestampSec}-${moment.label}`} className="gap-1">
              <Text weight="semibold">
                {Math.floor(moment.timestampSec / 60)}:
                {String(moment.timestampSec % 60).padStart(2, '0')} · {moment.label}
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
}: MatchAnalysisModalProps) {
  const {
    activeJob,
    recentJobs,
    isBusy,
    phaseLabel,
    error,
    pickVideo,
    startAnalysis,
    retryAnalysis,
    resetActive,
    setActiveJob,
  } = useMatchAnalysis(playerId);

  const [picked, setPicked] = useState<PickedVideoAsset | null>(null);
  const [jerseyNumber, setJerseyNumber] = useState('');
  const [kitPrimaryColor, setKitPrimaryColor] = useState('white');
  const [kitSecondaryColor, setKitSecondaryColor] = useState('black');
  const [opponent, setOpponent] = useState('');
  const [competition, setCompetition] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState('');
  const [notes, setNotes] = useState('');
  const [applying, setApplying] = useState(false);
  const [isPicking, setIsPicking] = useState(false);

  const showReport = activeJob?.status === 'complete' && activeJob.report;
  const retryable = !isBusy && canRetryMatchAnalysis(activeJob);

  const durationLabel = useMemo(() => {
    if (!picked) {
      return null;
    }
    const mins = Math.round(picked.durationSec / 60);
    return `${mins} min film selected`;
  }, [picked]);

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
      Alert.alert('Video', toUserMessage(err, 'Could not pick video.'));
    } finally {
      setIsPicking(false);
    }
  };

  const handleAnalyze = async () => {
    if (!picked) {
      Alert.alert('Video', 'Pick a match video first.');
      return;
    }
    if (!jerseyNumber.trim()) {
      Alert.alert('Jersey', 'Enter your jersey number so the AI can find you.');
      return;
    }
    if (!opponent.trim()) {
      Alert.alert('Match', 'Enter the opponent.');
      return;
    }

    try {
      await startAnalysis({
        localVideoUri: picked.uri,
        durationSec: picked.durationSec,
        fileSizeBytes: picked.fileSizeBytes,
        targeting: {
          jerseyNumber: jerseyNumber.trim(),
          kitPrimaryColor: kitPrimaryColor.trim() || 'unknown',
          kitSecondaryColor: kitSecondaryColor.trim() || 'unknown',
          notes: notes.trim() || undefined,
        },
        match: {
          opponent: opponent.trim(),
          competition: competition.trim() || 'Friendly',
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
        `AI match analysis (${Math.round(activeJob.report.confidence * 100)}% confidence). ${activeJob.report.coachingNotes}`,
      );
      await onApplyStats(payload);
      Alert.alert('Saved', 'Estimated stats were added to your match log.');
    } catch (err) {
      Alert.alert('Save failed', toUserMessage(err, 'Could not save match log.'));
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal visible={visible && !isPicking} onClose={onClose} title="Analyze match video" size="fullscreen">
      <ScrollView className="flex-1" contentContainerStyle={{ gap: 16, paddingBottom: 32 }}>
        <Text variant="body-sm" color="secondary">
          Choose up to 150 minutes of match film from Photos / Gallery — ideal for full Veo camera
          recordings from grassroots games. iCloud videos work too: ScoutX downloads them
          automatically, so just stay online while it prepares. ScoutX samples frames across the match,
          finds your jersey, and returns coaching feedback plus estimated personal stats.
        </Text>

        {error && !retryable ? (
          <Text variant="body-sm" color="error">
            {error}
          </Text>
        ) : null}

        {retryable && activeJob ? (
          <Card>
            <View className="gap-3">
              <Heading level={3}>
                {activeJob.match.date} vs {activeJob.match.opponent}
              </Heading>
              <Text variant="body-sm" color="error">
                {activeJob.error ?? error ?? "The AI couldn't finish this analysis."}
              </Text>
              <Text variant="caption" color="secondary">
                Your footage is already uploaded, so retrying won't upload it again.
              </Text>
              <Button variant="accent" onPress={() => void handleRetry()}>
                Retry analysis
              </Button>
            </View>
          </Card>
        ) : null}

        {showReport && activeJob ? (
          <ReportView
            job={activeJob}
            applying={applying}
            onApply={onApplyStats ? () => void handleApply() : undefined}
            onOpenHighlightReelStudio={onOpenHighlightReelStudio}
          />
        ) : (
          <View className="gap-3">
            <Button variant="secondary" onPress={() => void handlePick()} disabled={isBusy || isPicking}>
              {picked ? 'Change video from Photos' : 'Choose from Photos / Gallery'}
            </Button>
            {durationLabel ? (
              <Text variant="caption" color="secondary">
                {durationLabel}
                {picked?.fileSizeBytes
                  ? ` · ${(picked.fileSizeBytes / (1024 * 1024)).toFixed(0)} MB`
                  : ''}
              </Text>
            ) : null}

            <Input
              label="Your jersey number"
              value={jerseyNumber}
              onChangeText={setJerseyNumber}
              keyboardType="number-pad"
              placeholder="10"
            />
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Input
                  label="Kit primary color"
                  value={kitPrimaryColor}
                  onChangeText={setKitPrimaryColor}
                  placeholder="white"
                />
              </View>
              <View className="flex-1">
                <Input
                  label="Kit secondary"
                  value={kitSecondaryColor}
                  onChangeText={setKitSecondaryColor}
                  placeholder="black"
                />
              </View>
            </View>
            <Input label="Opponent" value={opponent} onChangeText={setOpponent} placeholder="FC Example" />
            <Input
              label="Competition"
              value={competition}
              onChangeText={setCompetition}
              placeholder="League / Cup"
            />
            <Input label="Match date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
            <Input
              label="Result (optional)"
              value={result}
              onChangeText={setResult}
              placeholder="W 2-1"
            />
            <Input
              label="Notes for the AI (optional)"
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. I played right mid after minute 60"
            />

            <Button variant="accent" loading={isBusy} onPress={() => void handleAnalyze()}>
              {phaseLabel ?? 'Upload & analyze my performance'}
            </Button>

            {isBusy && activeJob?.uploadProgress != null ? (
              <Text variant="caption" color="secondary">
                Progress {Math.round(activeJob.uploadProgress)}%
              </Text>
            ) : null}
          </View>
        )}

        {recentJobs.length > 0 ? (
          <View className="gap-2">
            <Heading level={3}>Recent analyses</Heading>
            {recentJobs.slice(0, 5).map((job) => (
              <Button
                key={job.id}
                variant="ghost"
                onPress={() => {
                  setActiveJob(job);
                }}
              >
                {`${job.match.date} vs ${job.match.opponent} · ${jobStatusLabel(job)}`}
              </Button>
            ))}
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
            Analyze another match
          </Button>
        ) : null}

        <Button variant="ghost" onPress={onClose}>
          Close
        </Button>
      </ScrollView>
    </Modal>
  );
}
