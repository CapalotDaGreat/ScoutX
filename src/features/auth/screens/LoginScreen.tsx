import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Screen } from '@/components/layout/Screen';
import { FormActions } from '@/components/forms/FormActions';
import { FormField } from '@/components/forms/FormField';
import { Text } from '@/components/primitives/Text';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { useAuthForm } from '@/features/auth/hooks/useAuthForm';
import { type SignInPayload } from '@/features/auth/types';

export type LoginScreenProps = {
  onSubmit: (payload: SignInPayload) => Promise<void>;
  onBack: () => void;
  onForgotPassword: () => void;
  isSubmitting?: boolean;
  error?: string | null;
  successMessage?: string | null;
};

export function LoginScreen({ onSubmit, onBack, onForgotPassword, isSubmitting = false, error, successMessage }: LoginScreenProps) {
  const { values, errors, updateValue, validate } = useAuthForm<SignInPayload>({ email: '', password: '' });
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const isValid = validate((nextValues) => {
      const nextErrors: Partial<Record<keyof SignInPayload, string>> = {};
      if (!nextValues.email.trim()) {
        nextErrors.email = 'Email is required.';
      } else if (!/.+@.+\..+/.test(nextValues.email)) {
        nextErrors.email = 'Enter a valid email address.';
      }
      if (!nextValues.password.trim()) {
        nextErrors.password = 'Password is required.';
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
    <Screen title="Welcome back" subtitle="Sign in to continue" onRefresh={undefined} refreshing={false}>
      <AuthCard title="Log in" subtitle="Use your ScoutX credentials to continue.">
        {combinedError ? (
          <View className="rounded-lg border border-error/30 bg-error-muted px-3 py-3 dark:border-red-800/40 dark:bg-red-950/40">
            <Text variant="body-sm" color="error">
              {combinedError}
            </Text>
          </View>
        ) : null}

        {successMessage ? (
          <View className="rounded-lg border border-accent/20 bg-accent-muted px-3 py-3 dark:border-green-800/40 dark:bg-green-950/40">
            <Text variant="body-sm" color="accent">
              {successMessage}
            </Text>
          </View>
        ) : null}

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
          placeholder="Enter your password"
          value={values.password}
          onChangeText={(value) => updateValue('password', value)}
          secureTextEntry
          error={errors.password}
          accessibilityLabel="Password"
        />

        <Text variant="body-sm" color="accent" className="self-end" onPress={onForgotPassword}>
          Forgot password?
        </Text>

        <FormActions>
          <Button variant="accent" loading={isSubmitting} onPress={handleSubmit}>
            Sign in
          </Button>
          <Button variant="secondary" onPress={onBack}>
            Back
          </Button>
        </FormActions>
      </AuthCard>
    </Screen>
  );
}
