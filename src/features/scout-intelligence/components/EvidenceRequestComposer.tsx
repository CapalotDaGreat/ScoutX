import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { createCallableFunction } from '@/firebase/callableFunctions';
import type { EvidenceRequestKind } from '@/features/scout-intelligence/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { toUserMessage } from '@/utils/userFacingError';

const KINDS: EvidenceRequestKind[] = ['match_footage', 'highlight', 'gps', 'statistics', 'coach_note'];

export type EvidenceRequestComposerProps = {
  playerId: string;
};

export function EvidenceRequestComposer({ playerId }: EvidenceRequestComposerProps) {
  const { t } = useAppTranslation(['scout', 'common', 'errors']);
  const [kinds, setKinds] = useState<EvidenceRequestKind[]>(['highlight']);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const toggle = (kind: EvidenceRequestKind) => {
    setKinds((current) =>
      current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind],
    );
  };

  const submit = async () => {
    const callable = createCallableFunction<{ playerId: string; kinds: EvidenceRequestKind[]; message: string }>(
      'requestEvidence',
    );
    if (!callable) {
      setStatus('error');
      setError(t('scout:intelligence.requestUnavailable'));
      return;
    }
    setStatus('saving');
    setError(null);
    try {
      await callable({ playerId, kinds, message });
      setStatus('sent');
    } catch (caught) {
      setStatus('error');
      setError(toUserMessage(caught, t('scout:intelligence.requestFailed')));
    }
  };

  return (
    <Card variant="outlined" padding="md" className="gap-3">
      <Text variant="body" className="font-sans-semibold">{t('scout:intelligence.requestTitle')}</Text>
      <Text variant="caption" color="secondary">
        {t('scout:intelligence.requestHint')}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {KINDS.map((kind) => (
          <Button
            key={kind}
            size="sm"
            variant={kinds.includes(kind) ? 'primary' : 'secondary'}
            onPress={() => toggle(kind)}
          >
            {t(`scout:intelligence.kinds.${kind}`)}
          </Button>
        ))}
      </View>
      <Input
        value={message}
        onChangeText={setMessage}
        placeholder={t('scout:intelligence.requestPlaceholder')}
        multiline
      />
      {error ? (
        <Text variant="caption" color="error">
          {error}
        </Text>
      ) : null}
      {status === 'sent' ? (
        <Text variant="caption" color="secondary">
          {t('scout:intelligence.requestSent')}
        </Text>
      ) : (
        <Button onPress={() => void submit()} disabled={kinds.length === 0 || status === 'saving'}>
          {t('scout:intelligence.requestAction')}
        </Button>
      )}
    </Card>
  );
}
