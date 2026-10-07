import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { Section } from '@/components/layout/Section';
import { EmptyState } from '@/components/feedback/EmptyState';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { Badge } from '@/components/primitives/Badge';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { FulfillRequestSheet } from '@/features/request-center/components/FulfillRequestSheet';
import { usePlayerRequests } from '@/features/request-center/hooks/usePlayerRequests';
import type { PlayerRequest } from '@/features/request-center/types';
import { ReportContentButton } from '@/features/trust-safety/components/ReportContentButton';
import type { EvidenceRequestKind } from '@/features/scout-intelligence/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { toUserMessage } from '@/utils/userFacingError';

export type RequestCenterScreenProps = {
  onBack: () => void;
  onOpenTrial: (trialId: string) => void;
  /** Evidence request opened from a deep link or push tap. */
  focusRequestId?: string;
};

const ACTIVE = new Set(['pending', 'accepted', 'in_progress']);

export function RequestCard({
  request,
  onFulfill,
  onDecline,
  onOpenTrial,
}: {
  request: PlayerRequest;
  onFulfill?: (request: PlayerRequest) => void;
  onDecline?: (request: PlayerRequest) => void;
  onOpenTrial?: (trialId: string) => void;
}) {
  const { t } = useAppTranslation(['common', 'scout', 'trust']);
  return (
    <Card variant="outlined" padding="md" className="gap-2">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text weight="semibold">{t(`common:requestCenter.sources.${request.source}`)}</Text>
          <Text variant="caption" color="secondary">
            {new Date(request.createdAt).toLocaleDateString()}
            {request.context ? ` · ${request.context}` : ''}
          </Text>
        </View>
        <Badge variant="outline" size="sm" label={t(`common:requestCenter.status.${request.status}`)} />
      </View>
      {request.requested.length > 0 ? (
        <Text variant="body-sm">
          {request.requested.map((kind) => t(`scout:intelligence.kinds.${kind as EvidenceRequestKind}`)).join(' · ')}
        </Text>
      ) : null}
      {request.message ? (
        <Text variant="body-sm" color="secondary" numberOfLines={3}>
          {request.message}
        </Text>
      ) : null}
      {request.expiresAt && request.status === 'pending' ? (
        <Text variant="caption" color="secondary">
          {t('common:requestCenter.expires', { date: new Date(request.expiresAt).toLocaleDateString() })}
        </Text>
      ) : null}
      {request.response ? (
        <Text variant="caption" color="secondary">
          {t('common:requestCenter.responded', { count: request.response.attachments.length })}
        </Text>
      ) : null}
      {request.nextAction === 'fulfill' && onFulfill ? (
        <View className="flex-row gap-2">
          <Button size="sm" className="flex-1" onPress={() => onFulfill(request)}>
            {t('common:requestCenter.fulfill')}
          </Button>
          {onDecline ? (
            <Button size="sm" variant="secondary" className="flex-1" onPress={() => onDecline(request)}>
              {t('common:requestCenter.decline')}
            </Button>
          ) : null}
        </View>
      ) : null}
      {request.source === 'trial_invitation' && onOpenTrial ? (
        <Button size="sm" variant="secondary" onPress={() => onOpenTrial(request.entityId)}>
          {request.nextAction === 'respond' ? t('common:requestCenter.respond') : t('common:requestCenter.view')}
        </Button>
      ) : null}
      {request.source === 'scout_evidence' && request.scoutId ? (
        <ReportContentButton
          targetType="evidenceRequest"
          targetId={request.entityId}
          targetOwnerId={request.scoutId}
          label={t('trust:report.requestButton')}
        />
      ) : null}
    </Card>
  );
}

export function RequestCenterScreen({ onBack, onOpenTrial, focusRequestId }: RequestCenterScreenProps) {
  const { t } = useAppTranslation('common');
  const { requests, isLoading, error, decline, fulfill } = usePlayerRequests();
  const [fulfilling, setFulfilling] = useState<PlayerRequest | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [focusMissing, setFocusMissing] = useState(false);
  const handledFocusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!focusRequestId || isLoading || handledFocusRef.current === focusRequestId) return;
    handledFocusRef.current = focusRequestId;
    const target = requests.find((item) => item.source === 'scout_evidence' && item.entityId === focusRequestId);
    if (!target) {
      setFocusMissing(true);
    } else if (target.nextAction === 'fulfill') {
      setFulfilling(target);
    }
  }, [focusRequestId, isLoading, requests]);

  const handleDecline = async (request: PlayerRequest) => {
    setActionError(null);
    try {
      await decline(request.entityId);
    } catch (err) {
      setActionError(toUserMessage(err, t('requestCenter.declineFailed')));
    }
  };

  const active = requests.filter((item) => ACTIVE.has(item.status));
  const closed = requests.filter((item) => !ACTIVE.has(item.status));

  return (
    <Screen
      title={t('requestCenter.title')}
      subtitle={t('requestCenter.subtitle')}
      error={error}
      footer={
        <Button variant="secondary" onPress={onBack} fullWidth>
          {t('back')}
        </Button>
      }
    >
      {isLoading ? (
        <SkeletonLoader variant="card" count={3} />
      ) : (
        <View className="gap-6">
          {focusMissing ? (
            <Card variant="outlined" padding="md" className="gap-1">
              <Text weight="semibold">{t('deepLink.not_found.title')}</Text>
              <Text variant="body-sm" color="secondary">{t('deepLink.not_found.body')}</Text>
            </Card>
          ) : null}
          {actionError ? (
            <Text variant="caption" color="error">
              {actionError}
            </Text>
          ) : null}
          {requests.length === 0 ? (
            <EmptyState title={t('requestCenter.emptyTitle')} description={t('requestCenter.emptyBody')} />
          ) : null}
          {active.length > 0 ? (
            <Section title={t('requestCenter.activeTitle')}>
              <View className="gap-3">
                {active.map((request) => (
                  <RequestCard
                    key={request.id}
                    request={request}
                    onFulfill={setFulfilling}
                    onDecline={(item) => void handleDecline(item)}
                    onOpenTrial={onOpenTrial}
                  />
                ))}
              </View>
            </Section>
          ) : null}
          {closed.length > 0 ? (
            <Section title={t('requestCenter.closedTitle')}>
              <View className="gap-3">
                {closed.map((request) => (
                  <RequestCard key={request.id} request={request} onOpenTrial={onOpenTrial} />
                ))}
              </View>
            </Section>
          ) : null}
        </View>
      )}
      <FulfillRequestSheet request={fulfilling} onClose={() => setFulfilling(null)} onSubmit={fulfill} />
    </Screen>
  );
}
