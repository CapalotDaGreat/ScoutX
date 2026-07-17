import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTheme } from '@/theme';
import { Text } from '@/components/primitives/Text';
import { isGoogleSignInAvailable } from '@/features/auth/services/googleAuthService';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type GoogleSignInButtonProps = {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

/**
 * Accessible Google Sign-In control for Firebase OAuth flows.
 * Native GIS button assets are provided by @react-native-google-signin when needed;
 * this control keeps branding consistent across Welcome / Login / Register / Settings.
 */
export function GoogleSignInButton({
  onPress,
  disabled = false,
  loading = false,
}: GoogleSignInButtonProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation('auth');
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('google.signIn')}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      className="min-h-12 w-full flex-row items-center justify-center rounded-xl border border-border bg-surface-elevated px-4"
      style={{ opacity: isDisabled ? 0.55 : 1 }}
    >
      {loading ? (
        <ActivityIndicator color={colors.textPrimary} />
      ) : (
        <>
          <View
            className="mr-3 h-5 w-5 items-center justify-center"
            accessible={false}
            importantForAccessibility="no"
          >
            <Text weight="bold" className="text-[#4285F4]">
              G
            </Text>
          </View>
          <Text weight="semibold" className="text-foreground">
            {t('google.signIn')}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function useGoogleSignInAvailability(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void isGoogleSignInAvailable().then((next) => {
      if (!cancelled) {
        setAvailable(next);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return available;
}
