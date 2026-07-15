import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Screen } from '@/components/layout/Screen';
import { FormActions } from '@/components/forms/FormActions';
import { FormField } from '@/components/forms/FormField';
import { Text } from '@/components/primitives/Text';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { AuthOAuthActions } from '@/features/auth/components/AuthOAuthActions';
import { LegalFooterLinks } from '@/components/legal/LegalFooterLinks';
import { useAuthForm } from '@/features/auth/hooks/useAuthForm';
import { type SignUpPayload } from '@/features/auth/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type RegisterScreenProps = {
  onSubmit: (payload: SignUpPayload) => Promise<void>;
  onBack: () => void;
  onSignInWithApple?: () => void;
  onSignInWithGoogle?: () => void;
  isSubmitting?: boolean;
  error?: string | null;
};

export function RegisterScreen({
  onSubmit,
  onBack,
  onSignInWithApple,
  onSignInWithGoogle,
  isSubmitting = false,
  error,
}: RegisterScreenProps) {
  const { t } = useAppTranslation(['auth', 'validation', 'common']);
  const { values, errors, updateValue, validate, reset } = useAuthForm<SignUpPayload>({
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
        nextErrors.fullName = t('validation:nameRequired');
      }
      if (!nextValues.email.trim()) {
        nextErrors.email = t('validation:emailRequired');
      } else if (!/.+@.+\..+/.test(nextValues.email)) {
        nextErrors.email = t('validation:emailInvalid');
      }
      if (!nextValues.password.trim()) {
        nextErrors.password = t('validation:passwordRequired');
      } else if (nextValues.password.length < 8) {
        nextErrors.password = t('validation:passwordMinLength', { count: 8 });
      }
      if (!nextValues.confirmPassword.trim()) {
        nextErrors.confirmPassword = t('validation:confirmPasswordRequired');
      } else if (nextValues.confirmPassword !== nextValues.password) {
        nextErrors.confirmPassword = t('validation:passwordMismatch');
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
    <Screen title={t('register.title')} subtitle={t('register.subtitle')}>
      <AuthCard title={t('register.cardTitle')} subtitle={t('register.cardSubtitle')}>
        {combinedError ? (
          <View className="rounded-lg border border-error/30 bg-error-muted px-3 py-3 dark:border-red-800/40 dark:bg-red-950/40">
            <Text variant="body-sm" color="error">
              {combinedError}
            </Text>
          </View>
        ) : null}

        <FormField
          label={t('register.fullName')}
          placeholder={t('register.fullNamePlaceholder')}
          value={values.fullName}
          onChangeText={(value) => updateValue('fullName', value)}
          error={errors.fullName}
          accessibilityLabel={t('register.fullName')}
        />

        <FormField
          label={t('register.email')}
          placeholder={t('register.emailPlaceholder')}
          value={values.email}
          onChangeText={(value) => updateValue('email', value)}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          error={errors.email}
          accessibilityLabel={t('register.email')}
        />

        <FormField
          label={t('register.password')}
          placeholder={t('register.passwordPlaceholder')}
          value={values.password}
          onChangeText={(value) => updateValue('password', value)}
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          error={errors.password}
          accessibilityLabel={t('register.password')}
        />

        <FormField
          label={t('register.confirmPassword')}
          placeholder={t('register.confirmPasswordPlaceholder')}
          value={values.confirmPassword}
          onChangeText={(value) => updateValue('confirmPassword', value)}
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          error={errors.confirmPassword}
          accessibilityLabel={t('register.confirmPassword')}
        />

        <FormActions>
          <Button variant="accent" loading={isSubmitting} onPress={handleSubmit}>
            {t('register.createAccount')}
          </Button>
          <AuthOAuthActions
            onSignInWithApple={onSignInWithApple}
            onSignInWithGoogle={onSignInWithGoogle}
            isSubmitting={isSubmitting}
            appleButtonType="sign-up"
          />
          <Button variant="secondary" onPress={onBack}>
            {t('common:back')}
          </Button>
        </FormActions>
        <LegalFooterLinks className="pt-2" />
      </AuthCard>
    </Screen>
  );
}
