import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Badge } from '@/components/primitives/Badge';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { requestReelExport, saveReelToLibrary } from '@/features/media-library/services/mediaAccessCallable';
import { ReelRepository } from '@/features/reel-studio/repositories/ReelRepository';
import { shareRenderedReel } from '@/features/reel-studio/services/reelExportService';
import type { ReelExportErrorCode, ReelExportJob, ReelManifest } from '@/features/reel-studio/types';
import { LimitReachedCard } from '@/features/premium/components/LimitReachedCard';
import { quotaErrorFrom, type QuotaErrorInfo } from '@/features/premium/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { toUserMessage } from '@/utils/userFacingError';

/** Render and share. "Ready" is shown only after the server confirmed the file exists. */
export function ReelExportPanel({ reel, dirty }: { reel: ReelManifest; dirty: boolean }) {
  const { t } = useAppTranslation(['media']);
  const [job, setJob] = useState<ReelExportJob | null>(null);
  const [precheck, setPrecheck] = useState<{ code: ReelExportErrorCode; segment: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [quota, setQuota] = useState<QuotaErrorInfo | null>(null);
  const [savedExportId, setSavedExportId] = useState<string | null>(null);

  useEffect(
    () => ReelRepository.getInstance().subscribeToLatestExport(reel.ownerId, reel.id, setJob),
    [reel.id, reel.ownerId],
  );

  const outdated = job !== null && job.reelVersion !== reel.version;
  const inFlight = job?.status === 'queued' || job?.status === 'rendering';

  const render = async () => {
    setBusy(true);
    setPrecheck(null);
    setQuota(null);
    try {
      const result = await requestReelExport(reel.id);
      if (result.status === 'failed' && result.errorCode) {
        setPrecheck({ code: result.errorCode, segment: result.segmentIndex });
      }
    } catch (error) {
      const limit = quotaErrorFrom(error);
      if (limit) setQuota(limit);
      else Alert.alert(t('media:export.failedTitle'), toUserMessage(error, t('media:export.requestFailed')));
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!job) return;
    setBusy(true);
    try {
      await shareRenderedReel(job);
    } catch (error) {
      Alert.alert(t('media:export.failedTitle'), toUserMessage(error, t('media:export.shareFailed')));
    } finally {
      setBusy(false);
    }
  };

  const saveToLibrary = async () => {
    if (!job) return;
    setBusy(true);
    try {
      await saveReelToLibrary(job.id);
      setSavedExportId(job.id);
    } catch (error) {
      Alert.alert(t('media:export.failedTitle'), toUserMessage(error, t('media:export.saveToLibraryFailed')));
    } finally {
      setBusy(false);
    }
  };

  const errorText = (code: ReelExportErrorCode, segment: number | null) =>
    t(`media:export.error.${code}`, { clip: segment !== null ? segment + 1 : '' });

  return (
    <Card variant="outlined" padding="md" className="gap-2" testID="reel-export-panel">
      <View className="flex-row items-center justify-between">
        <Text weight="semibold">{t('media:export.title')}</Text>
        {job ? <Badge label={t(`media:export.status.${job.status}`)} variant={job.status === 'ready' ? 'success' : job.status === 'failed' ? 'error' : 'default'} size="sm" /> : null}
      </View>
      <Text variant="caption" color="secondary">
        {t('media:export.hint')}
      </Text>
      {quota ? <LimitReachedCard info={quota} /> : null}
      {precheck ? (
        <Text variant="body-sm" color="error">
          {errorText(precheck.code, precheck.segment)}
        </Text>
      ) : null}
      {job?.status === 'failed' && job.errorCode ? (
        <Text variant="body-sm" color="error">
          {errorText(job.errorCode, null)}
        </Text>
      ) : null}
      {inFlight ? (
        <Text variant="body-sm" color="secondary">
          {t('media:export.inProgress')}
        </Text>
      ) : null}
      {job?.status === 'ready' ? (
        <Text variant="body-sm">
          {t('media:export.readyDetail', {
            seconds: Math.round(job.durationSec ?? 0),
            mb: ((job.sizeBytes ?? 0) / (1024 * 1024)).toFixed(1),
          })}
          {job.hasCaptions ? ` · ${t('media:export.captionsTrack')}` : ''}
        </Text>
      ) : null}
      {outdated || dirty ? (
        <Text variant="caption" color="warning">
          {dirty ? t('media:export.saveFirst') : t('media:export.outdated')}
        </Text>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        <Button size="sm" variant="secondary" loading={busy && !inFlight} disabled={inFlight || dirty} onPress={() => void render()}>
          {job?.status === 'failed' ? t('media:export.retry') : t('media:export.render')}
        </Button>
        {job?.status === 'ready' && job.storagePath ? (
          <Button size="sm" variant="accent" loading={busy} onPress={() => void share()}>
            {t('media:export.share')}
          </Button>
        ) : null}
        {job?.status === 'ready' && job.storagePath && savedExportId !== job.id ? (
          <Button size="sm" variant="secondary" loading={busy} onPress={() => void saveToLibrary()} testID="reel-save-library">
            {t('media:export.saveToLibrary')}
          </Button>
        ) : null}
      </View>
      {job?.status === 'ready' && savedExportId === job.id ? (
        <Text variant="caption" color="secondary">
          {t('media:export.savedToLibrary')}
        </Text>
      ) : null}
    </Card>
  );
}
