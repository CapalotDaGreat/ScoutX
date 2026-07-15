import { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useTheme } from '@/theme';
import {
  isAppleSignInAvailable,
  isAppleSignInSupportedPlatform,
} from '@/features/auth/services/appleAuthService';

export type AppleSignInButtonType =
  | 'sign-in'
  | 'continue'
  | 'sign-up';

export type AppleSignInButtonProps = {
  onPress: () => void;
  type?: AppleSignInButtonType;
  disabled?: boolean;
};

const BUTTON_TYPE_MAP: Record<AppleSignInButtonType, AppleAuthentication.AppleAuthenticationButtonType> = {
  'sign-in': AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN,
  continue: AppleAuthentication.AppleAuthenticationButtonType.CONTINUE,
  'sign-up': AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP,
};

/** Apple HIG-compliant Sign in with Apple button (min 44pt height, official styling). */
export function AppleSignInButton({
  onPress,
  type = 'sign-in',
  disabled = false,
}: AppleSignInButtonProps) {
  const { isDark } = useTheme();

  if (!isAppleSignInSupportedPlatform()) {
    return null;
  }

  return (
    <View
      pointerEvents={disabled ? 'none' : 'auto'}
      accessible={!disabled}
      accessibilityState={{ disabled }}
      style={{ width: '100%', opacity: disabled ? 0.55 : 1 }}
    >
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={BUTTON_TYPE_MAP[type]}
        buttonStyle={
          isDark
            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={12}
        style={{ width: '100%', height: 48 }}
        onPress={() => {
          if (!disabled) {
            onPress();
          }
        }}
      />
    </View>
  );
}

export function useAppleSignInAvailability(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!isAppleSignInSupportedPlatform()) {
      setAvailable(false);
      return;
    }

    let cancelled = false;
    void isAppleSignInAvailable().then((next) => {
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
