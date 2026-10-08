import { useState } from 'react';
import { View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import {
  FOOTBALL_SOURCE_PROVIDERS,
  FOOTBALL_SOURCE_TYPES,
  parseFootballSourceUrl,
  type FootballSourceProvider,
  type FootballSourceType,
  type FootballSourceUrlError,
} from '@/features/football-sources/core';
import {
  FootballSourceError,
  addExternalFootballSource,
  type FootballSourceErrorReason,
} from '@/features/football-sources/services/footballSourceService';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

type Step =
  | { kind: 'url' }
  | { kind: 'unsupported' }
  | { kind: 'confirm'; url: string; host: string; provider: FootballSourceProvider };

type UrlErrorKey = 'empty' | 'not_https' | 'invalid';

function urlErrorKey(error: FootballSourceUrlError): UrlErrorKey {
  if (error === 'empty') return 'empty';
  if (error === 'not_https') return 'not_https';
  return 'invalid';
}

const SUPPORTED_NAMES = FOOTBALL_SOURCE_PROVIDERS.filter((provider) => provider.enabled)
  .map((provider) => provider.name)
  .join(', ');

export type AddFootballSourceSheetProps = {
  visible: boolean;
  onClose: () => void;
  onAdded?: () => void;
};

export function AddFootballSourceSheet({ visible, onClose, onAdded }: AddFootballSourceSheetProps) {
  const { t } = useAppTranslation('passport');
  const [step, setStep] = useState<Step>({ kind: 'url' });
  const [input, setInput] = useState('');
  const [urlError, setUrlError] = useState<UrlErrorKey | null>(null);
  const [sourceType, setSourceType] = useState<FootballSourceType | null>(null);
  const [saveError, setSaveError] = useState<FootballSourceErrorReason | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setStep({ kind: 'url' });
    setInput('');
    setUrlError(null);
    setSourceType(null);
    setSaveError(null);
    setSaving(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleContinue = () => {
    const parsed = parseFootballSourceUrl(input);
    if (parsed.ok) {
      setUrlError(null);
      setStep({ kind: 'confirm', url: parsed.url, host: parsed.host, provider: parsed.provider });
      return;
    }
    if (parsed.error === 'unsupported_provider' || parsed.error === 'provider_disabled') {
      setUrlError(null);
      setStep({ kind: 'unsupported' });
      return;
    }
    setUrlError(urlErrorKey(parsed.error));
  };

  const handleAdd = async () => {
    if (step.kind !== 'confirm' || !sourceType) return;
    setSaving(true);
    setSaveError(null);
    try {
      await addExternalFootballSource(step.url, sourceType);
      reset();
      onAdded?.();
      onClose();
    } catch (error) {
      setSaveError(error instanceof FootballSourceError ? error.reason : 'unknown');
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} onClose={close} title={t('footballSources.addTitle')} size="md">
      {step.kind === 'url' ? (
        <View className="gap-4" testID="football-source-url-step">
          <Input
            label={t('footballSources.urlLabel')}
            placeholder="https://"
            value={input}
            onChangeText={(value) => {
              setInput(value);
              setUrlError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            textContentType="URL"
            error={urlError ? t(`footballSources.urlErrors.${urlError}`) : undefined}
            testID="football-source-url-input"
          />
          <Text variant="caption" color="secondary">
            {t('footballSources.linkOnlyNote')}
          </Text>
          <Button variant="accent" onPress={handleContinue} testID="football-source-continue">
            {t('footballSources.continue')}
          </Button>
        </View>
      ) : null}

      {step.kind === 'unsupported' ? (
        <View className="gap-4" testID="football-source-unsupported">
          <Text weight="semibold">{t('footballSources.unsupportedTitle')}</Text>
          <Text variant="body-sm" color="secondary">
            {t('footballSources.unsupportedBody')}
          </Text>
          <Text variant="caption" color="secondary">
            {t('footballSources.supportedList', { list: SUPPORTED_NAMES })}
          </Text>
          <Button variant="secondary" onPress={() => setStep({ kind: 'url' })}>
            {t('footballSources.back')}
          </Button>
        </View>
      ) : null}

      {step.kind === 'confirm' ? (
        <View className="gap-4" testID="football-source-confirm">
          <View className="gap-1">
            <Text weight="semibold">{t('footballSources.foundTitle')}</Text>
            <Text variant="body-sm">{step.provider.name}</Text>
            <Text variant="caption" color="secondary" numberOfLines={2}>
              {step.url.replace(/^https:\/\//, '')}
            </Text>
          </View>
          <View className="gap-2">
            <Text variant="caption" weight="semibold">
              {t('footballSources.typePrompt')}
            </Text>
            <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
              {FOOTBALL_SOURCE_TYPES.map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={sourceType === option ? 'accent' : 'secondary'}
                  accessibilityRole="radio"
                  aria-checked={sourceType === option}
                  onPress={() => setSourceType(option)}
                  testID={`football-source-type-${option}`}
                >
                  {t(`footballSources.types.${option}`)}
                </Button>
              ))}
            </View>
          </View>
          <Text variant="caption" color="secondary">
            {t('footballSources.privateByDefault')}
          </Text>
          <Text variant="caption" color="tertiary">
            {t('footballSources.disclaimer')}
          </Text>
          {saveError ? (
            <Text variant="body-sm" color="error" testID="football-source-save-error">
              {t(`footballSources.errors.${saveError}`)}
            </Text>
          ) : null}
          <View className="flex-row gap-2">
            <Button variant="secondary" className="flex-1" onPress={() => setStep({ kind: 'url' })}>
              {t('footballSources.back')}
            </Button>
            <Button
              variant="accent"
              className="flex-1"
              disabled={!sourceType}
              loading={saving}
              onPress={() => void handleAdd()}
              testID="football-source-add-confirm"
            >
              {t('footballSources.confirmAdd')}
            </Button>
          </View>
        </View>
      ) : null}
    </Modal>
  );
}
