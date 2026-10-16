import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import type { GpsSession } from '@/features/gps/types';
import {
  videoSecondForGps,
  type QualityReport,
  type StructuredCoaching,
  type VideoSync,
} from '@/features/match-analysis/services/analysisIntelligence';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export function formatClock(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function QualityReportCard({ quality }: { quality: QualityReport }) {
  const { t } = useAppTranslation('matchAnalysis');
  return (
    <Card padding="lg" className="gap-3" testID="analysis-quality">
      <Heading level={3}>{t('quality.title')}</Heading>
      <Text variant="body-sm" color="secondary">
        {t('quality.overall', { band: t(`band.${quality.overall}`) })}
      </Text>
      <View className="gap-1">
        {quality.dimensions.map((item) => (
          <View key={item.key} className="flex-row items-center justify-between gap-2">
            <Text variant="body-sm">{t(`quality.dimension.${item.key}`)}</Text>
            <Text variant="body-sm" weight="semibold">
              {item.band ? t(`band.${item.band}`) : t('quality.notMeasured')}
            </Text>
          </View>
        ))}
      </View>
      <Text variant="caption" color="secondary">
        {t('quality.coverage', quality.coverage)}
      </Text>
      <View className="gap-1">
        <Text weight="semibold">{t('quality.canTellTitle')}</Text>
        {quality.canTell.length === 0 ? (
          <Text variant="body-sm" color="secondary">
            {t('quality.canTellEmpty')}
          </Text>
        ) : (
          quality.canTell.map((item) => (
            <Text key={item.code} variant="body-sm">
              {'✓ '}
              {t(`quality.canTell.${item.code}`, {
                count: 'count' in item ? item.count : 0,
                pct: 'pct' in item ? item.pct : 0,
              })}
            </Text>
          ))
        )}
      </View>
      <View className="gap-1">
        <Text weight="semibold">{t('quality.uncertainTitle')}</Text>
        {quality.uncertain.map((item, index) => (
          <Text key={`${item.code}-${index}`} variant="body-sm" color="secondary">
            {'? '}
            {t(`quality.uncertain.${item.code}`, {
              count: 'count' in item ? item.count : 0,
              pct: 'pct' in item ? item.pct : 0,
              dimension: 'dimension' in item ? t(`quality.dimension.${item.dimension}`) : '',
            })}
          </Text>
        ))}
      </View>
    </Card>
  );
}

export function StructuredCoachingCard({
  items,
  onSeek,
  onCreateGoal,
  canSeekVideo = true,
}: {
  items: readonly StructuredCoaching[];
  onSeek: (timestampSec: number) => void;
  onCreateGoal?: (item: StructuredCoaching) => Promise<void>;
  /** False when the original video was deleted under the retention policy. */
  canSeekVideo?: boolean;
}) {
  const { t } = useAppTranslation('matchAnalysis');
  const [created, setCreated] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <Card padding="lg" className="gap-2">
        <Heading level={3}>{t('coaching.title')}</Heading>
        <Text variant="body-sm" color="secondary">
          {t('ask.insufficient')}
        </Text>
      </Card>
    );
  }

  const row = (label: string, value: string | null) => (
    <View className="gap-0.5">
      <Text variant="caption" color="secondary">
        {label}
      </Text>
      <Text variant="body-sm" color={value ? 'primary' : 'tertiary'}>
        {value ?? t('coaching.notProvided')}
      </Text>
    </View>
  );

  return (
    <View className="gap-3">
      {items.map((item) => (
        <Card key={item.id} padding="lg" className="gap-2" testID="structured-coaching">
          <Text variant="caption" color="secondary">
            {t(`band.${item.confidence}`)} · {t(`coaching.kind.${item.evidence.kind}`)}
          </Text>
          {row(t('coaching.whatHappened'), item.whatHappened || null)}
          {row(
            t('coaching.whyItMatters'),
            item.whyItMatters ? t('coaching.linkedGoal', { title: item.whyItMatters.goalTitle }) : null,
          )}
          {row(t('coaching.whatToImprove'), item.whatToImprove)}
          {row(t('coaching.howToTrain'), item.howToTrain)}
          {row(t('coaching.howToMeasure'), item.howToMeasure)}
          <View className="flex-row flex-wrap gap-2 pt-1">
            {item.evidence.timestampSec !== null && canSeekVideo ? (
              <Button size="sm" variant="secondary" onPress={() => onSeek(item.evidence.timestampSec ?? 0)}>
                {t('coaching.watch', { time: formatClock(item.evidence.timestampSec) })}
              </Button>
            ) : item.evidence.timestampSec !== null ? (
              <Text variant="caption" color="secondary">
                {t('report.timestampOnly', { time: formatClock(item.evidence.timestampSec) })}
              </Text>
            ) : null}
            {onCreateGoal && !item.whyItMatters ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={created.includes(item.id)}
                loading={busy === item.id}
                onPress={() => {
                  setBusy(item.id);
                  void onCreateGoal(item)
                    .then(() => setCreated((current) => [...current, item.id]))
                    .finally(() => setBusy(null));
                }}
              >
                {created.includes(item.id) ? t('coaching.goalCreated') : t('coaching.createGoal')}
              </Button>
            ) : null}
          </View>
        </Card>
      ))}
    </View>
  );
}

/**
 * Lets the player align footage with a GPS session by marking, once, the video moment at
 * which GPS tracking started. Sprint timestamps then map to "watch this moment".
 */
export function GpsVideoSyncCard({
  sessions,
  sync,
  videoDurationSec,
  getCurrentTime,
  onSaveSync,
  onSeek,
}: {
  sessions: readonly GpsSession[];
  sync: VideoSync | null;
  videoDurationSec: number;
  getCurrentTime: () => number;
  onSaveSync: (sync: VideoSync) => Promise<void>;
  onSeek: (timestampSec: number) => void;
}) {
  const { t, i18n } = useAppTranslation('matchAnalysis');
  const [selectedId, setSelectedId] = useState<string | null>(sync?.gpsSessionId ?? null);
  const [saving, setSaving] = useState(false);
  const session = sessions.find((item) => item.id === (sync?.gpsSessionId ?? selectedId)) ?? null;
  const sprints = session?.intelligence?.sprints ?? [];
  const sessionStartMs = session ? Date.parse(session.startedAt) : Number.NaN;

  const formatStart = (iso: string) =>
    Number.isNaN(Date.parse(iso))
      ? iso
      : new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
          new Date(iso),
        );

  return (
    <Card padding="lg" className="gap-3" testID="gps-video-sync">
      <Heading level={3}>{t('sync.title')}</Heading>
      {sessions.length === 0 ? (
        <Text variant="body-sm" color="secondary">
          {t('sync.noSessions')}
        </Text>
      ) : !sync ? (
        <>
          <Text variant="body-sm" color="secondary">
            {t('sync.instructions')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {sessions.slice(0, 6).map((item) => (
              <Button
                key={item.id}
                size="sm"
                variant={selectedId === item.id ? 'accent' : 'secondary'}
                accessibilityState={{ selected: selectedId === item.id }}
                onPress={() => setSelectedId(item.id)}
              >
                {`${item.matchLabel} · ${formatStart(item.startedAt)}`}
              </Button>
            ))}
          </View>
          <Button
            variant="accent"
            disabled={!session}
            loading={saving}
            onPress={() => {
              if (!session) return;
              setSaving(true);
              void onSaveSync({
                gpsSessionId: session.id,
                gpsAnchorMs: Date.parse(session.startedAt),
                videoAnchorSec: Math.max(0, Math.round(getCurrentTime())),
                setAt: new Date().toISOString(),
              }).finally(() => setSaving(false));
            }}
          >
            {t('sync.markNow')}
          </Button>
        </>
      ) : (
        <>
          <Text variant="body-sm" color="secondary">
            {t('sync.synced', { time: formatClock(sync.videoAnchorSec), label: session?.matchLabel ?? '—' })}
          </Text>
          {!session?.intelligence ? (
            <Text variant="body-sm" color="warning">
              {t('sync.pointsUnavailable')}
            </Text>
          ) : sprints.length === 0 ? (
            <Text variant="body-sm" color="secondary">
              {t('sync.noSprints')}
            </Text>
          ) : (
            sprints.slice(0, 12).map((sprint) => {
              const second = videoSecondForGps(sessionStartMs + sprint.startSec * 1000, sync, videoDurationSec);
              return (
                <View key={sprint.startSec} className="flex-row items-center justify-between gap-2">
                  <Text variant="body-sm">{t('sync.sprint', { kmh: sprint.peakKmh })}</Text>
                  {second === null ? (
                    <Text variant="caption" color="secondary">
                      {t('sync.outsideVideo')}
                    </Text>
                  ) : (
                    <Button size="sm" variant="secondary" onPress={() => onSeek(second)}>
                      {t('coaching.watch', { time: formatClock(second) })}
                    </Button>
                  )}
                </View>
              );
            })
          )}
        </>
      )}
    </Card>
  );
}
