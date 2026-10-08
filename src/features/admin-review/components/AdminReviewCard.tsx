import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Badge } from '@/components/primitives/Badge';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import {
  applyModerationAction,
  fetchModerationQueue,
  fetchVerificationQueue,
  resolveAppeal,
  resolveVerificationRequest,
  type AdminVerificationRequest,
  type ModerationCase,
  type StaffAction,
} from '@/features/admin-review/services/adminReviewService';
import { type StaffRole } from '@/features/auth/services/roleClaimService';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { toUserMessage } from '@/utils/userFacingError';

const MIN_REASON = 5;
const MODERATOR_ACTIONS: readonly StaffAction[] = ['dismiss', 'restrict', 'hide', 'warn', 'escalate'];
const ADMIN_ACTIONS: readonly StaffAction[] = ['remove', 'suspend', 'disable'];
const ACCOUNT_TARGETS = new Set(['user', 'scout', 'passport']);

function actionsFor(role: StaffRole, targetType: string): StaffAction[] {
  const all = role === 'admin' ? [...MODERATOR_ACTIONS, ...ADMIN_ACTIONS] : [...MODERATOR_ACTIONS];
  return all.filter((action) => (action === 'suspend' || action === 'disable' ? ACCOUNT_TARGETS.has(targetType) : true));
}

export function AdminReviewCard({ staffRole }: { staffRole: StaffRole }) {
  const { t } = useAppTranslation(['trust', 'common']);
  const [verifications, setVerifications] = useState<AdminVerificationRequest[]>([]);
  const [cases, setCases] = useState<ModerationCase[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [nextCases, nextVerifications] = await Promise.all([
        fetchModerationQueue(),
        staffRole === 'admin' ? fetchVerificationQueue() : Promise.resolve([]),
      ]);
      setCases(nextCases);
      setVerifications(nextVerifications.filter((item) => item.status === 'pending'));
    } catch (loadError) {
      setError(toUserMessage(loadError, t('trust:admin.loadFailed')));
    } finally {
      setIsLoading(false);
    }
  }, [staffRole, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await task();
      setReasons((current) => ({ ...current, [key]: '' }));
      await reload();
    } catch (actionError) {
      setError(toUserMessage(actionError, t('trust:admin.actionFailed')));
    } finally {
      setBusy(null);
    }
  };

  const reasonFor = (key: string) => (reasons[key] ?? '').trim();
  const reasonInput = (key: string) => (
    <Input
      label={t('trust:admin.reason')}
      value={reasons[key] ?? ''}
      onChangeText={(value) => setReasons((current) => ({ ...current, [key]: value }))}
    />
  );

  return (
    <Card variant="outlined" padding="md" className="gap-3" testID="admin-review-card">
      <View>
        <Text variant="overline" color="secondary">
          {t('trust:admin.overline')}
        </Text>
        <Text weight="semibold">{t('trust:admin.title')}</Text>
        <Text variant="caption" color="secondary">
          {t('trust:admin.counts', { verifications: verifications.length, reports: cases.length })}
        </Text>
      </View>

      {error ? (
        <Text variant="body-sm" color="error">
          {error}
        </Text>
      ) : null}
      {isLoading ? (
        <Text variant="body-sm" color="secondary">
          {t('trust:admin.loading')}
        </Text>
      ) : null}
      {!isLoading && verifications.length === 0 && cases.length === 0 ? (
        <Text variant="body-sm" color="secondary">
          {t('trust:admin.empty')}
        </Text>
      ) : null}

      {cases.slice(0, 10).map((item) => {
        const ready = reasonFor(item.id).length >= MIN_REASON;
        return (
          <View key={item.id} className="gap-2 rounded-xl border border-border p-3">
            <View className="flex-row flex-wrap items-center gap-2">
              <Badge label={t(`trust:admin.priority.${item.priority}`)} variant={item.priority === 'urgent' ? 'error' : 'warning'} />
              <Badge label={t(`trust:admin.state.${item.state}`, { defaultValue: item.state })} />
            </View>
            <Text weight="semibold">
              {t('trust:admin.reportLine', {
                target: item.targetType,
                reason: item.reasons.map((reason) => t(`trust:report.reasons.${reason}`, { defaultValue: reason })).join(', '),
              })}
            </Text>
            <Text variant="caption" color="secondary">
              {t('trust:admin.reportCount', { count: item.reportIds.length })}
            </Text>
            {item.targetContext ? (
              <Text variant="caption" color="secondary" selectable>
                {t('trust:admin.reportedLink', { provider: item.targetContext.providerId, url: item.targetContext.url })}
              </Text>
            ) : null}
            {reasonInput(item.id)}
            {item.state === 'appealed' ? (
              <View className="flex-row flex-wrap gap-2">
                {(['upheld', 'overturned'] as const).map((outcome) => (
                  <Button
                    key={outcome}
                    size="sm"
                    variant="secondary"
                    disabled={!ready}
                    loading={busy === item.id}
                    onPress={() => void run(item.id, () => resolveAppeal({ caseId: item.id, outcome, reason: reasonFor(item.id) }))}
                  >
                    {t(`trust:admin.appeal.${outcome}`)}
                  </Button>
                ))}
              </View>
            ) : (
              <View className="flex-row flex-wrap gap-2">
                {actionsFor(staffRole, item.targetType).map((action) => (
                  <Button
                    key={action}
                    size="sm"
                    variant={ADMIN_ACTIONS.includes(action) ? 'destructive' : 'secondary'}
                    disabled={!ready}
                    loading={busy === item.id}
                    onPress={() =>
                      void run(item.id, () => applyModerationAction({ caseId: item.id, action, reason: reasonFor(item.id) }))
                    }
                  >
                    {t(`trust:notices.actions.${action}`)}
                  </Button>
                ))}
              </View>
            )}
          </View>
        );
      })}

      {verifications.slice(0, 5).map((item) => {
        const ready = reasonFor(item.id).length >= MIN_REASON;
        return (
          <View key={item.id} className="gap-2 rounded-xl border border-border p-3">
            <Text weight="semibold">{item.requesterName}</Text>
            <Text variant="body-sm" color="secondary">
              {item.evidence}
            </Text>
            {reasonInput(item.id)}
            <View className="flex-row gap-2">
              {(['approved', 'rejected'] as const).map((status) => (
                <Button
                  key={status}
                  variant={status === 'approved' ? 'accent' : 'secondary'}
                  size="sm"
                  disabled={!ready}
                  loading={busy === item.id}
                  onPress={() =>
                    void run(item.id, () =>
                      resolveVerificationRequest({ requestId: item.id, status, reviewerNote: reasonFor(item.id) }),
                    )
                  }
                >
                  {status === 'approved' ? t('trust:admin.approve') : t('trust:admin.reject')}
                </Button>
              ))}
            </View>
          </View>
        );
      })}

      <Button variant="ghost" size="sm" onPress={() => void reload()}>
        {t('trust:admin.refresh')}
      </Button>
    </Card>
  );
}
