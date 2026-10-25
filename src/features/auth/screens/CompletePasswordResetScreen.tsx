import { useMemo, useState } from 'react';
import { View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '@/components/primitives/Button';
import { Screen } from '@/components/layout/Screen';
import { FormActions } from '@/components/forms/FormActions';
import { FormField } from '@/components/forms/FormField';
import { Text } from '@/components/primitives/Text';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { useAuthForm } from '@/features/auth/hooks/useAuthForm';
import { completePasswordResetWithCode } from '@/features/auth/services/authActionLinkService';
import { validatePasswordConfirmation } from '@/features/auth/utils/authValidation';
import type { AuthStackParamList } from '@/navigation/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

type CompletePasswordResetValues = {
  password: string;
  confirmPassword: string;
};

export type CompletePasswordResetScreenProps = NativeStackScreenProps<
  AuthStackParamList,
  'CompletePasswordReset'
>;

export function CompletePasswordResetScreen({ navigation, route }: CompletePasswordResetScreenProps) {
  const { t } = useAppTranslation(['auth', 'validation', 'common']);
  const { oobCode, email } = route.params;
  const { values, errors, updateValue, validate, reset } = useAuthForm<CompletePasswordResetValues>({
    password: '',
    confirmPassword: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const subtitle = useMemo(() => {
    if (email) {
      return t('auth:completePasswordReset.subtitleWithEmail', { email });
    }
    return t('auth:completePasswordReset.subtitle');
  }, [email, t]);

  const handleSubmit = async () => {
    const isValid = validate((nextValues) =>
      validatePasswordConfirmation(nextValues.password, nextValues.confirmPassword, t),
    );

    if (!isValid) {
      setError(null);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await completePasswordResetWithCode(oobCode, values.password);
      reset();
      setSuccessMessage(t('auth:completePasswordReset.success'));
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : t('auth:completePasswordReset.failed'),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen
      contentClassName="py-6"
      safeArea
    >
      <AuthCard
        title={t('auth:completePasswordReset.title')}
        subtitle={subtitle}
      >
        {error ? (
          <View accessibilityRole="alert" accessibilityLiveRegion="assertive" className="rounded-[8px] border border-error/30 bg-error-muted px-3 py-3">
            <Text variant="body-sm" color="error">
              {error}
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

        {!successMessage ? (
          <>
            <Text variant="body-sm" color="secondary">
              {t('auth:completePasswordReset.cardSubtitle')}
            </Text>
            <FormField
              label={t('auth:completePasswordReset.password')}
              value={values.password}
              onChangeText={(value) => updateValue('password', value)}
              secureTextEntry
              textContentType="newPassword"
              autoComplete="new-password"
              error={errors.password}
              accessibilityLabel={t('auth:completePasswordReset.password')}
            />

            <FormField
              label={t('auth:completePasswordReset.confirmPassword')}
              value={values.confirmPassword}
              onChangeText={(value) => updateValue('confirmPassword', value)}
              secureTextEntry
              textContentType="newPassword"
              autoComplete="new-password"
              error={errors.confirmPassword}
              accessibilityLabel={t('auth:completePasswordReset.confirmPassword')}
            />

            <FormActions>
              <Button variant="accent" loading={isSubmitting} onPress={() => void handleSubmit()}>
                {t('auth:completePasswordReset.submit')}
              </Button>
              <Button variant="secondary" onPress={() => navigation.navigate('Login')}>
                {t('common:back')}
              </Button>
            </FormActions>
          </>
        ) : (
          <Button variant="accent" onPress={() => navigation.navigate('Login')}>
            {t('auth:completePasswordReset.backToLogin')}
          </Button>
        )}
      </AuthCard>
    </Screen>
  );
}
