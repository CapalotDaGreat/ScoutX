import { useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { useMatchAnalysis } from '@/features/match-analysis/hooks/useMatchAnalysis';
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
};

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

function ReportView({
  job,
  applying,
  onApply,
}: {
  job: MatchAnalysisJob;
  applying: boolean;
  onApply?: () => void;
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
          Confidence {Math.round(report.confidence * 100)}% · AI-estimated for jersey #
          {job.targeting.jerseyNumber}
        </Text>
        <Text variant="body-sm" color="secondary" className="mt-1">
          {report.methodology}
        </Text>
      </Card>

      <Card variant="default" padding="lg" className="gap-3">
        <Heading level={3}>Estimated match stats</Heading>
        <StatGrid stats={report.estimatedStats} />
        {onApply ? (
          <Button variant="accent" loading={applying} onPress={onApply}>
            Apply stats to my match log
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
}: MatchAnalysisModalProps) {
  const {
    activeJob,
    recentJobs,
    isBusy,
    phaseLabel,
    error,
    pickVideo,
    startAnalysis,
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

  const showReport = activeJob?.status === 'complete' && activeJob.report;

  const durationLabel = useMemo(() => {
    if (!picked) {
      return null;
    }
    const mins = Math.round(picked.durationSec / 60);
    return `${mins} min film selected`;
  }, [picked]);

  const handlePick = async () => {
    try {
      const video = await pickVideo();
      if (video) {
        setPicked(video);
        resetActive();
      }
    } catch (err) {
      Alert.alert('Video', err instanceof Error ? err.message : 'Could not pick video.');
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
    } catch (err) {
      Alert.alert('Analysis', err instanceof Error ? err.message : 'Analysis failed.');
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
      Alert.alert('Save failed', err instanceof Error ? err.message : 'Could not save match log.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="Analyze match video" size="fullscreen">
      <ScrollView className="flex-1" contentContainerStyle={{ gap: 16, paddingBottom: 32 }}>
        <Text variant="body-sm" color="secondary">
          Upload up to 150 minutes of match film. ScoutX samples frames across the match, finds your
          jersey, and returns coaching feedback plus estimated personal stats (passes, shots, duels,
          and more).
        </Text>

        {error ? (
          <Text variant="body-sm" color="error">
            {error}
          </Text>
        ) : null}

        {showReport && activeJob ? (
          <ReportView
            job={activeJob}
            applying={applying}
            onApply={onApplyStats ? () => void handleApply() : undefined}
          />
        ) : (
          <View className="gap-3">
            <Button variant="secondary" onPress={() => void handlePick()} disabled={isBusy}>
              {picked ? 'Change match video' : 'Choose match video'}
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
                {job.match.date} vs {job.match.opponent} · {job.status}
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
