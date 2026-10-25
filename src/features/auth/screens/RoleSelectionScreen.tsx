import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Screen } from '@/components/layout/Screen';
import { FormActions } from '@/components/forms/FormActions';
import { Text } from '@/components/primitives/Text';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { RoleOption, type SelectableAuthRole } from '@/features/auth/components/RoleOption';
import { useAuthRoleSelection } from '@/features/auth/hooks/useAuthForm';
import { useUserSafety } from '@/features/youth-safety/context/UserSafetyProvider';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type RoleSelectionScreenProps = {
  onContinue: (role: SelectableAuthRole) => void;
  onBack: () => void;
  successMessage?: string | null;
};

export function RoleSelectionScreen({ onContinue, onBack, successMessage }: RoleSelectionScreenProps) {
  const { t } = useAppTranslation(['auth', 'common']);
  const { role, setRole } = useAuthRoleSelection();
  const playerOnly = !useUserSafety().policy.canChooseNonPlayerRole;

  return (
    <Screen contentClassName="py-6">
      <AuthCard title={t('roleSelection.title')} subtitle={t('roleSelection.subtitle')}>
        {successMessage ? (
          <View accessibilityLiveRegion="polite" className="rounded-[8px] border border-success/20 bg-success-muted px-3 py-3">
            <Text variant="body-sm" color="success">
              {successMessage}
            </Text>
          </View>
        ) : null}

        <RoleOption role="player" selected={role === 'player'} onPress={() => setRole('player')} />
        {playerOnly ? null : (
          <>
            <RoleOption role="scout" selected={role === 'scout'} onPress={() => setRole('scout')} />
            <RoleOption role="coach" selected={role === 'coach'} onPress={() => setRole('coach')} />
          </>
        )}

        <FormActions>
          <Button variant="accent" disabled={!role} onPress={() => role && onContinue(role)}>
            {t('roleSelection.continue')}
          </Button>
          <Button variant="secondary" onPress={onBack}>
            {t('common:back')}
          </Button>
        </FormActions>
      </AuthCard>
    </Screen>
  );
}
