import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Screen } from '@/components/layout/Screen';
import { FormActions } from '@/components/forms/FormActions';
import { FormField } from '@/components/forms/FormField';
import { Text } from '@/components/primitives/Text';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { AuthOAuthActions } from '@/features/auth/components/AuthOAuthActions';
import { useAuthForm } from '@/features/auth/hooks/useAuthForm';
import { type SignInPayload } from '@/features/auth/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type LoginScreenProps = {
  onSubmit: (payload: SignInPayload) => Promise<void>;
  onBack: () => void;
  onForgotPassword: () => void;
  onSignInWithApple?: () => void;
  onSignInWithGoogle?: () => void;
  isSubmitting?: boolean;
  error?: string | null;
  successMessage?: string | null;
};

export function LoginScreen({
  onSubmit,
  onBack,
  onForgotPassword,
  onSignInWithApple,
  onSignInWithGoogle,
  isSubmitting = false,
  error,
  successMessage,
}: LoginScreenProps) {
  const { t } = useAppTranslation(['auth', 'validation', 'common']);
  const { values, errors, updateValue, validate, reset } = useAuthForm<SignInPayload>({
    email: '',
    password: '',
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const isValid = validate((nextValues) => {
      const nextErrors: Partial<Record<keyof SignInPayload, string>> = {};
      if (!nextValues.email.trim()) {
        nextErrors.email = t('validation:emailRequired');
      } else if (!/.+@.+\..+/.test(nextValues.email)) {
        nextErrors.email = t('validation:emailInvalid');
      }
      if (!nextValues.password.trim()) {
        nextErrors.password = t('validation:passwordRequired');
      }
      return nextErrors;
    });

    if (!isValid) {
      setLocalError(null);
      return;
    }

    setLocalError(null);
    try {
      await onSubmit(values);
      reset();
    } catch {
      // Error is surfaced by the auth provider.
    }
  };

  const combinedError = useMemo(() => error ?? localError, [error, localError]);

  return (
    <Screen title={t('login.title')} subtitle={t('login.subtitle')} onRefresh={undefined} refreshing={false}>
      <AuthCard title={t('login.cardTitle')} subtitle={t('login.cardSubtitle')}>
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
          label={t('login.email')}
          placeholder={t('login.emailPlaceholder')}
          value={values.email}
          onChangeText={(value) => updateValue('email', value)}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          error={errors.email}
          accessibilityLabel={t('login.email')}
        />

        <FormField
          label={t('login.password')}
          placeholder={t('login.passwordPlaceholder')}
          value={values.password}
          onChangeText={(value) => updateValue('password', value)}
          secureTextEntry
          textContentType="password"
          autoComplete="password"
          error={errors.password}
          accessibilityLabel={t('login.password')}
        />

        <Text variant="body-sm" color="accent" className="self-end" onPress={onForgotPassword}>
          {t('login.forgotPassword')}
        </Text>

        <FormActions>
          <Button variant="accent" loading={isSubmitting} onPress={handleSubmit}>
            {t('login.signIn')}
          </Button>
          <AuthOAuthActions
            onSignInWithApple={onSignInWithApple}
            onSignInWithGoogle={onSignInWithGoogle}
            isSubmitting={isSubmitting}
            appleButtonType="sign-in"
          />
          <Button variant="secondary" onPress={onBack}>
            {t('common:back')}
          </Button>
        </FormActions>
      </AuthCard>
    </Screen>
  );
}
