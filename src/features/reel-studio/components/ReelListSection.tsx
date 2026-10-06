import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { ReelEditorModal } from '@/features/reel-studio/components/ReelEditorModal';
import { ReelRepository } from '@/features/reel-studio/repositories/ReelRepository';
import { type ReelManifest } from '@/features/reel-studio/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { toUserMessage } from '@/utils/userFacingError';

export function ReelListSection({ userId }: { userId: string | null }) {
  const { t } = useAppTranslation('media');
  const [reels, setReels] = useState<ReelManifest[]>([]);
  const [editing, setEditing] = useState<ReelManifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setReels([]);
      return;
    }
    void ReelRepository.getInstance()
      .listReels(userId)
      .then(setReels)
      .catch((err: unknown) => setError(toUserMessage(err, t('reel.loadFailed'))));
  }, [t, userId]);

  const createDraft = async () => {
    if (!userId) {
      return;
    }
    const now = new Date().toISOString();
    const draft: ReelManifest = {
      id: `reel_${Date.now()}`,
      ownerId: userId,
      preset: 'scout',
      mode: 'scout',
      segments: [],
      title: '',
      coverMediaId: null,
      aspectRatio: '9:16',
      privacy: 'private',
      status: 'draft',
      aiSuggestions: [],
      quality: { notes: [] },
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    const saved = await ReelRepository.getInstance().saveReel(draft);
    setReels((current) => [saved, ...current]);
    setEditing(saved);
  };

  return (
    <View className="gap-3">
      <Heading level={3}>{t('reel.listTitle')}</Heading>
      {error ? <Text color="error" variant="body-sm">{error}</Text> : null}
      <Button variant="prestige" onPress={() => void createDraft()}>{t('reel.new')}</Button>
      {reels.length === 0 ? (
        <Text variant="body-sm" color="secondary">{t('reel.empty')}</Text>
      ) : (
        reels.map((reel) => (
          <Card key={reel.id} padding="md" className="gap-2">
            <Text weight="semibold">{reel.title || t('reel.untitled')}</Text>
            <Text variant="caption" color="secondary">
              {reel.status} · {reel.segments.length} {t('reel.clips')}
            </Text>
            <Button size="sm" variant="secondary" onPress={() => setEditing(reel)}>
              {t('reel.edit')}
            </Button>
          </Card>
        ))
      )}
      <ReelEditorModal
        visible={Boolean(editing)}
        reel={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          setReels((current) => current.map((item) => (item.id === saved.id ? saved : item)));
          setEditing(saved);
        }}
      />
    </View>
  );
}
