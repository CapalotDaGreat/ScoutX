import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Badge } from '@/components/primitives/Badge';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { type ModerationNotice } from '@/features/trust-safety/moderationNotice';
import { ModerationNoticeRepository } from '@/features/trust-safety/repositories/ModerationNoticeRepository';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { toUserMessage } from '@/utils/userFacingError';

const MIN_APPEAL_LENGTH = 10;

/** Decisions about the user's content, with an appeal for removals and account restrictions. */
export function ModerationNoticesSection() {
  const { t, i18n } = useAppTranslation(['trust', 'common']);
  const { status, user, isGuest } = useAuth();
  const uid = status === 'authenticated' && !isGuest ? (user?.uid ?? null) : null;
  const [notices, setNotices] = useState<ModerationNotice[]>([]);
  const [appealing, setAppealing] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return undefined;
    return ModerationNoticeRepository.subscribe(uid, setNotices, () => setNotices([]));
  }, [uid]);

  if (!uid) return null;

  const submit = async (caseId: string) => {
    setBusy(true);
    setError(null);
    try {
      await ModerationNoticeRepository.appeal(caseId, text.trim());
      setAppealing(null);
      setText('');
    } catch (err) {
      setError(toUserMessage(err, t('trust:notices.appealFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-2" testID="privacy-center-notices">
      <Text weight="semibold">{t('trust:notices.title')}</Text>
      {notices.length === 0 ? (
        <Text variant="body-sm" color="secondary">
          {t('trust:notices.empty')}
        </Text>
      ) : (
        notices.map((notice) => (
          <Card key={notice.caseId} variant="outlined" padding="md" className="gap-2">
            <View className="flex-row flex-wrap items-center gap-2">
              <Badge label={t(`trust:notices.actions.${notice.action}`)} variant={notice.action === 'restored' || notice.action === 'appeal_overturned' ? 'success' : 'warning'} />
              {notice.appealStatus ? <Badge label={t(`trust:notices.appeal.${notice.appealStatus}`)} variant="info" /> : null}
            </View>
            <Text variant="body-sm">
              {t('trust:notices.reason', { reason: t(`trust:report.reasons.${notice.reasonCode}`, { defaultValue: notice.reasonCode }) })}
            </Text>
            <Text variant="caption" color="secondary">
              {new Date(notice.at).toLocaleDateString(i18n.language)}
            </Text>
            {notice.appealable && !notice.appealStatus ? (
              appealing === notice.caseId ? (
                <View className="gap-2">
                  <Input
                    label={t('trust:notices.appealLabel')}
                    value={text}
                    onChangeText={setText}
                    multiline
                    numberOfLines={3}
                  />
                  {error ? (
                    <Text variant="body-sm" color="error">
                      {error}
                    </Text>
                  ) : null}
                  <Button
                    size="sm"
                    variant="accent"
                    disabled={text.trim().length < MIN_APPEAL_LENGTH}
                    loading={busy}
                    onPress={() => void submit(notice.caseId)}
                  >
                    {t('trust:notices.appealSubmit')}
                  </Button>
                  <Button size="sm" variant="ghost" onPress={() => setAppealing(null)}>
                    {t('common:cancel')}
                  </Button>
                </View>
              ) : (
                <Button size="sm" variant="secondary" onPress={() => setAppealing(notice.caseId)}>
                  {t('trust:notices.appeal.start')}
                </Button>
              )
            ) : null}
          </Card>
        ))
      )}
    </View>
  );
}
