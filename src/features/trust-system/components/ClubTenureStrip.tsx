import { View } from 'react-native';
import { Clock3 } from 'lucide-react-native';
import { Badge } from '@/components/primitives/Badge';
import { Text } from '@/components/primitives/Text';
import { type ClubTenure } from '@/features/trust-system/types';
import { useTheme } from '@/theme';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type ClubTenureStripProps = {
  tenures: ClubTenure[];
  maxItems?: number;
};

export function ClubTenureStrip({ tenures, maxItems = 4 }: ClubTenureStripProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation('trust');
  const visibleTenures = tenures.slice(0, maxItems);

  if (visibleTenures.length === 0) {
    return null;
  }

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <Clock3 size={14} color={colors.textSecondary} />
        <Text variant="caption" color="secondary">
          {t('tenure.title')}
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {visibleTenures.map((tenure) => (
          <Badge
            key={`${tenure.club}-${tenure.period}`}
            label={`${tenure.club} · ${t('tenure.years', { count: tenure.years })}`}
            variant={tenure.isCurrent ? 'accent' : 'outline'}
            size="sm"
          />
        ))}
      </View>
    </View>
  );
}
