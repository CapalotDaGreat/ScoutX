import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { formatClock } from '@/features/match-analysis/components/AnalysisIntelligenceCards';
import {
  answerAskThisMatch,
  type AskThisMatchCitation,
} from '@/features/match-analysis/services/askThisMatchService';
import { requestAskThisMatch } from '@/features/match-analysis/services/matchAnalysisCallable';
import { type MatchAnalysisJob } from '@/features/match-analysis/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

/**
 * Answers come from stored events, observations and coaching moments only, and each line
 * is a citation the player can open at its video timestamp.
 */
export function AskThisMatchCard({ job, onSeek }: { job: MatchAnalysisJob; onSeek: (timestampSec: number) => void }) {
  const { t } = useAppTranslation('matchAnalysis');
  const [question, setQuestion] = useState('');
  const [citations, setCitations] = useState<AskThisMatchCitation[]>([]);
  const [state, setState] = useState<'answered' | 'insufficient' | null>(null);
  const [busy, setBusy] = useState(false);

  const handleAsk = async () => {
    const nextQuestion = question.trim();
    if (!nextQuestion) {
      return;
    }
    setBusy(true);
    try {
      const remote = await requestAskThisMatch(job.id, nextQuestion);
      setState(remote.state);
      setCitations(remote.state === 'answered' ? remote.citations : []);
    } catch {
      const local = answerAskThisMatch({
        question: nextQuestion,
        events: job.events ?? job.report?.events ?? [],
        evidence: job.report?.evidence ?? [],
        coachingMoments: job.report?.coachingMoments ?? [],
      });
      setState(local.state);
      setCitations(local.state === 'answered' ? local.citations : []);
    } finally {
      setBusy(false);
    }
  };

  const lineFor = (citation: AskThisMatchCitation): string =>
    citation.kind === 'event' ? t('ask.eventLine', { type: citation.label }) : citation.detail || citation.label;

  return (
    <Card padding="lg" className="gap-3">
      <Heading level={3}>{t('ask.title')}</Heading>
      <Text variant="body-sm" color="secondary">
        {t('ask.hint')}
      </Text>
      <Input
        label={t('ask.question')}
        value={question}
        onChangeText={setQuestion}
        placeholder={t('ask.placeholder')}
      />
      <Button variant="accent" loading={busy} onPress={() => void handleAsk()}>
        {t('ask.submit')}
      </Button>
      {state === 'insufficient' ? (
        <Text variant="body-sm" color="secondary" accessibilityLiveRegion="polite">
          {t('ask.insufficient')}
        </Text>
      ) : null}
      {state === 'answered' ? (
        <View className="gap-2" accessibilityLiveRegion="polite">
          <Text variant="caption" color="secondary">
            {t('ask.citedFrom', { count: citations.length })}
          </Text>
          {citations.map((citation) => {
            const line = lineFor(citation);
            const timestamp = typeof citation.timestampSec === 'number' ? citation.timestampSec : null;
            return timestamp !== null ? (
              <Pressable
                key={citation.evidenceId}
                accessibilityRole="button"
                accessibilityLabel={`${line} · ${t('coaching.watch', { time: formatClock(timestamp) })}`}
                onPress={() => onSeek(timestamp)}
                className="min-h-11 justify-center rounded-lg border border-border px-3 py-2 active:opacity-80"
              >
                <Text variant="body-sm">{line}</Text>
                <Text variant="caption" color="secondary">
                  {t('coaching.watch', { time: formatClock(timestamp) })}
                </Text>
              </Pressable>
            ) : (
              <View key={citation.evidenceId} className="rounded-lg border border-border px-3 py-2">
                <Text variant="body-sm">{line}</Text>
                <Text variant="caption" color="tertiary">
                  {t('ask.noTimestamp')}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </Card>
  );
}
