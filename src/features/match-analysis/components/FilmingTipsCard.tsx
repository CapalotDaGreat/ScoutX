import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { FILMING_TIP_KEYS } from '@/features/match-analysis/filmingTips';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

/**
 * Advice before a video is chosen. It attacks the main reason analysis abstains (an unreadable shirt number) at the
 * source, costs nothing to compute and never blocks an upload.
 */
export function FilmingTipsCard({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const { t } = useAppTranslation('matchAnalysis');
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <Card variant="tonal" padding="md" className="gap-2" testID="filming-tips">
      <Text weight="semibold">{t('filmingTips.title')}</Text>
      {open ? (
        <View className="gap-2">
          <Text variant="body-sm" color="secondary">
            {t('filmingTips.intro')}
          </Text>
          {FILMING_TIP_KEYS.map((key, index) => (
            <Text key={key} variant="body-sm">
              {`${index + 1}. ${t(`filmingTips.items.${key}`)}`}
            </Text>
          ))}
          <Text variant="caption" color="tertiary">
            {t('filmingTips.why')}
          </Text>
        </View>
      ) : null}
      <Button size="sm" variant="ghost" onPress={() => setOpen((value) => !value)} testID="filming-tips-toggle">
        {open ? t('filmingTips.hide') : t('filmingTips.show')}
      </Button>
    </Card>
  );
}
