import { useState } from 'react';
import { Switch, View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { CheckboxRow } from '@/components/primitives/CheckboxRow';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { type ProcessingMode } from '@/features/match-analysis/services/analysisMode';
import { type VideoConsentChoices } from '@/features/match-analysis/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

const ACKNOWLEDGEMENTS = ['processing', 'rights', 'retention', 'provider'] as const;
type Acknowledgement = (typeof ACKNOWLEDGEMENTS)[number];

export type VideoConsentSheetProps = {
  processingMode: ProcessingMode;
  frameCount: number;
  busy?: boolean;
  onAgree: (choices: VideoConsentChoices) => void;
  onCancel: () => void;
};

function OptionRow({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (next: boolean) => void }) {
  return (
    <View className="flex-row items-start gap-3">
      <View className="flex-1 gap-1">
        <Text weight="semibold">{label}</Text>
        <Text variant="caption" color="secondary">
          {hint}
        </Text>
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

/**
 * Explicit, per-video consent. Picking a file is not consent; nothing is uploaded until every
 * point is ticked. Every option that keeps media defaults to off.
 */
export function VideoConsentSheet({ processingMode, frameCount, busy, onAgree, onCancel }: VideoConsentSheetProps) {
  const { t } = useAppTranslation('matchAnalysis');
  const [acks, setAcks] = useState<Record<Acknowledgement, boolean>>({
    processing: false,
    rights: false,
    retention: false,
    provider: false,
  });
  const [choices, setChoices] = useState<VideoConsentChoices>({ retainSource: false, keepForRetry: false, evidenceClips: false });
  const allTicked = ACKNOWLEDGEMENTS.every((key) => acks[key]);
  const cloud = processingMode === 'cloud_video';

  return (
    <Card variant="elevated" padding="lg" className="gap-4" testID="video-consent-sheet">
      <Heading level={3}>{t('video.consent.title')}</Heading>
      <Text variant="body-sm" color="secondary">
        {cloud ? t('video.consent.cloudSummary') : t('video.consent.deviceSummary', { count: frameCount })}
      </Text>
      <View className="gap-3">
        {ACKNOWLEDGEMENTS.map((key) => (
          <CheckboxRow
            key={key}
            checked={acks[key]}
            label={t(`video.consent.ack.${key}`)}
            onToggle={() => setAcks((current) => ({ ...current, [key]: !current[key] }))}
            testID={`video-consent-${key}`}
          />
        ))}
      </View>
      {cloud ? (
        <View className="gap-3">
          <Text weight="semibold">{t('video.consent.optionsTitle')}</Text>
          <OptionRow
            label={t('video.consent.keepVideo')}
            hint={t('video.consent.keepVideoHint')}
            value={choices.retainSource}
            onChange={(retainSource) => setChoices((current) => ({ ...current, retainSource }))}
          />
          <OptionRow
            label={t('video.consent.evidenceClips')}
            hint={t('video.consent.evidenceClipsHint')}
            value={choices.evidenceClips}
            onChange={(evidenceClips) => setChoices((current) => ({ ...current, evidenceClips }))}
          />
          <OptionRow
            label={t('video.consent.keepForRetry')}
            hint={t('video.consent.keepForRetryHint')}
            value={choices.keepForRetry}
            onChange={(keepForRetry) => setChoices((current) => ({ ...current, keepForRetry }))}
          />
        </View>
      ) : null}
      {!allTicked ? (
        <Text variant="caption" color="secondary">
          {t('video.consent.required')}
        </Text>
      ) : null}
      <View className="flex-row gap-2">
        <Button variant="secondary" onPress={onCancel} className="flex-1">
          {t('video.consent.cancel')}
        </Button>
        <Button
          variant="accent"
          loading={busy}
          disabled={!allTicked}
          onPress={() => onAgree(cloud ? choices : { retainSource: false, keepForRetry: false, evidenceClips: false })}
          className="flex-1"
          testID="video-consent-agree"
        >
          {t('video.consent.agree')}
        </Button>
      </View>
    </Card>
  );
}
