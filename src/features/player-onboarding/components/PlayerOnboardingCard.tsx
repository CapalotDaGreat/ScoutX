import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { type OnboardingStep } from '@/features/player-onboarding/types';

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
  return (
    <Card variant="default" padding="md" className="gap-3">
      <View>
        <Text variant="overline" color="secondary">
          Getting started
        </Text>
        <Text weight="semibold">Build your Football Passport in 5 steps</Text>
        <Text variant="caption" color="secondary">
          {completedCount}/{totalCount} complete
        </Text>
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
            {step.complete ? `✓ ${step.title}` : step.title}
          </Button>
        ))}
      </View>

      {onDismiss ? (
        <Button variant="ghost" onPress={onDismiss}>
          Hide for now
        </Button>
      ) : null}
    </Card>
  );
}
