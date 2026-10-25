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
import { validateEmailField } from '@/features/auth/utils/authValidation';
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
      const emailError = validateEmailField(nextValues.email, t);
      if (emailError) {
        nextErrors.email = emailError;
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
    <Screen contentClassName="py-6">
      <AuthCard title={t('login.title')} subtitle={t('login.cardSubtitle')}>
        {combinedError ? (
          <View accessibilityRole="alert" accessibilityLiveRegion="assertive" className="rounded-[8px] border border-error/30 bg-error-muted px-3 py-3">
            <Text variant="body-sm" color="error">
              {combinedError}
            </Text>
          </View>
        ) : null}

        {successMessage ? (
          <View accessibilityLiveRegion="polite" className="rounded-[8px] border border-success/20 bg-success-muted px-3 py-3">
            <Text variant="body-sm" color="success">
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

        <Text
          variant="body-sm"
          color="accent"
          accessibilityRole="link"
          accessibilityLabel={t('login.forgotPassword')}
          className="min-h-11 self-end py-3"
          onPress={onForgotPassword}
        >
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
