import { View } from 'react-native';
import { GitCompare } from 'lucide-react-native';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { useScoutWorkspace } from '@/features/scout-discovery/hooks/useScoutWorkspace';
import { useTheme } from '@/theme';

export type ComparisonQueueCardProps = {
  onOpenComparison: () => void;
};

export function ComparisonQueueCard({ onOpenComparison }: ComparisonQueueCardProps) {
  const { colors } = useTheme();
  const { comparisonPlayerIds } = useScoutWorkspace();

  if (comparisonPlayerIds.length === 0) {
    return null;
  }

  return (
    <Card variant="outlined" padding="md" className="gap-3">
      <View>
        <Text variant="overline" color="secondary">
          Player comparison
        </Text>
        <Text weight="semibold">
          {comparisonPlayerIds.length} player{comparisonPlayerIds.length === 1 ? '' : 's'} in queue
        </Text>
        <Text variant="body-sm" color="secondary">
          Compare stats, radar charts, and highlight reels side by side.
        </Text>
      </View>
      <Button
        variant="accent"
        leftIcon={<GitCompare size={18} color={colors.accentForeground} strokeWidth={2} />}
        onPress={onOpenComparison}
      >
        Open comparison
      </Button>
    </Card>
  );
}
