import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Badge } from '@/components/primitives/Badge';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { ChoiceChip as Chip } from '@/components/primitives/ChoiceChip';
import { Heading } from '@/components/primitives/Heading';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { MediaRepository } from '@/features/media-library/repositories/MediaRepository';
import {
  EMPTY_MEDIA_FILTER,
  filterMedia,
  mediaFacets,
  type MediaFilter,
} from '@/features/media-library/services/mediaFilters';
import { enrichFromHighlights } from '@/features/media-library/services/mediaMigration';
import { shareMediaWithScout } from '@/features/media-library/services/shareWithScout';
import {
  PublishMediaConfirmModal,
  type PublishTarget,
} from '@/features/media-library/components/PublishMediaConfirmModal';
import { type MediaItem, type MediaVisibility } from '@/features/media-library/types';
import { type HighlightVideo } from '@/features/highlight-videos/types';
import { RequestCenterRepository } from '@/features/request-center/repositories/RequestCenterRepository';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { toUserMessage } from '@/utils/userFacingError';

function mediaAttachmentIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
    return row?.kind === 'media' && typeof row.id === 'string' ? [row.id] : [];
  });
}

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
  const [isLoading, setIsLoading] = useState(true);
  const [granteeId, setGranteeId] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<MediaFilter>(EMPTY_MEDIA_FILTER);
  const [evidenceIds, setEvidenceIds] = useState<ReadonlySet<string>>(new Set());
  const [publishing, setPublishing] = useState<MediaItem | null>(null);
  const [publishTarget, setPublishTarget] = useState<PublishTarget>('passport');
  const openPublish = (item: MediaItem, target: PublishTarget) => {
    setPublishTarget(target);
    setPublishing(item);
  };

  const reload = useCallback(async () => {
    if (!userId) {
      setItems([]);
      return;
    }
    const repo = MediaRepository.getInstance();
    await repo.ensureMigrated(userId, legacyVideos);
    setItems(enrichFromHighlights(await repo.listMedia(userId), legacyVideos));
  }, [legacyVideos, userId]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    void reload()
      .catch((err: unknown) => { if (active) setError(toUserMessage(err, t('library.loadFailed'))); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [reload, t]);

  useEffect(() => {
    if (!userId) return undefined;
    return RequestCenterRepository.getInstance().subscribeToEvidenceRequests(
      userId,
      (requests) =>
        setEvidenceIds(
          new Set(
            requests.flatMap((request) =>
              request.status === 'fulfilled'
                ? mediaAttachmentIds(request.response?.attachments)
                : [],
            ),
          ),
        ),
      () => setEvidenceIds(new Set()),
    );
  }, [userId]);

  const facets = useMemo(() => mediaFacets(items), [items]);
  const visible = useMemo(() => filterMedia(items, filter, evidenceIds), [evidenceIds, filter, items]);
  const filtered = JSON.stringify(filter) !== JSON.stringify(EMPTY_MEDIA_FILTER);

  const setVisibility = async (item: MediaItem, visibility: MediaVisibility, confirmRights = false) => {
    if (!userId) {
      return;
    }
    setBusyId(item.id);
    try {
      await MediaRepository.getInstance().upsertMedia(userId, {
        ...item,
        visibility,
        rightsState: confirmRights ? 'user_confirmed' : item.rightsState,
        updatedAt: new Date().toISOString(),
      });
      await reload();
    } catch (err) {
      setError(toUserMessage(err, t('library.visibilityFailed')));
    } finally {
      setBusyId(null);
    }
  };

  const share = async (item: MediaItem) => {
    if (!userId || !granteeId.trim()) {
      return;
    }
    setBusyId(item.id);
    try {
      await setVisibility(item, 'grant', true);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await shareMediaWithScout({ ownerId: userId, granteeId: granteeId.trim(), mediaId: item.id, expiresAt });
    } catch (err) {
      setError(toUserMessage(err, t('share.failed')));
    } finally {
      setBusyId(null);
    }
  };

  const confirmPublish = (item: MediaItem) => {
    const target = publishTarget;
    setPublishing(null);
    void (target === 'passport' ? setVisibility(item, 'passport', true) : share(item));
  };

  if (!userId) {
    return null;
  }

  const toggle = <K extends keyof MediaFilter>(key: K, value: MediaFilter[K]) =>
    setFilter((current) => ({ ...current, [key]: current[key] === value ? EMPTY_MEDIA_FILTER[key] : value }));

  return (
    <View className="gap-3">
      <Heading level={3}>{t('library.title')}</Heading>
      {!isLoading ? <Text variant="caption" color="secondary">
        {t('filter.showing', { shown: visible.length, total: items.length })}
      </Text> : null}
      {error ? <Text variant="body-sm" color="error">{error}</Text> : null}
      {items.length > 0 ? (
        <View className="gap-2" testID="media-filters">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Chip label={t('filter.passport')} selected={filter.passport} onPress={() => toggle('passport', true)} />
            <Chip label={t('filter.goalLinked')} selected={filter.goalLinked} onPress={() => toggle('goalLinked', true)} />
            <Chip label={t('filter.sentAsEvidence')} selected={filter.sentAsEvidence} onPress={() => toggle('sentAsEvidence', true)} />
            {facets.seasons.map((season) => (
              <Chip key={season} label={season} selected={filter.season === season} onPress={() => toggle('season', season)} />
            ))}
          </ScrollView>
          {facets.categories.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {facets.categories.map((category) => (
                <Chip
                  key={category}
                  label={t(`category.${category}`)}
                  selected={filter.category === category}
                  onPress={() => toggle('category', category)}
                />
              ))}
            </ScrollView>
          ) : null}
          {facets.matches.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {facets.matches.map((match) => (
                <Chip key={match.key} label={match.label} selected={filter.match === match.key} onPress={() => toggle('match', match.key)} />
              ))}
            </ScrollView>
          ) : null}
          {filtered ? (
            <View className="flex-row items-center justify-between">
              <Text variant="caption" color="secondary">
                {t('filter.showing', { shown: visible.length, total: items.length })}
              </Text>
              <Button size="sm" variant="ghost" onPress={() => setFilter(EMPTY_MEDIA_FILTER)}>
                {t('filter.clear')}
              </Button>
            </View>
          ) : null}
        </View>
      ) : null}
      {items.length > 0 ? (
        <View className="border-y border-border py-3">
          <Input
            label={t('share.scoutId')}
            value={granteeId}
            onChangeText={setGranteeId}
            placeholder={t('share.placeholder')}
          />
        </View>
      ) : null}
      {isLoading ? (
        <SkeletonLoader variant="card" />
      ) : items.length === 0 ? (
        error ? null : <Text variant="body-sm" color="secondary">{t('library.empty')}</Text>
      ) : visible.length === 0 ? (
        <Text variant="body-sm" color="secondary">{t('filter.noMatches')}</Text>
      ) : (
        visible.map((item) => (
          <Card key={item.id} padding="md" className="gap-2">
            <Text weight="semibold">{item.title}</Text>
            <View className="flex-row flex-wrap gap-2">
              <Badge label={t(`visibility.${item.visibility}`)} />
              {item.moderationState !== 'none' ? (
                <Badge label={t(`moderation.${item.moderationState}`)} variant="error" />
              ) : item.rightsState === 'user_confirmed' ? (
                <Badge label={t('rights.confirmed')} variant="success" />
              ) : null}
              {evidenceIds.has(item.id) ? <Badge label={t('filter.sentAsEvidence')} variant="info" /> : null}
            </View>
            <Text variant="caption" color="secondary">
              {[
                t(`type.${item.type}`),
                `${Math.round(item.durationSec)}s`,
                t(`upload.${item.uploadState}`),
                item.matchLabel ?? '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {item.moderationState !== 'none' ? (
              <Text variant="caption" color="secondary">
                {t('moderation.explainer')}
              </Text>
            ) : (
              <>
                <View className="flex-row flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={item.visibility === 'passport'}
                    loading={busyId === item.id}
                    onPress={() => openPublish(item, 'passport')}
                  >
                    {t('library.addToPassport')}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={item.visibility === 'private'} onPress={() => void setVisibility(item, 'private')}>
                    {t('library.makePrivate')}
                  </Button>
                </View>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!granteeId.trim()}
                  loading={busyId === item.id}
                  onPress={() => openPublish(item, 'grant')}
                >
                  {t('share.action')}
                </Button>
              </>
            )}
          </Card>
        ))
      )}
      <PublishMediaConfirmModal
        item={publishing}
        target={publishTarget}
        busy={publishing !== null && busyId === publishing.id}
        onConfirm={confirmPublish}
        onClose={() => setPublishing(null)}
      />
    </View>
  );
}
