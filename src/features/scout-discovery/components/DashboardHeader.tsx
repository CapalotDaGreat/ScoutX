import { View } from 'react-native';
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
    <View className="gap-4">
      <View className="gap-1.5">
        <Text variant="overline" color="secondary" style={{ letterSpacing: 0 }}>
          {t('header.overline')}
        </Text>
        <Heading level={2}>
          {t(`header.greeting.${greetingKey()}`, { name: scoutName })}
        </Heading>
        <Text variant="body-sm" color="secondary" className="mt-0.5">
          {t('header.matching', { count: matchingCount })}
        </Text>
      </View>

      <View className="flex-row border-y border-divider py-3">
        <View className="min-w-0 flex-1 pr-2">
          <Text variant="caption" color="secondary">
            {t('header.statMatching')}
          </Text>
          <Text variant="body-lg" weight="bold" className="mt-1">
            {matchingCount}
          </Text>
        </View>
        <View className="min-w-0 flex-1 border-l border-divider px-3">
          <Text variant="caption" color="secondary">
            {t('header.statPipeline')}
          </Text>
          <Text variant="body-lg" weight="bold" className="mt-1">
            {savedCount}
          </Text>
        </View>
        <View className="min-w-0 flex-1 border-l border-divider pl-3">
          <Text variant="caption" color="secondary">
            {t('header.statRecent')}
          </Text>
          <Text variant="body-lg" weight="bold" className="mt-1">
            {recentlyViewedCount}
          </Text>
        </View>
      </View>
    </View>
  );
}
