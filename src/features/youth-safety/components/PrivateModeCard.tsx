import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

/** Shown instead of Passport and sharing features on under-13 accounts. */
export function PrivateModeCard() {
  const { t } = useAppTranslation('safety');
  return (
    <Card variant="outlined" padding="md" className="gap-1" testID="private-mode-card">
      <Text weight="semibold">{t('privateMode.title')}</Text>
      <Text variant="body-sm" color="secondary">
        {t('privateMode.body')}
      </Text>
    </Card>
  );
}
