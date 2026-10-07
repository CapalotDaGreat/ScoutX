import { Pressable, View } from 'react-native';
import { CheckCircle2, Circle } from 'lucide-react-native';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import type {
  ScoutAttentionItem,
  ScoutFirstSessionStep,
} from '@/features/scout-intelligence/services/scoutDecisionSupport';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';

const VISIBLE = 5;

export function ScoutAttentionCard({
  items,
  onPlayerPress,
}: {
  items: readonly ScoutAttentionItem[];
  onPlayerPress?: (playerId: string) => void;
}) {
  const { t } = useAppTranslation(['scout']);
  const label = (item: ScoutAttentionItem): string => {
    switch (item.kind) {
      case 'upcoming_trial':
        return t('scout:dashboard.attention.upcoming_trial', { name: item.playerName });
      case 'brief_match':
        return t('scout:dashboard.attention.brief_match', { name: item.playerName, brief: item.briefName });
      case 'fulfilled_request':
        return t('scout:dashboard.attention.fulfilled_request');
      case 'watchlist_change':
        return t('scout:dashboard.attention.watchlist_change');
    }
  };

  return (
    <Card variant="outlined" padding="md" className="gap-2" testID="scout-attention">
      <Text variant="body" className="font-sans-semibold" accessibilityRole="header">
        {t('scout:dashboard.attention.title')}
      </Text>
      {items.length === 0 ? (
        <Text variant="body-sm" color="secondary">
          {t('scout:dashboard.attention.empty')}
        </Text>
      ) : (
        items.slice(0, VISIBLE).map((item) => {
          const text = label(item);
          return onPlayerPress ? (
            <Pressable
              key={`${item.kind}-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={text}
              onPress={() => onPlayerPress(item.playerId)}
              className="min-h-11 justify-center active:opacity-80"
            >
              <Text variant="body-sm">{text}</Text>
            </Pressable>
          ) : (
            <Text key={`${item.kind}-${item.id}`} variant="body-sm">
              {text}
            </Text>
          );
        })
      )}
    </Card>
  );
}

export function ScoutFirstSessionCard({ steps }: { steps: readonly ScoutFirstSessionStep[] }) {
  const { t } = useAppTranslation(['scout']);
  const { colors } = useTheme();
  if (steps.every((step) => step.done)) {
    return null;
  }
  return (
    <Card variant="outlined" padding="md" className="gap-2" testID="scout-first-session">
      <Text variant="body" className="font-sans-semibold" accessibilityRole="header">
        {t('scout:dashboard.firstSession.title')}
      </Text>
      <Text variant="body-sm" color="secondary">
        {t('scout:dashboard.firstSession.subtitle')}
      </Text>
      {steps.map((step) => (
        <View
          key={step.id}
          className="flex-row items-center gap-2"
          accessibilityState={{ checked: step.done }}
          accessible
        >
          {step.done ? (
            <CheckCircle2 size={18} color={colors.accent} />
          ) : (
            <Circle size={18} color={colors.textSecondary} />
          )}
          <Text variant="body-sm" color={step.done ? 'secondary' : 'primary'}>
            {t(`scout:dashboard.firstSession.steps.${step.id}`)}
          </Text>
        </View>
      ))}
    </Card>
  );
}
