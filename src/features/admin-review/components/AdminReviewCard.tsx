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

export function AdminReviewCard() {
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
      setError(loadError instanceof Error ? loadError.message : 'Failed to load admin queue.');
    } finally {
      setIsLoading(false);
    }
  }, []);

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
          Admin review
        </Text>
        <Text weight="semibold">Moderation queue</Text>
        <Text variant="caption" color="secondary">
          {pendingVerifications.length} verification request
          {pendingVerifications.length === 1 ? '' : 's'} · {openReports.length} content report
          {openReports.length === 1 ? '' : 's'}
        </Text>
      </View>

      {error ? (
        <Text variant="body-sm" color="error">
          {error}
        </Text>
      ) : null}

      {isLoading ? (
        <Text variant="body-sm" color="secondary">
          Loading queue…
        </Text>
      ) : null}

      {!isLoading && pendingVerifications.length === 0 && openReports.length === 0 ? (
        <Text variant="body-sm" color="secondary">
          No pending admin items.
        </Text>
      ) : null}

      {pendingVerifications.slice(0, 3).map((item) => (
        <View key={item.id} className="gap-2 rounded-xl border border-border p-3 dark:border-neutral-800">
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
              Approve
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
              Reject
            </Button>
          </View>
        </View>
      ))}

      {openReports.slice(0, 3).map((item) => (
        <View key={item.id} className="gap-2 rounded-xl border border-border p-3 dark:border-neutral-800">
          <Text weight="semibold">
            Report · {item.targetType} · {item.reason}
          </Text>
          <Text variant="body-sm" color="secondary">
            {item.details}
          </Text>
          <Button
            variant="secondary"
            size="sm"
            onPress={() =>
              void archiveContentReport({ reportId: item.id, reviewerNote: 'Reviewed by admin' }).then(
                () => reload(),
              )
            }
          >
            Mark reviewed
          </Button>
        </View>
      ))}

      <Button variant="ghost" size="sm" onPress={() => void reload()}>
        Refresh queue
      </Button>
    </Card>
  );
}
