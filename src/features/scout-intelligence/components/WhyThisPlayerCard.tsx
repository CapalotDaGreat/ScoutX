import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import type { WhyThisPlayerReason } from '@/features/scout-intelligence/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type WhyThisPlayerCardProps = {
  reasons: WhyThisPlayerReason[];
};

export function WhyThisPlayerCard({ reasons }: WhyThisPlayerCardProps) {
  const { t } = useAppTranslation(['scout']);

  return (
    <Card variant="outlined" padding="md" className="gap-2">
      <Text variant="body" className="font-sans-semibold">{t('scout:intelligence.whyTitle')}</Text>
      {reasons.length === 0 ? (
        <Text variant="body-sm" color="secondary">
          {t('scout:intelligence.whyEmpty')}
        </Text>
      ) : (
        reasons.map((reason) => (
          <View key={reason.id} className="gap-0.5">
            <Text variant="body-sm">{t(`scout:intelligence.why.${reason.code}`)}</Text>
            {reason.sampleSize > 0 ? (
              <Text variant="caption" color="secondary">
                {t('scout:intelligence.sampleSize', { count: reason.sampleSize })}
              </Text>
            ) : null}
          </View>
        ))
      )}
    </Card>
  );
}
