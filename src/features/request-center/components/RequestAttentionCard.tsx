import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { FulfillRequestSheet } from '@/features/request-center/components/FulfillRequestSheet';
import { RequestCard } from '@/features/request-center/components/RequestCenterScreen';
import { usePlayerRequests } from '@/features/request-center/hooks/usePlayerRequests';
import type { PlayerRequest } from '@/features/request-center/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type RequestAttentionCardProps = {
  onViewAll: () => void;
  onOpenTrial: (trialId: string) => void;
};

/** Today "needs attention" card. Renders nothing when no request needs the player. */
export function RequestAttentionCard({ onViewAll, onOpenTrial }: RequestAttentionCardProps) {
  const { t } = useAppTranslation('common');
  const { attention, decline, fulfill } = usePlayerRequests();
  const [fulfilling, setFulfilling] = useState<PlayerRequest | null>(null);

  if (attention.length === 0) {
    return null;
  }

  const first = attention[0];

  return (
    <Card variant="outlined" padding="md" className="gap-3" testID="today-request-attention">
      <View className="flex-row items-center justify-between gap-3">
        <Heading level={3}>{t('requestCenter.attentionTitle', { count: attention.length })}</Heading>
        <Button size="sm" variant="ghost" onPress={onViewAll}>
          {t('requestCenter.view')}
        </Button>
      </View>
      <Text variant="body-sm" color="secondary">
        {t('requestCenter.attentionBody')}
      </Text>
      <RequestCard
        request={first}
        onFulfill={setFulfilling}
        onDecline={(item) => void decline(item.entityId).catch(() => undefined)}
        onOpenTrial={onOpenTrial}
      />
      <FulfillRequestSheet request={fulfilling} onClose={() => setFulfilling(null)} onSubmit={fulfill} />
    </Card>
  );
}
