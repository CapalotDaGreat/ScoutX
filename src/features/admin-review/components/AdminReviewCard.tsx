import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import {
  archiveContentReport,
  fetchAdminReviewQueue,
  resolveVerificationRequest,
  type AdminReviewQueue,
} from '@/features/admin-review/services/adminReviewService';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export function AdminReviewCard() {
  const { t } = useAppTranslation(['trust', 'common']);
  const [queue, setQueue] = useState<AdminReviewQueue>({
    verificationRequests: [],
    contentReports: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const next = await fetchAdminReviewQueue();
      setQueue(next);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('trust:admin.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const pendingVerifications = queue.verificationRequests.filter(
    (item) => item.status === 'pending',
  );
  const openReports = queue.contentReports.filter((item) => !item.reviewed);

  return (
    <Card variant="outlined" padding="md" className="gap-3">
      <View>
        <Text variant="overline" color="secondary">
          {t('trust:admin.overline')}
        </Text>
        <Text weight="semibold">{t('trust:admin.title')}</Text>
        <Text variant="caption" color="secondary">
          {t('trust:admin.counts', {
            verifications: pendingVerifications.length,
            reports: openReports.length,
          })}
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

      {!isLoading && pendingVerifications.length === 0 && openReports.length === 0 ? (
        <Text variant="body-sm" color="secondary">
          {t('trust:admin.empty')}
        </Text>
      ) : null}

      {pendingVerifications.slice(0, 3).map((item) => (
        <View key={item.id} className="gap-2 rounded-xl border border-border p-3">
          <Text weight="semibold">{item.requesterName}</Text>
          <Text variant="body-sm" color="secondary">
            {item.evidence}
          </Text>
          <View className="flex-row gap-2">
            <Button
              variant="accent"
              size="sm"
              onPress={() =>
                void resolveVerificationRequest({ requestId: item.id, status: 'approved' }).then(
                  () => reload(),
                )
              }
            >
              {t('trust:admin.approve')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onPress={() =>
                void resolveVerificationRequest({ requestId: item.id, status: 'rejected' }).then(
                  () => reload(),
                )
              }
            >
              {t('trust:admin.reject')}
            </Button>
          </View>
        </View>
      ))}

      {openReports.slice(0, 3).map((item) => (
        <View key={item.id} className="gap-2 rounded-xl border border-border p-3">
          <Text weight="semibold">
            {t('trust:admin.reportLine', { target: item.targetType, reason: item.reason })}
          </Text>
          <Text variant="body-sm" color="secondary">
            {item.details}
          </Text>
          <Button
            variant="secondary"
            size="sm"
            onPress={() =>
              void archiveContentReport({ reportId: item.id, reviewerNote: 'reviewed' }).then(
                () => reload(),
              )
            }
          >
            {t('trust:admin.markReviewed')}
          </Button>
        </View>
      ))}

      <Button variant="ghost" size="sm" onPress={() => void reload()}>
        {t('trust:admin.refresh')}
      </Button>
    </Card>
  );
}
