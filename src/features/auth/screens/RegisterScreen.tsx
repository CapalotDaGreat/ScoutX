import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Screen } from '@/components/layout/Screen';
import { FormActions } from '@/components/forms/FormActions';
import { FormField } from '@/components/forms/FormField';
import { Text } from '@/components/primitives/Text';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { useAuthForm } from '@/features/auth/hooks/useAuthForm';
import { type SignUpPayload } from '@/features/auth/types';

export type RegisterScreenProps = {
  onSubmit: (payload: SignUpPayload) => Promise<void>;
  onBack: () => void;
  isSubmitting?: boolean;
  error?: string | null;
};

export function RegisterScreen({ onSubmit, onBack, isSubmitting = false, error }: RegisterScreenProps) {
  const { values, errors, updateValue, validate } = useAuthForm<SignUpPayload>({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const isValid = validate((nextValues) => {
      const nextErrors: Partial<Record<keyof SignUpPayload, string>> = {};
      if (!nextValues.fullName.trim()) {
        nextErrors.fullName = 'Full name is required.';
      }
      if (!nextValues.email.trim()) {
        nextErrors.email = 'Email is required.';
      } else if (!/.+@.+\..+/.test(nextValues.email)) {
        nextErrors.email = 'Enter a valid email address.';
      }
      if (!nextValues.password.trim()) {
        nextErrors.password = 'Password is required.';
      } else if (nextValues.password.length < 8) {
        nextErrors.password = 'Use at least 8 characters.';
      }
      if (!nextValues.confirmPassword.trim()) {
        nextErrors.confirmPassword = 'Please confirm your password.';
      } else if (nextValues.confirmPassword !== nextValues.password) {
        nextErrors.confirmPassword = 'Passwords do not match.';
      }
      return nextErrors;
    });

    if (!isValid) {
      setLocalError(null);
      return;
    }

    setLocalError(null);
    await onSubmit(values);
  };

  const combinedError = useMemo(() => error ?? localError, [error, localError]);

  return (
    <Screen title="Create account" subtitle="Join the ScoutX community" >
      <AuthCard title="Register" subtitle="Set up your account and define your role later.">
        {combinedError ? (
          <View className="rounded-lg border border-error/30 bg-error-muted px-3 py-3 dark:border-red-800/40 dark:bg-red-950/40">
            <Text variant="body-sm" color="error">
              {combinedError}
            </Text>
          </View>
        ) : null}

        <FormField
          label="Full name"
          placeholder="Marcus Silva"
          value={values.fullName}
          onChangeText={(value) => updateValue('fullName', value)}
          error={errors.fullName}
          accessibilityLabel="Full name"
        />

        <FormField
          label="Email"
          placeholder="you@club.com"
          value={values.email}
          onChangeText={(value) => updateValue('email', value)}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          error={errors.email}
          accessibilityLabel="Email"
        />

        <FormField
          label="Password"
          placeholder="Create a password"
          value={values.password}
          onChangeText={(value) => updateValue('password', value)}
          secureTextEntry
          error={errors.password}
          accessibilityLabel="Password"
        />

        <FormField
          label="Confirm password"
          placeholder="Repeat your password"
          value={values.confirmPassword}
          onChangeText={(value) => updateValue('confirmPassword', value)}
          secureTextEntry
          error={errors.confirmPassword}
          accessibilityLabel="Confirm password"
        />

        <FormActions>
          <Button variant="accent" loading={isSubmitting} onPress={handleSubmit}>
            Create account
          </Button>
          <Button variant="secondary" onPress={onBack}>
            Back
          </Button>
        </FormActions>
      </AuthCard>
    </Screen>
  );
}
