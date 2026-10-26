import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import {
  inspectVideoSource,
  looksLikeVideoLink,
  type VideoSourceInspection,
} from '@/features/match-analysis/services/trackingV3Service';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

/**
 * "Import from link": recognises Veo match pages (explains the official export path - there is no
 * public Veo API) and validates direct HTTPS video links server-side (size, type, SSRF-safe).
 */
export function ImportFromLinkPanel({ onReady }: { onReady?: (inspection: VideoSourceInspection, url: string) => void }) {
  const { t } = useAppTranslation('matchAnalysis');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VideoSourceInspection | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    if (!looksLikeVideoLink(url)) {
      setError(t('tracking.import.invalid'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const inspection = await inspectVideoSource(url.trim());
      setResult(inspection);
      if (inspection.status === 'ready') onReady?.(inspection, url.trim());
    } catch {
      setError(t('tracking.import.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="gap-2">
      <Text weight="semibold">{t('tracking.import.title')}</Text>
      <Input label={t('tracking.import.label')} value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false}
        keyboardType="url" placeholder="https://app.veo.co/matches/..." />
      <Button size="sm" onPress={() => void check()} disabled={busy || !url}>{t('tracking.import.check')}</Button>
      {error ? <Text color="error" variant="caption">{error}</Text> : null}
      {result ? (
        <View className="gap-1">
          <Text color={result.status === 'ready' ? 'success' : 'warning'}>{t(`tracking.import.status.${result.status}`)}</Text>
          {result.provider === 'veo' && result.metadata.title ? (
            <Text variant="caption" color="secondary">{String(result.metadata.title)} · {String(result.metadata.recordedOn ?? '')}</Text>
          ) : null}
          {result.provider === 'veo' ? (
            (['veoStep1', 'veoStep2', 'veoStep3'] as const).map((key, i) => (
              <Text key={key} variant="caption">{i + 1}. {t(`tracking.import.${key}`)}</Text>
            ))
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
