import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { requestReelExport } from '@/features/media-library/services/mediaAccessCallable';
import { shareMediaWithScout } from '@/features/media-library/services/shareWithScout';
import { ReelRepository } from '@/features/reel-studio/repositories/ReelRepository';
import { canApproveReel } from '@/features/reel-studio/services/reelQuality';
import { moveSegment, sequenceReelSegments, trimSegment } from '@/features/reel-studio/services/reelSequencing';
import { type ReelManifest, type SuggestionDecision } from '@/features/reel-studio/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { toUserMessage } from '@/utils/userFacingError';

export function ReelEditorModal({
  visible,
  reel,
  onClose,
  onSaved,
}: {
  visible: boolean;
  reel: ReelManifest | null;
  onClose: () => void;
  onSaved: (reel: ReelManifest) => void;
}) {
  const { t } = useAppTranslation(['media', 'common']);
  const [draft, setDraft] = useState<ReelManifest | null>(reel);
  const [granteeId, setGranteeId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(reel);
  }, [reel]);

  const sequenced = useMemo(
    () => (draft ? sequenceReelSegments(draft.segments) : { segments: [], totalDurationSec: 0, overlapCount: 0 }),
    [draft],
  );

  if (!draft) {
    return (
      <Modal visible={visible} onClose={onClose} title={t('reel.editorTitle')}>
        <Text variant="body-sm">{t('reel.missing')}</Text>
      </Modal>
    );
  }

  const save = async (next: ReelManifest) => {
    setBusy(true);
    try {
      const saved = await ReelRepository.getInstance().saveReel(next);
      setDraft(saved);
      onSaved(saved);
    } catch (error) {
      Alert.alert(t('reel.saveFailed'), toUserMessage(error, t('reel.saveFailed')));
    } finally {
      setBusy(false);
    }
  };

  const setSuggestion = (index: number, decision: SuggestionDecision) => {
    const aiSuggestions = draft.aiSuggestions.map((item, itemIndex) =>
      itemIndex === index ? { ...item, decision } : item,
    );
    void save({ ...draft, aiSuggestions });
  };

  return (
    <Modal visible={visible} onClose={onClose} title={t('reel.editorTitle')} size="fullscreen">
      <ScrollView className="flex-1" contentContainerStyle={{ gap: 12, paddingBottom: 32 }}>
        <Input label={t('reel.title')} value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} />
        <Text variant="caption" color="secondary">
          {t('reel.duration', { seconds: Math.round(sequenced.totalDurationSec) })}
          {sequenced.overlapCount > 0 ? ` · ${t('reel.overlaps', { count: sequenced.overlapCount })}` : ''}
        </Text>
        {draft.quality.notes.map((note) => (
          <Text key={note.code} variant="body-sm" color="secondary">
            {note.message}
          </Text>
        ))}
        {draft.segments.map((segment, index) => (
          <Card key={`${segment.mediaId}-${index}`} padding="md" className="gap-2">
            <Text weight="semibold">{t('reel.clip', { index: index + 1 })}</Text>
            <Text variant="caption" color="secondary">
              {segment.inSec}s–{segment.outSec}s {segment.caption ?? ''}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              <Button size="sm" variant="ghost" onPress={() => setDraft({ ...draft, segments: moveSegment(draft.segments, index, Math.max(0, index - 1)) })}>
                {t('reel.up')}
              </Button>
              <Button size="sm" variant="ghost" onPress={() => setDraft({ ...draft, segments: moveSegment(draft.segments, index, Math.min(draft.segments.length - 1, index + 1)) })}>
                {t('reel.down')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onPress={() =>
                  setDraft({
                    ...draft,
                    segments: draft.segments.map((item, itemIndex) =>
                      itemIndex === index ? trimSegment(item, item.inSec, Math.max(item.inSec, item.outSec - 1)) : item,
                    ),
                  })
                }
              >
                {t('reel.trim')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onPress={() => setDraft({ ...draft, segments: draft.segments.filter((_, itemIndex) => itemIndex !== index) })}
              >
                {t('reel.remove')}
              </Button>
              <Button size="sm" variant="secondary" onPress={() => setDraft({ ...draft, coverMediaId: segment.mediaId })}>
                {t('reel.cover')}
              </Button>
            </View>
          </Card>
        ))}
        {draft.aiSuggestions.map((suggestion, index) => (
          <Card key={`sug-${index}`} padding="md" className="gap-2">
            <Text variant="body-sm">{suggestion.reason}</Text>
            <Text variant="caption">{suggestion.decision}</Text>
            <View className="flex-row gap-2">
              <Button size="sm" variant="accent" onPress={() => setSuggestion(index, 'accepted')}>{t('reel.accept')}</Button>
              <Button size="sm" variant="secondary" onPress={() => setSuggestion(index, 'rejected')}>{t('reel.reject')}</Button>
            </View>
          </Card>
        ))}
        <Button variant="secondary" loading={busy} onPress={() => void save({ ...draft, status: 'review' })}>
          {t('reel.sendReview')}
        </Button>
        <Button
          variant="accent"
          loading={busy}
          disabled={!canApproveReel(draft.quality.notes)}
          onPress={() => void save({ ...draft, status: 'approved' })}
        >
          {t('reel.approve')}
        </Button>
        <Input label={t('share.scoutId')} value={granteeId} onChangeText={setGranteeId} />
        <Button
          variant="secondary"
          onPress={() =>
            void shareMediaWithScout({
              ownerId: draft.ownerId,
              granteeId,
              reelId: draft.id,
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            }).then(() => Alert.alert(t('share.sent')))
          }
        >
          {t('share.action')}
        </Button>
        <Button
          variant="ghost"
          onPress={() =>
            void requestReelExport(draft.id).then((result) => Alert.alert(t('reel.export'), result.reason))
          }
        >
          {t('reel.export')}
        </Button>
        <Button variant="ghost" onPress={onClose}>{t('common:close')}</Button>
      </ScrollView>
    </Modal>
  );
}
