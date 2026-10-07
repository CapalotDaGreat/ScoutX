import { View } from 'react-native';
import { GitCompare } from 'lucide-react-native';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
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
    <Card variant="outlined" padding="md" className="gap-3">
      <View>
        <Text variant="overline" color="secondary">
          {t('comparison.title')}
        </Text>
        <Text weight="semibold">
          {t('comparisonUi.queueCount', { count: comparisonPlayerIds.length })}
        </Text>
        <Text variant="body-sm" color="secondary">
          {t('comparisonUi.queueBody')}
        </Text>
      </View>
      <Button
        variant="accent"
        leftIcon={<GitCompare size={18} color={colors.accentForeground} strokeWidth={2} />}
        onPress={onOpenComparison}
      >
        {t('comparisonUi.openComparison')}
      </Button>
    </Card>
  );
}
