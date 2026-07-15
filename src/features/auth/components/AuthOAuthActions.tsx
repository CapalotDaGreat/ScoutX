import { View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { AppleSignInButton, useAppleSignInAvailability } from '@/features/auth/components/AppleSignInButton';
import { GoogleSignInButton, useGoogleSignInAvailability } from '@/features/auth/components/GoogleSignInButton';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type AuthOAuthActionsProps = {
  onSignInWithApple?: () => void;
  onSignInWithGoogle?: () => void;
  isSubmitting?: boolean;
  appleButtonType?: 'sign-in' | 'continue' | 'sign-up';
};

/**
 * Shared Apple + Google OAuth actions for Login / Register (Guideline 4.8 parity).
 */
export function AuthOAuthActions({
  onSignInWithApple,
  onSignInWithGoogle,
  isSubmitting = false,
  appleButtonType = 'sign-in',
}: AuthOAuthActionsProps) {
  const { t } = useAppTranslation('auth');
  const appleAvailable = useAppleSignInAvailability();
  const googleAvailable = useGoogleSignInAvailability();

  const showGoogle = Boolean(googleAvailable && onSignInWithGoogle);
  const showApple = Boolean(appleAvailable && onSignInWithApple);

  if (!showGoogle && !showApple) {
    return null;
  }

  return (
    <View className="gap-3">
      <Text variant="caption" color="secondary" className="text-center">
        {t('apple.orContinueWith')}
      </Text>
      {showGoogle && onSignInWithGoogle ? (
        <GoogleSignInButton disabled={isSubmitting} onPress={onSignInWithGoogle} />
      ) : null}
      {showApple && onSignInWithApple ? (
        <AppleSignInButton
          type={appleButtonType}
          disabled={isSubmitting}
          onPress={onSignInWithApple}
        />
      ) : null}
    </View>
  );
}
