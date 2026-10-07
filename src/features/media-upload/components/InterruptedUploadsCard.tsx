import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { UploadProgressCard } from '@/features/media-upload/components/UploadProgressCard';
import { useChunkedUpload } from '@/features/media-upload/hooks/useChunkedUpload';
import { PendingUploadStore } from '@/features/media-upload/repositories/PendingUploadStore';
import { UploadSessionRepository } from '@/features/media-upload/repositories/UploadSessionRepository';
import { discardPendingUpload } from '@/features/media-upload/services/chunkedUploadService';
import {
  classifyPendingUpload,
  requestFromPending,
  type RecoveryState,
} from '@/features/media-upload/services/uploadRecovery';
import type { PendingUpload } from '@/features/media-upload/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

type Entry = { upload: PendingUpload; state: RecoveryState };

/**
 * Uploads that were interrupted by an app restart. Finished and closed records are cleaned up
 * silently; the rest can be resumed from the committed offset or discarded.
 */
export function InterruptedUploadsCard({ uid, onOpenPlan }: { uid: string | null; onOpenPlan?: () => void }) {
  const { t, i18n } = useAppTranslation('media');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const upload = useChunkedUpload(uid);

  const load = useCallback(async () => {
    if (!uid) {
      setEntries([]);
      return;
    }
    const pending = await PendingUploadStore.list(uid);
    const classified = await Promise.all(
      pending.map(async (item) => ({
        upload: item,
        state: classifyPendingUpload(item, await UploadSessionRepository.fetch(item.uploadId)),
      })),
    );
    await Promise.all(
      classified
        .filter((entry) => entry.state === 'finished' || entry.state === 'closed')
        .map((entry) => PendingUploadStore.remove(uid, entry.upload.uploadId)),
    );
    setEntries(classified.filter((entry) => entry.state === 'resumable' || entry.state === 'unknown'));
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const resume = async (entry: Entry) => {
    setActiveId(entry.upload.uploadId);
    const result = await upload.start(requestFromPending(entry.upload));
    if (result.status !== 'paused') {
      void load();
    }
  };

  const discard = async (entry: Entry) => {
    if (!uid) return;
    await discardPendingUpload(uid, entry.upload.uploadId).catch(() => undefined);
    void load();
  };

  if (entries.length === 0 && activeId === null) return null;

  return (
    <Card variant="outlined" padding="md" className="gap-3" testID="interrupted-uploads">
      <Text weight="semibold">{t('recovery.title')}</Text>
      <Text variant="caption" color="secondary">
        {t('recovery.body')}
      </Text>
      {entries.map((entry) => {
        const active = activeId === entry.upload.uploadId && upload.state.phase !== 'idle';
        return (
          <View key={entry.upload.uploadId} className="gap-2">
            <Text variant="body-sm" weight="medium">
              {entry.upload.fileName}
            </Text>
            <Text variant="caption" color="secondary">
              {t('recovery.meta', {
                mb: (entry.upload.sizeBytes / (1024 * 1024)).toFixed(0),
                date: new Date(entry.upload.createdAt).toLocaleDateString(i18n.language),
              })}
              {entry.state === 'unknown' ? ` · ${t('recovery.offline')}` : ''}
            </Text>
            {active ? (
              <UploadProgressCard
                state={upload.state}
                onPause={upload.pause}
                onResume={() => void upload.resume()}
                onCancel={upload.cancel}
                onOpenPlan={onOpenPlan}
              />
            ) : (
              <View className="flex-row gap-2">
                <Button size="sm" variant="accent" disabled={activeId !== null && upload.state.phase === 'uploading'} onPress={() => void resume(entry)}>
                  {t('recovery.resume')}
                </Button>
                <Button size="sm" variant="ghost" onPress={() => void discard(entry)}>
                  {t('recovery.discard')}
                </Button>
              </View>
            )}
          </View>
        );
      })}
      {activeId !== null && !entries.some((entry) => entry.upload.uploadId === activeId) ? (
        <UploadProgressCard
          state={upload.state}
          onPause={upload.pause}
          onResume={() => void upload.resume()}
          onCancel={upload.cancel}
          onOpenPlan={onOpenPlan}
        />
      ) : null}
    </Card>
  );
}
