import { View } from 'react-native';
import { Badge } from '@/components/primitives/Badge';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { type AiConfidence, type AiInsightBase } from '@/features/ai-insights/types';
import { Sparkles } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type AiInsightCardProps = {
  insight: AiInsightBase;
  isLive?: boolean;
  providerLabel?: string;
  children?: React.ReactNode;
};

const confidenceVariant: Record<AiConfidence, 'default' | 'warning' | 'success'> = {
  low: 'warning',
  medium: 'default',
  high: 'success',
};

export function AiInsightCard({
  insight,
  isLive = false,
  providerLabel,
  children,
}: AiInsightCardProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation(['evidence']);

  return (
    <Card variant="outlined" padding="md" className="gap-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 flex-row items-start gap-2">
          <Sparkles size={18} color={colors.accent} />
          <View className="flex-1">
            <Text weight="semibold">{insight.title}</Text>
            <Text variant="body-sm" color="secondary" className="mt-1">
              {insight.summary}
            </Text>
          </View>
        </View>
        {insight.confidence ? (
          <Badge label={insight.confidence} variant={confidenceVariant[insight.confidence]} size="sm" />
        ) : (
          <Badge label={t('evidence:confidenceUnknown')} variant="default" size="sm" />
        )}
      </View>

      {children}

      <Text variant="caption" color="secondary">
        {isLive ? `Powered by ${providerLabel ?? 'AI'}` : 'Development preview — mock AI provider'}
      </Text>
    </Card>
  );
}
