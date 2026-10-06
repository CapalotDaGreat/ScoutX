import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Badge } from '@/components/primitives/Badge';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { MediaRepository } from '@/features/media-library/repositories/MediaRepository';
import { shareMediaWithScout } from '@/features/media-library/services/shareWithScout';
import { type MediaItem, type MediaVisibility } from '@/features/media-library/types';
import { type HighlightVideo } from '@/features/highlight-videos/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { toUserMessage } from '@/utils/userFacingError';

export function MediaLibrarySection({
  userId,
  legacyVideos,
}: {
  userId: string | null;
  legacyVideos: HighlightVideo[];
}) {
  const { t } = useAppTranslation('media');
  const [items, setItems] = useState<MediaItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [granteeId, setGranteeId] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!userId) {
      setItems([]);
      return;
    }
    const repo = MediaRepository.getInstance();
    await repo.ensureMigrated(userId, legacyVideos);
    setItems(await repo.listMedia(userId));
  }, [legacyVideos, userId]);

  useEffect(() => {
    void reload().catch((err: unknown) => setError(toUserMessage(err, t('library.loadFailed'))));
  }, [reload, t]);

  const setVisibility = async (item: MediaItem, visibility: MediaVisibility) => {
    if (!userId) {
      return;
    }
    setBusyId(item.id);
    try {
      await MediaRepository.getInstance().upsertMedia(userId, {
        ...item,
        visibility,
        updatedAt: new Date().toISOString(),
      });
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  const share = async (item: MediaItem) => {
    if (!userId) {
      return;
    }
    setBusyId(item.id);
    try {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await shareMediaWithScout({ ownerId: userId, granteeId, mediaId: item.id, expiresAt });
      await setVisibility(item, 'grant');
    } catch (err) {
      setError(toUserMessage(err, t('share.failed')));
    } finally {
      setBusyId(null);
    }
  };

  if (!userId) {
    return null;
  }

  return (
    <View className="gap-3">
      <Heading level={3}>{t('library.title')}</Heading>
      {error ? <Text variant="body-sm" color="error">{error}</Text> : null}
      {items.length === 0 ? (
        <Text variant="body-sm" color="secondary">{t('library.empty')}</Text>
      ) : (
        items.map((item) => (
          <Card key={item.id} padding="md" className="gap-2">
            <Text weight="semibold">{item.title}</Text>
            <Badge label={item.visibility} />
            <Text variant="caption" color="secondary">
              {item.type} · {Math.round(item.durationSec)}s · {item.uploadState}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              <Button size="sm" variant="secondary" loading={busyId === item.id} onPress={() => void setVisibility(item, 'passport')}>
                {t('library.addToPassport')}
              </Button>
              <Button size="sm" variant="ghost" onPress={() => void setVisibility(item, 'private')}>
                {t('library.makePrivate')}
              </Button>
            </View>
            <Input
              label={t('share.scoutId')}
              value={granteeId}
              onChangeText={setGranteeId}
              placeholder={t('share.placeholder')}
            />
            <Button size="sm" variant="secondary" loading={busyId === item.id} onPress={() => void share(item)}>
              {t('share.action')}
            </Button>
          </Card>
        ))
      )}
    </View>
  );
}
