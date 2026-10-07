import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { BottomSheet } from '@/components/feedback/BottomSheet';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { useGpsSessions } from '@/features/gps/hooks/useGpsSessions';
import { MediaRepository } from '@/features/media-library/repositories/MediaRepository';
import { type MediaItem } from '@/features/media-library/types';
import { listRecentMatchAnalysisJobs } from '@/features/match-analysis/repositories/MatchAnalysisRepository';
import { type MatchAnalysisJob } from '@/features/match-analysis/types';
import { usePlayerWorkspace } from '@/features/player-profile/context/PlayerWorkspaceProvider';
import { attachmentKindsFor } from '@/features/request-center/services/requestCenterService';
import type {
  EvidenceAttachment,
  EvidenceAttachmentKind,
  PlayerRequest,
} from '@/features/request-center/types';
import type { EvidenceRequestKind } from '@/features/scout-intelligence/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';
import { toUserMessage } from '@/utils/userFacingError';

type Candidate = { kind: EvidenceAttachmentKind; id: string; label: string; detail: string };

export type FulfillRequestSheetProps = {
  request: PlayerRequest | null;
  onClose: () => void;
  onSubmit: (requestId: string, attachments: EvidenceAttachment[], note: string) => Promise<void>;
};

const MAX_ATTACHMENTS = 10;

export function FulfillRequestSheet({ request, onClose, onSubmit }: FulfillRequestSheetProps) {
  const { t } = useAppTranslation(['common', 'scout']);
  const { colors } = useTheme();
  const { user } = useAuth();
  const { profile } = usePlayerWorkspace();
  const playerId = user?.id ?? null;
  const { sessions } = useGpsSessions({ playerId });
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [analyses, setAnalyses] = useState<MatchAnalysisJob[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!request || !playerId) return;
    setSelected([]);
    setNote('');
    setError(null);
    void MediaRepository.getInstance().listMedia(playerId).then(setMedia).catch(() => setMedia([]));
    void listRecentMatchAnalysisJobs(playerId, 20)
      .then((jobs) => setAnalyses(jobs.filter((job) => job.status === 'complete')))
      .catch(() => setAnalyses([]));
  }, [playerId, request]);

  const allowed = useMemo(() => attachmentKindsFor(request?.requested ?? []), [request]);

  const candidates = useMemo<Candidate[]>(() => {
    const list: Candidate[] = [];
    if (allowed.includes('media')) {
      for (const item of media) {
        if (item.uploadState === 'failed') continue;
        list.push({ kind: 'media', id: item.id, label: item.title || t('common:requestCenter.untitledClip'), detail: item.type });
      }
    }
    if (allowed.includes('analysis')) {
      for (const job of analyses) {
        list.push({
          kind: 'analysis',
          id: job.id,
          label: t('common:requestCenter.analysisLabel'),
          detail: new Date(job.createdAt).toLocaleDateString(),
        });
      }
    }
    if (allowed.includes('match')) {
      for (const match of profile?.statisticsMatches ?? []) {
        list.push({ kind: 'match', id: match.id, label: match.opponent || match.competition, detail: match.date });
      }
    }
    if (allowed.includes('gps')) {
      for (const session of sessions) {
        list.push({
          kind: 'gps',
          id: session.id,
          label: t('common:requestCenter.gpsLabel'),
          detail: new Date(session.startedAt).toLocaleDateString(),
        });
      }
    }
    return list;
  }, [allowed, analyses, media, profile?.statisticsMatches, sessions, t]);

  const keyOf = (item: Candidate) => `${item.kind}:${item.id}`;

  const toggle = (item: Candidate) => {
    const key = keyOf(item);
    setSelected((current) =>
      current.includes(key)
        ? current.filter((value) => value !== key)
        : current.length >= MAX_ATTACHMENTS
          ? current
          : [...current, key],
    );
  };

  const submit = async () => {
    if (!request) return;
    const attachments = candidates
      .filter((item) => selected.includes(keyOf(item)))
      .map((item) => ({ kind: item.kind, id: item.id }));
    setBusy(true);
    setError(null);
    try {
      await onSubmit(request.entityId, attachments, note.trim());
      onClose();
    } catch (err) {
      setError(toUserMessage(err, t('common:requestCenter.fulfillFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={request !== null} onClose={onClose} title={t('common:requestCenter.fulfillTitle')}>
      <View className="gap-3">
        {request && request.requested.length > 0 ? (
          <Text variant="body-sm" color="secondary">
            {t('common:requestCenter.asked', {
              kinds: request.requested.map((kind) => t(`scout:intelligence.kinds.${kind as EvidenceRequestKind}`)).join(', '),
            })}
          </Text>
        ) : null}
        {candidates.length === 0 ? (
          <Text variant="body-sm" color="secondary">
            {t('common:requestCenter.noCandidates')}
          </Text>
        ) : (
          <View className="gap-2">
            {candidates.slice(0, 30).map((item) => {
              const isSelected = selected.includes(keyOf(item));
              return (
                <Pressable
                  key={keyOf(item)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={`${item.label}, ${t(`common:requestCenter.kinds.${item.kind}`)}`}
                  onPress={() => toggle(item)}
                  className="min-h-[48px] flex-row items-center gap-3 rounded-xl border border-divider px-3 py-2"
                >
                  <View
                    className="h-6 w-6 items-center justify-center rounded-md border border-divider"
                    style={isSelected ? { backgroundColor: colors.accent, borderColor: colors.accent } : undefined}
                  >
                    {isSelected ? <Check size={16} color={colors.background} strokeWidth={2.5} /> : null}
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text weight="semibold" numberOfLines={1}>{item.label}</Text>
                    <Text variant="caption" color="secondary">
                      {t(`common:requestCenter.kinds.${item.kind}`)} · {item.detail}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
        <Input
          value={note}
          onChangeText={setNote}
          placeholder={t('common:requestCenter.notePlaceholder')}
          multiline
          maxLength={500}
        />
        {error ? (
          <Text variant="caption" color="error">
            {error}
          </Text>
        ) : null}
        <Button onPress={() => void submit()} disabled={selected.length === 0 || busy} loading={busy}>
          {t('common:requestCenter.send', { count: selected.length })}
        </Button>
      </View>
    </BottomSheet>
  );
}
