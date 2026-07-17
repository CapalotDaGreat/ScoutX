import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Screen } from '@/components/layout/Screen';
import { FormActions } from '@/components/forms/FormActions';
import { FormField } from '@/components/forms/FormField';
import { Text } from '@/components/primitives/Text';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { useAuthForm } from '@/features/auth/hooks/useAuthForm';
import { type ForgotPasswordPayload } from '@/features/auth/types';
import { validateEmailField } from '@/features/auth/utils/authValidation';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type ForgotPasswordScreenProps = {
  onSubmit: (payload: ForgotPasswordPayload) => Promise<void>;
  onBack: () => void;
  isSubmitting?: boolean;
  error?: string | null;
  successMessage?: string | null;
};

export function ForgotPasswordScreen({ onSubmit, onBack, isSubmitting = false, error, successMessage }: ForgotPasswordScreenProps) {
  const { t } = useAppTranslation(['auth', 'validation', 'common']);
  const { values, errors, updateValue, validate } = useAuthForm<ForgotPasswordPayload>({ email: '' });
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const isValid = validate((nextValues) => {
      const nextErrors: Partial<Record<keyof ForgotPasswordPayload, string>> = {};
      const emailError = validateEmailField(nextValues.email, t);
      if (emailError) {
        nextErrors.email = emailError;
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
    <Screen title={t('forgotPassword.title')} subtitle={t('forgotPassword.subtitle')}>
      <AuthCard title={t('forgotPassword.cardTitle')} subtitle={t('forgotPassword.cardSubtitle')}>
        {combinedError ? (
          <View className="rounded-lg border border-error/30 bg-error-muted px-3 py-3">
            <Text variant="body-sm" color="error">
              {combinedError}
            </Text>
          </View>
        ) : null}

        {successMessage ? (
          <View className="rounded-lg border border-accent/20 bg-accent-muted px-3 py-3">
            <Text variant="body-sm" color="accent">
              {successMessage}
            </Text>
          </View>
        ) : null}

        <FormField
          label={t('forgotPassword.email')}
          placeholder={t('forgotPassword.emailPlaceholder')}
          value={values.email}
          onChangeText={(value) => updateValue('email', value)}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          error={errors.email}
          accessibilityLabel={t('forgotPassword.email')}
        />

        <FormActions>
          <Button variant="accent" loading={isSubmitting} onPress={handleSubmit}>
            {t('forgotPassword.sendLink')}
          </Button>
          <Button variant="secondary" onPress={onBack}>
            {t('common:back')}
          </Button>
        </FormActions>
      </AuthCard>
    </Screen>
  );
}
