import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { ProgressBar } from '@/components/primitives/ProgressBar';
import { Text } from '@/components/primitives/Text';
import {
  formatBytes,
  formatEta,
  formatRate,
  progressFraction,
} from '@/features/media-upload/services/chunkPlan';
import { type UploadViewState } from '@/features/media-upload/types';
import { LimitReachedCard } from '@/features/premium/components/LimitReachedCard';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type UploadProgressCardProps = {
  state: UploadViewState;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  /** Opens Settings > Plan & usage when an allowance was reached. */
  onOpenPlan?: () => void;
};

export function UploadProgressCard({ state, onPause, onResume, onCancel, onOpenPlan }: UploadProgressCardProps) {
  const { t } = useAppTranslation('media');
  if (state.phase === 'idle') return null;

  const percent = Math.round(progressFraction(state.sentBytes, state.totalBytes) * 100);
  const rate = formatRate(state.bytesPerSecond);
  const eta = formatEta(state.etaSeconds);
  const transferring = state.phase === 'uploading' || state.phase === 'preparing';

  return (
    <View className="gap-2 rounded-xl border border-border p-3" testID="upload-progress">
      <Text variant="label">{t(`upload.phase.${state.phase}`)}</Text>
      {state.totalBytes > 0 ? (
        <>
          <ProgressBar
            value={percent}
            accessibilityLabel={t('upload.progressLabel', { percent })}
          />
          <Text variant="caption" color="secondary" testID="upload-progress-bytes">
            {t('upload.bytes', {
              sent: formatBytes(state.sentBytes),
              total: formatBytes(state.totalBytes),
              percent,
            })}
          </Text>
        </>
      ) : null}
      {state.phase === 'uploading' && (rate || eta) ? (
        <Text variant="caption" color="secondary">
          {[rate ? t('upload.speed', { rate }) : null, eta ? t('upload.eta', { eta }) : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}
      {transferring ? (
        <Text variant="caption" color="tertiary">
          {t('upload.foregroundNote')}
        </Text>
      ) : null}
      {state.phase === 'processing' ? (
        <Text variant="caption" color="secondary">
          {t('upload.processingNote')}
        </Text>
      ) : null}
      {state.phase === 'failed' && state.quota ? <LimitReachedCard info={state.quota} onOpenPlan={onOpenPlan} /> : null}
      {state.phase === 'failed' && state.error && !state.quota ? (
        <Text variant="caption" color="error" testID="upload-progress-error">
          {state.rejectionReason ? t(`upload.rejection.${state.rejectionReason}`) : t(`upload.error.${state.error}`)}
        </Text>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        {state.phase === 'uploading' ? (
          <Button size="sm" variant="secondary" onPress={onPause} testID="upload-pause">
            {t('upload.pause')}
          </Button>
        ) : null}
        {state.phase === 'paused' || (state.phase === 'failed' && state.error !== 'rejected' && !state.quota) ? (
          <Button size="sm" variant="accent" onPress={onResume} testID="upload-resume">
            {state.phase === 'paused' ? t('upload.resume') : t('upload.retry')}
          </Button>
        ) : null}
        {state.phase === 'uploading' || state.phase === 'paused' ? (
          <Button size="sm" variant="ghost" onPress={onCancel} testID="upload-cancel">
            {t('upload.cancel')}
          </Button>
        ) : null}
      </View>
    </View>
  );
}
