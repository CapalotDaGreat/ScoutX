import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { FormField } from '@/components/forms/FormField';
import { Text } from '@/components/primitives/Text';
import { changePasswordWithFirebase } from '@/features/auth/services/passwordService';
import { useAuthForm } from '@/features/auth/hooks/useAuthForm';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

type ChangePasswordFormValues = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export type ChangePasswordSectionProps = {
  email: string;
};

export function ChangePasswordSection({ email }: ChangePasswordSectionProps) {
  const { t } = useAppTranslation(['settings', 'validation']);
  const { values, errors, updateValue, validate, reset } = useAuthForm<ChangePasswordFormValues>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    const isValid = validate((nextValues) => {
      const nextErrors: Partial<Record<keyof ChangePasswordFormValues, string>> = {};

      if (!nextValues.currentPassword.trim()) {
        nextErrors.currentPassword = t('validation:passwordRequired');
      }
      if (!nextValues.newPassword.trim()) {
        nextErrors.newPassword = t('validation:passwordRequired');
      } else if (nextValues.newPassword.length < 8) {
        nextErrors.newPassword = t('validation:passwordMinLength', { count: 8 });
      }
      if (!nextValues.confirmPassword.trim()) {
        nextErrors.confirmPassword = t('validation:confirmPasswordRequired');
      } else if (nextValues.confirmPassword !== nextValues.newPassword) {
        nextErrors.confirmPassword = t('validation:passwordMismatch');
      }

      return nextErrors;
    });

    if (!isValid) {
      setError(null);
      setSuccessMessage(null);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await changePasswordWithFirebase(values, email);
      reset();
      setSuccessMessage(t('settings:changePasswordSuccess'));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('settings:changePasswordFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View className="gap-3">
      <Text variant="body-sm" color="secondary">
        {t('settings:changePasswordDescription')}
      </Text>

      {error ? (
        <Text variant="body-sm" color="error">
          {error}
        </Text>
      ) : null}

      {successMessage ? (
        <Text variant="body-sm" color="accent">
          {successMessage}
        </Text>
      ) : null}

      <FormField
        label={t('settings:currentPassword')}
        value={values.currentPassword}
        onChangeText={(value) => updateValue('currentPassword', value)}
        secureTextEntry
        textContentType="password"
        autoComplete="password"
        error={errors.currentPassword}
        accessibilityLabel={t('settings:currentPassword')}
      />

      <FormField
        label={t('settings:newPassword')}
        value={values.newPassword}
        onChangeText={(value) => updateValue('newPassword', value)}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
        error={errors.newPassword}
        accessibilityLabel={t('settings:newPassword')}
      />

      <FormField
        label={t('settings:confirmNewPassword')}
        value={values.confirmPassword}
        onChangeText={(value) => updateValue('confirmPassword', value)}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
        error={errors.confirmPassword}
        accessibilityLabel={t('settings:confirmNewPassword')}
      />

      <Button variant="secondary" loading={isSubmitting} onPress={() => void handleSubmit()}>
        {t('settings:changePassword')}
      </Button>
    </View>
  );
}
