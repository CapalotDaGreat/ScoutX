import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import type { QuotaErrorInfo } from '@/features/premium/types';
import { useUserSafety } from '@/features/youth-safety/context/UserSafetyProvider';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type LimitReachedCardProps = {
  info: QuotaErrorInfo;
  /** Opens the plan page in Settings. Never shown to minors outside Settings. */
  onOpenPlan?: () => void;
};

/** Explains a reached limit and the free things the user can still do; never blocks core features. */
export function LimitReachedCard({ info, onOpenPlan }: LimitReachedCardProps) {
  const { t, i18n } = useAppTranslation(['premium']);
  const { policy } = useUserSafety();
  const title =
    info.reason === 'quota_exceeded'
      ? t('premium:limit.title', { feature: t(`premium:features.${info.feature}`) })
      : t('premium:limit.planTitle');
  const body =
    info.reason === 'quota_exceeded'
      ? t('premium:limit.body', { used: info.used, limit: info.limit })
      : t('premium:limit.planBody');
  const reset =
    info.reason === 'quota_exceeded' && info.resetAt
      ? t('premium:resetsOn', { date: new Date(info.resetAt).toLocaleDateString(i18n.language) })
      : null;

  return (
    <Card variant="elevated" padding="md" className="gap-3" testID="limit-reached-card">
      <Text weight="semibold">{title}</Text>
      <Text variant="body-sm" color="secondary">
        {body}
      </Text>
      {reset ? (
        <Text variant="caption" color="secondary">
          {reset}
        </Text>
      ) : null}
      <View className="gap-1">
        <Text variant="caption" weight="semibold">
          {t('premium:limit.stillFree')}
        </Text>
        <Text variant="caption" color="secondary">
          {t('premium:limit.freeActions')}
        </Text>
      </View>
      {onOpenPlan && !policy.isMinor ? (
        <Button variant="secondary" onPress={onOpenPlan} testID="limit-open-plan">
          {t('premium:limit.seePlan')}
        </Button>
      ) : null}
    </Card>
  );
}
