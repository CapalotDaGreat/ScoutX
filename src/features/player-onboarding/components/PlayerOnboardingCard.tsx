import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { type OnboardingStep } from '@/features/player-onboarding/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type PlayerOnboardingCardProps = {
  steps: OnboardingStep[];
  completedCount: number;
  totalCount: number;
  onStepPress?: (stepId: OnboardingStep['id']) => void;
  onDismiss?: () => void;
};

export function PlayerOnboardingCard({
  steps,
  completedCount,
  totalCount,
  onStepPress,
  onDismiss,
}: PlayerOnboardingCardProps) {
  const { t } = useAppTranslation(['portfolio']);
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  return (
    <Card variant="default" padding="md" className="gap-3" testID="player-onboarding">
      <View className="gap-1">
        <Text variant="overline" color="secondary">
          {t('portfolio:onboarding.overline')}
        </Text>
        <Text weight="semibold">{t('portfolio:onboarding.title', { count: totalCount })}</Text>
        <Text variant="caption" color="secondary">
          {completedCount === 0
            ? t('portfolio:onboarding.encourageStart')
            : t('portfolio:onboarding.progress', { done: completedCount, total: totalCount })}
        </Text>
        <View
          className="h-1.5 overflow-hidden rounded-full bg-background-secondary"
          accessible
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: totalCount, now: completedCount }}
        >
          <View className="h-1.5 rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </View>
      </View>

      <View className="gap-2">
        {steps.map((step) => (
          <Button
            key={step.id}
            variant={step.complete ? 'secondary' : 'primary'}
            onPress={() => onStepPress?.(step.id)}
            fullWidth
            className="justify-start"
          >
            {step.complete
              ? `✓ ${t(`portfolio:today.passportSteps.${step.id}`)}`
              : t(`portfolio:today.passportSteps.${step.id}`)}
          </Button>
        ))}
      </View>

      {onDismiss ? (
        <Button variant="ghost" onPress={onDismiss}>
          {t('portfolio:onboarding.hide')}
        </Button>
      ) : null}
    </Card>
  );
}
