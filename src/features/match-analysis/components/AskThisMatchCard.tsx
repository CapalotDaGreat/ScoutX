import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { answerAskThisMatch } from '@/features/match-analysis/services/askThisMatchService';
import { requestAskThisMatch } from '@/features/match-analysis/services/matchAnalysisCallable';
import { type MatchAnalysisJob } from '@/features/match-analysis/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { toUserMessage } from '@/utils/userFacingError';

export function AskThisMatchCard({ job }: { job: MatchAnalysisJob }) {
  const { t } = useAppTranslation('matchAnalysis');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [state, setState] = useState<'answered' | 'insufficient' | null>(null);
  const [busy, setBusy] = useState(false);

  const handleAsk = async () => {
    const nextQuestion = question.trim();
    if (!nextQuestion) {
      return;
    }
    setBusy(true);
    try {
      const local = answerAskThisMatch({
        question: nextQuestion,
        events: job.events ?? job.report?.events ?? [],
        evidence: job.report?.evidence ?? [],
        coachingMoments: job.report?.coachingMoments ?? [],
      });
      try {
        const remote = await requestAskThisMatch(job.id, nextQuestion);
        setState(remote.state);
        setAnswer(remote.answer);
      } catch {
        setState(local.state);
        setAnswer(local.answer);
      }
    } catch (error) {
      setState('insufficient');
      setAnswer(toUserMessage(error, t('ask.insufficient')));
    } finally {
      setBusy(false);
    }
  };

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
      {answer ? (
        <View className="gap-1">
          <Text variant="body-sm">{answer}</Text>
          {state === 'insufficient' ? (
            <Text variant="caption" color="secondary">
              {t('ask.insufficient')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
