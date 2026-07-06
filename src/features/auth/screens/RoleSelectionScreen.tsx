import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Screen } from '@/components/layout/Screen';
import { FormActions } from '@/components/forms/FormActions';
import { Text } from '@/components/primitives/Text';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { RoleOption, type SelectableAuthRole } from '@/features/auth/components/RoleOption';
import { useAuthRoleSelection } from '@/features/auth/hooks/useAuthForm';

export type RoleSelectionScreenProps = {
  onContinue: (role: SelectableAuthRole) => void;
  onBack: () => void;
  successMessage?: string | null;
};

export function RoleSelectionScreen({ onContinue, onBack, successMessage }: RoleSelectionScreenProps) {
  const { role, setRole } = useAuthRoleSelection();

  return (
    <Screen title="Choose your role" subtitle="Pick the experience that fits you best">
      <AuthCard
        title="Role selection"
        subtitle="Coaches endorse players via invite links — no separate app required."
      >
        {successMessage ? (
          <View className="rounded-lg border border-accent/20 bg-accent-muted px-3 py-3 dark:border-green-800/40 dark:bg-green-950/40">
            <Text variant="body-sm" color="accent">
              {successMessage}
            </Text>
          </View>
        ) : null}

        <RoleOption role="player" selected={role === 'player'} onPress={() => setRole('player')} />
        <RoleOption role="scout" selected={role === 'scout'} onPress={() => setRole('scout')} />

        <FormActions>
          <Button variant="accent" disabled={!role} onPress={() => role && onContinue(role)}>
            Continue
          </Button>
          <Button variant="secondary" onPress={onBack}>
            Back
          </Button>
        </FormActions>
      </AuthCard>
    </Screen>
  );
}
