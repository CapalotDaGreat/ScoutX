import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Heading } from '@/components/primitives/Heading';
import { Text } from '@/components/primitives/Text';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type DashboardHeaderProps = {
  scoutName: string;
  matchingCount: number;
  savedCount: number;
  recentlyViewedCount: number;
};

function greetingKey(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

export function DashboardHeader({
  scoutName,
  matchingCount,
  savedCount,
  recentlyViewedCount,
}: DashboardHeaderProps) {
  const { t } = useAppTranslation('scout');
  return (
    <View className="gap-5">
      <View className="gap-1.5">
        <Text variant="overline" color="secondary" className="uppercase tracking-widest">
          {t('header.overline')}
        </Text>
        <Heading level={1}>
          {t(`header.greeting.${greetingKey()}`, { name: scoutName })}
        </Heading>
        <Text variant="body-sm" color="secondary" className="mt-0.5">
          {t('header.matching', { count: matchingCount })}
        </Text>
      </View>

      <View className="flex-row gap-3">
        <Card variant="elevated" padding="sm" className="flex-1">
          <Text variant="caption" color="secondary" className="uppercase tracking-wider">
            {t('header.statMatching')}
          </Text>
          <Text className="mt-1 font-sans-bold text-stat-lg text-foreground">
            {matchingCount}
          </Text>
        </Card>
        <Card variant="elevated" padding="sm" className="flex-1">
          <Text variant="caption" color="secondary" className="uppercase tracking-wider">
            {t('header.statPipeline')}
          </Text>
          <Text className="mt-1 font-sans-bold text-stat-lg text-foreground">
            {savedCount}
          </Text>
        </Card>
        <Card variant="elevated" padding="sm" className="flex-1">
          <Text variant="caption" color="secondary" className="uppercase tracking-wider">
            {t('header.statRecent')}
          </Text>
          <Text className="mt-1 font-sans-bold text-stat-lg text-foreground">
            {recentlyViewedCount}
          </Text>
        </Card>
      </View>
    </View>
  );
}
