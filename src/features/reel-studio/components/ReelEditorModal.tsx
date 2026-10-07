import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { MediaRepository } from '@/features/media-library/repositories/MediaRepository';
import { shareMediaWithScout } from '@/features/media-library/services/shareWithScout';
import type { MediaItem } from '@/features/media-library/types';
import { getMatchAnalysisJob } from '@/features/match-analysis/repositories/MatchAnalysisRepository';
import type { MatchAnalysisJob } from '@/features/match-analysis/types';
import { ReelExportPanel } from '@/features/reel-studio/components/ReelExportPanel';
import { ReelRepository } from '@/features/reel-studio/repositories/ReelRepository';
import { buildClipProof, type ClipProof } from '@/features/reel-studio/services/clipProof';
import { buildReelQualityNotes, canApproveReel } from '@/features/reel-studio/services/reelQuality';
import { moveSegment, sequenceReelSegments, trimSegment } from '@/features/reel-studio/services/reelSequencing';
import { type ReelManifest, type SuggestionDecision } from '@/features/reel-studio/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { toUserMessage } from '@/utils/userFacingError';

const DEFAULT_CLIP_SEC = 15;

function formatSec(value: number): string {
  return `${Math.round(value * 10) / 10}s`;
}

export function ReelEditorModal({
  visible,
  reel,
  onClose,
  onSaved,
  onViewEvidence,
}: {
  visible: boolean;
  reel: ReelManifest | null;
  onClose: () => void;
  onSaved: (reel: ReelManifest) => void;
  onViewEvidence?: (jobId: string) => void;
}) {
  const { t } = useAppTranslation(['media', 'common', 'matchAnalysis']);
  const [draft, setDraft] = useState<ReelManifest | null>(reel);
  const [granteeId, setGranteeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [jobs, setJobs] = useState<Record<string, MatchAnalysisJob | null>>({});
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    setDraft(reel);
  }, [reel]);

  const ownerId = reel?.ownerId ?? null;
  useEffect(() => {
    if (!ownerId || !visible) return undefined;
    let cancelled = false;
    void MediaRepository.getInstance()
      .listMedia(ownerId)
      .then((items) => {
        if (!cancelled) setMedia(items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ownerId, visible]);

  const mediaById = useMemo(() => new Map(media.map((item) => [item.id, item])), [media]);

  const segments = draft?.segments;
  useEffect(() => {
    const jobIds = [
      ...new Set(
        (segments ?? [])
          .map((segment) => mediaById.get(segment.mediaId)?.sourceJobId)
          .filter((id): id is string => Boolean(id)),
      ),
    ].filter((id) => !(id in jobs));
    if (jobIds.length === 0) return;
    void Promise.all(jobIds.map((id) => getMatchAnalysisJob(id).catch(() => null))).then((loaded) =>
      setJobs((current) => ({ ...current, ...Object.fromEntries(jobIds.map((id, index) => [id, loaded[index]])) })),
    );
  }, [jobs, mediaById, segments]);

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

  const dirty = reel !== null && JSON.stringify(reel) !== JSON.stringify(draft);
  const notes = buildReelQualityNotes(draft);

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

  const addClip = (item: MediaItem) => {
    setDraft({
      ...draft,
      segments: [...draft.segments, { mediaId: item.id, inSec: 0, outSec: Math.min(item.durationSec, DEFAULT_CLIP_SEC) }],
      coverMediaId: draft.coverMediaId ?? item.id,
    });
    setPicking(false);
  };

  const proofLine = (proof: ClipProof): string => {
    const window = `${formatSec(proof.inSec)}–${formatSec(proof.outSec)}`;
    const match = proof.matchLabel ? t('reel.proof.match', { label: proof.matchLabel }) : '';
    const state = t(`reel.proof.state.${proof.state}`, {
      type: proof.eventType ? t(`matchAnalysis:eventType.${proof.eventType}`) : '',
    });
    return [window, match, state].filter(Boolean).join(' · ');
  };

  const pickable = media.filter((item) => item.uploadState === 'ready' && item.durationSec > 0 && item.type !== 'reel');

  return (
    <Modal visible={visible} onClose={onClose} title={t('reel.editorTitle')} size="fullscreen">
      <ScrollView className="flex-1" contentContainerStyle={{ gap: 12, paddingBottom: 32 }}>
        <Input label={t('reel.title')} value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} />
        <Text variant="caption" color="secondary">
          {t('reel.duration', { seconds: Math.round(sequenced.totalDurationSec) })}
          {sequenced.overlapCount > 0 ? ` · ${t('reel.overlaps', { count: sequenced.overlapCount })}` : ''}
        </Text>
        {notes.map((note, index) => (
          <Text key={`${note.code}-${index}`} variant="body-sm" color="secondary">
            {t(`reel.quality.${note.code}`, { clip: (note.segmentIndex ?? 0) + 1 })}
          </Text>
        ))}
        {draft.segments.map((segment, index) => {
          const item = mediaById.get(segment.mediaId);
          const proof = buildClipProof(segment, item, item?.sourceJobId ? jobs[item.sourceJobId] : undefined);
          return (
            <Card key={`${segment.mediaId}-${index}`} padding="md" className="gap-2">
              <Text weight="semibold">
                {t('reel.clip', { index: index + 1 })}
                {item ? ` · ${item.title}` : ''}
              </Text>
              <Text variant="caption" color="secondary">
                {proofLine(proof)}
              </Text>
              {segment.caption ? (
                <Text variant="caption" color="tertiary">
                  {t('reel.captionLabel', { caption: segment.caption })}
                </Text>
              ) : null}
              <View className="flex-row flex-wrap gap-2">
                <Button size="sm" variant="ghost" accessibilityLabel={t('reel.upA11y', { index: index + 1 })} onPress={() => setDraft({ ...draft, segments: moveSegment(draft.segments, index, Math.max(0, index - 1)) })}>
                  {t('reel.up')}
                </Button>
                <Button size="sm" variant="ghost" accessibilityLabel={t('reel.downA11y', { index: index + 1 })} onPress={() => setDraft({ ...draft, segments: moveSegment(draft.segments, index, Math.min(draft.segments.length - 1, index + 1)) })}>
                  {t('reel.down')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() =>
                    setDraft({
                      ...draft,
                      segments: draft.segments.map((current, itemIndex) =>
                        itemIndex === index ? trimSegment(current, current.inSec, Math.max(current.inSec, current.outSec - 1)) : current,
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
                  {draft.coverMediaId === segment.mediaId ? t('reel.isCover') : t('reel.cover')}
                </Button>
                {proof.jobId && onViewEvidence ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => {
                      onClose();
                      onViewEvidence(proof.jobId ?? '');
                    }}
                  >
                    {t('reel.proof.view')}
                  </Button>
                ) : null}
              </View>
            </Card>
          );
        })}
        {picking ? (
          <Card variant="outlined" padding="md" className="gap-2">
            <Text weight="semibold">{t('reel.pickTitle')}</Text>
            {pickable.length === 0 ? (
              <Text variant="body-sm" color="secondary">
                {t('reel.pickEmpty')}
              </Text>
            ) : (
              pickable.map((item) => (
                <Button key={item.id} size="sm" variant="ghost" onPress={() => addClip(item)}>
                  {`${item.title} · ${formatSec(item.durationSec)}`}
                </Button>
              ))
            )}
            <Button size="sm" variant="ghost" onPress={() => setPicking(false)}>
              {t('common:cancel')}
            </Button>
          </Card>
        ) : (
          <Button variant="secondary" onPress={() => setPicking(true)}>
            {t('reel.addClip')}
          </Button>
        )}
        {draft.aiSuggestions.map((suggestion, index) => (
          <Card key={`sug-${index}`} padding="md" className="gap-2">
            <Text variant="body-sm">{suggestion.reason}</Text>
            <Text variant="caption">{t(`reel.decision.${suggestion.decision}`)}</Text>
            <View className="flex-row gap-2">
              <Button size="sm" variant="accent" onPress={() => setSuggestion(index, 'accepted')}>{t('reel.accept')}</Button>
              <Button size="sm" variant="secondary" onPress={() => setSuggestion(index, 'rejected')}>{t('reel.reject')}</Button>
            </View>
          </Card>
        ))}
        <Button variant="secondary" loading={busy} onPress={() => void save({ ...draft, status: draft.status === 'approved' ? 'approved' : 'draft' })}>
          {t('reel.save')}
        </Button>
        <Button variant="secondary" loading={busy} onPress={() => void save({ ...draft, status: 'review' })}>
          {t('reel.sendReview')}
        </Button>
        <Button
          variant="accent"
          loading={busy}
          disabled={!canApproveReel(notes)}
          onPress={() => void save({ ...draft, status: 'approved' })}
        >
          {t('reel.approve')}
        </Button>
        <ReelExportPanel reel={draft} dirty={dirty} />
        <Input label={t('share.scoutId')} value={granteeId} onChangeText={setGranteeId} />
        <Button
          variant="secondary"
          disabled={!granteeId.trim()}
          onPress={() =>
            void shareMediaWithScout({
              ownerId: draft.ownerId,
              granteeId: granteeId.trim(),
              reelId: draft.id,
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            })
              .then(() => Alert.alert(t('share.sent')))
              .catch((error: unknown) => Alert.alert(t('share.failed'), toUserMessage(error, t('share.failed'))))
          }
        >
          {t('share.action')}
        </Button>
        <Button variant="ghost" onPress={onClose}>{t('common:close')}</Button>
      </ScrollView>
    </Modal>
  );
}
