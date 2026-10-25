import { View } from 'react-native';
import { GitCompare } from 'lucide-react-native';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { useScoutWorkspace } from '@/features/scout-discovery/hooks/useScoutWorkspace';
import { useTheme } from '@/theme';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type ComparisonQueueCardProps = {
  onOpenComparison: () => void;
};

export function ComparisonQueueCard({ onOpenComparison }: ComparisonQueueCardProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation('scout');
  const { comparisonPlayerIds } = useScoutWorkspace();

  if (comparisonPlayerIds.length === 0) {
    return null;
  }

  return (
    <View className="flex-row flex-wrap items-center gap-3 border-y border-divider py-3">
      <View className="min-w-[160px] flex-1">
        <Text variant="overline" color="secondary">
          {t('comparison.title')}
        </Text>
        <Text weight="semibold">
          {t('comparisonUi.queueCount', { count: comparisonPlayerIds.length })}
        </Text>
      </View>
      <Button
        variant="accent"
        leftIcon={<GitCompare size={18} color={colors.accentForeground} strokeWidth={2} />}
        onPress={onOpenComparison}
      >
        {t('comparisonUi.openComparison')}
      </Button>
    </View>
  );
}
