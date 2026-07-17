import { Pressable, View } from 'react-native';
import { ClipboardList } from 'lucide-react-native';
import { Badge } from '@/components/primitives/Badge';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/theme';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type HomeTrialsQuickActionProps = {
  pendingCount: number;
  onPress: () => void;
};

/** Home entry point for the player Trials stack screen. */
export function HomeTrialsQuickAction({ pendingCount, onPress }: HomeTrialsQuickActionProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation(['portfolio', 'navigation']);

  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Card variant="outlined" padding="md" className="flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-full bg-gold-muted">
          <ClipboardList size={22} color={colors.gold} strokeWidth={2} />
        </View>
        <View className="min-w-0 flex-1">
          <Text weight="semibold">{t('portfolio:trialsQuickActionTitle')}</Text>
          <Text variant="caption" color="secondary">
            {t('portfolio:trialsQuickActionSubtitle')}
          </Text>
        </View>
        {pendingCount > 0 ? (
          <Badge variant="prestige" label={String(pendingCount)} size="sm" />
        ) : null}
      </Card>
    </Pressable>
  );
}
