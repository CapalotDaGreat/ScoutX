import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { ReelEditorModal } from '@/features/reel-studio/components/ReelEditorModal';
import { ReelRepository } from '@/features/reel-studio/repositories/ReelRepository';
import { MediaRepository } from '@/features/media-library/repositories/MediaRepository';
import { buildTemplateReel, type ReelTemplateId, type TemplateBuild } from '@/features/reel-studio/services/reelTemplates';
import { type ReelManifest } from '@/features/reel-studio/types';
import type { PositionGroup } from '@/features/scout-intelligence/types';

const TEMPLATE_IDS: readonly ReelTemplateId[] = ['scout', 'social', 'position'];
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { toUserMessage } from '@/utils/userFacingError';

export function ReelListSection({
  userId,
  focusReelId,
  positionGroup,
  onViewEvidence,
}: {
  userId: string | null;
  positionGroup: PositionGroup | null;
  onViewEvidence?: (jobId: string) => void;
  /** Reel opened from a deep link; missing or foreign reels show a not-found notice. */
  focusReelId?: string;
}) {
  const { t } = useAppTranslation(['media', 'common']);
  const [reels, setReels] = useState<ReelManifest[]>([]);
  const [editing, setEditing] = useState<ReelManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusMissing, setFocusMissing] = useState(false);
  const handledFocusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setReels([]);
      return;
    }
    void ReelRepository.getInstance()
      .listReels(userId)
      .then((loaded) => {
        setReels(loaded);
        if (focusReelId && handledFocusRef.current !== focusReelId) {
          handledFocusRef.current = focusReelId;
          const target = loaded.find((reel) => reel.id === focusReelId);
          if (target) {
            setEditing(target);
          } else {
            setFocusMissing(true);
          }
        }
      })
      .catch((err: unknown) => setError(toUserMessage(err, t('reel.loadFailed'))));
  }, [focusReelId, t, userId]);

  const [templateNotice, setTemplateNotice] = useState<string | null>(null);

  const createDraft = async (templateId?: ReelTemplateId) => {
    if (!userId) {
      return;
    }
    setTemplateNotice(null);
    let fromTemplate: Extract<TemplateBuild, { ok: true }> | null = null;
    if (templateId) {
      const items = await MediaRepository.getInstance().listMedia(userId).catch(() => []);
      const built = buildTemplateReel(templateId, items, positionGroup);
      if (!built.ok) {
        setTemplateNotice(t(`reel.template.${built.reason}`, { count: built.untagged }));
        return;
      }
      fromTemplate = built;
      if (built.untagged > 0) setTemplateNotice(t('reel.template.untagged', { count: built.untagged }));
    }
    const now = new Date().toISOString();
    const draft: ReelManifest = {
      id: `reel_${Date.now()}`,
      ownerId: userId,
      preset: templateId ?? 'custom',
      mode: fromTemplate?.template.mode ?? 'scout',
      segments: fromTemplate?.segments ?? [],
      title: templateId ? t(`reel.template.name.${templateId}`) : '',
      coverMediaId: fromTemplate?.coverMediaId ?? null,
      aspectRatio: fromTemplate?.template.aspectRatio ?? '9:16',
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
      {focusMissing ? (
        <Card variant="outlined" padding="md" className="gap-1">
          <Text weight="semibold">{t('common:deepLink.not_found.title')}</Text>
          <Text variant="body-sm" color="secondary">{t('common:deepLink.not_found.body')}</Text>
        </Card>
      ) : null}
      <Button variant="prestige" onPress={() => void createDraft()}>{t('reel.new')}</Button>
      <Text variant="caption" color="secondary">{t('reel.template.hint')}</Text>
      <View className="flex-row flex-wrap gap-2">
        {TEMPLATE_IDS.map((id) => (
          <Button key={id} size="sm" variant="secondary" onPress={() => void createDraft(id)}>
            {t(`reel.template.name.${id}`)}
          </Button>
        ))}
      </View>
      {templateNotice ? <Text variant="body-sm" color="secondary">{templateNotice}</Text> : null}
      {reels.length === 0 ? (
        <Text variant="body-sm" color="secondary">{t('reel.empty')}</Text>
      ) : (
        reels.map((reel) => (
          <Card key={reel.id} padding="md" className="gap-2">
            <Text weight="semibold">{reel.title || t('reel.untitled')}</Text>
            <Text variant="caption" color="secondary">
              {t(`reel.statusLabel.${reel.status}`)} · {t('reel.clipCount', { count: reel.segments.length })}
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
        onViewEvidence={onViewEvidence}
        onSaved={(saved) => {
          setReels((current) => current.map((item) => (item.id === saved.id ? saved : item)));
          setEditing(saved);
        }}
      />
    </View>
  );
}
