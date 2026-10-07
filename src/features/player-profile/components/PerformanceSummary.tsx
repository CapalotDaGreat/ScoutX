import { View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Card } from '@/components/primitives/Card';
import { ProgressBar } from '@/components/primitives/ProgressBar';
import { Text } from '@/components/primitives/Text';
import { Heading } from '@/components/primitives/Heading';
import { type PlayerProfilePerformanceItem } from '@/features/player-profile/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export type PerformanceSummaryProps = {
  items: PlayerProfilePerformanceItem[];
};

export function PerformanceSummary({ items }: PerformanceSummaryProps) {
  const { t } = useAppTranslation('statistics');
  const reduceMotion = useReducedMotion();
  return (
    <Animated.View entering={reduceMotion ? undefined : FadeInUp.delay(200).duration(500)}>
      <Card variant="default" padding="lg" className="gap-4">
        <Heading level={3}>{t('charts.summaryTitle')}</Heading>
        {items.map((item) => (
          <View key={item.label} className="gap-2">
            <View className="flex-row items-center justify-between">
              <Text className="font-sans-medium text-foreground">{item.label}</Text>
              <Text variant="caption" color="secondary">
                {item.value}/{item.max}
              </Text>
            </View>
            <ProgressBar value={item.value} max={item.max} size="lg" variant="progress" />
            <Text variant="caption" color="secondary">
              {item.hint}
            </Text>
          </View>
        ))}
      </Card>
    </Animated.View>
  );
}
