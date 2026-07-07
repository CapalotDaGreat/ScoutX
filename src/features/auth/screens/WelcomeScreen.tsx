import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ArrowRight, ShieldCheck, Sparkles, UserRound } from 'lucide-react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Button } from '@/components/primitives/Button';
import { Heading } from '@/components/primitives/Heading';
import { Screen } from '@/components/layout/Screen';
import { Text } from '@/components/primitives/Text';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { LegalFooterLinks } from '@/components/legal/LegalFooterLinks';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';

export type WelcomeScreenProps = {
  onGetStarted: () => void;
  onSignIn: () => void;
  onContinueAsGuest: () => void;
  onSignInWithApple?: () => void;
  isSubmitting?: boolean;
};

export function WelcomeScreen({
  onGetStarted,
  onSignIn,
  onContinueAsGuest,
  onSignInWithApple,
  isSubmitting = false,
}: WelcomeScreenProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation('auth');
  const [appleSignInAvailable, setAppleSignInAvailable] = useState(false);

  useEffect(() => {
    void AppleAuthentication.isAvailableAsync().then(setAppleSignInAvailable);
  }, []);

  return (
    <Screen title={t('welcome.title')} subtitle={t('welcome.subtitle')} safeArea>
      <View className="flex-1 justify-center">
        <AuthCard title={t('welcome.cardTitle')} subtitle={t('welcome.cardSubtitle')}>
          <View className="items-center justify-center rounded-2xl border border-border bg-background-secondary p-6 dark:border-neutral-800 dark:bg-neutral-900">
            <View className="mb-4 rounded-full bg-accent-muted p-3 dark:bg-green-950">
              <ShieldCheck size={28} color={colors.accent} strokeWidth={1.75} />
            </View>
            <Heading level={3} className="text-center">
              {t('welcome.heroTitle')}
            </Heading>
            <Text variant="body-sm" color="secondary" className="mt-2 text-center">
              {t('welcome.heroDescription')}
            </Text>
          </View>

          <View className="gap-3">
            <Button variant="accent" onPress={onGetStarted} rightIcon={<ArrowRight size={18} color={colors.accentForeground} strokeWidth={2} />}>
              {t('welcome.createAccount')}
            </Button>
            <Button variant="secondary" onPress={onSignIn}>
              {t('welcome.signIn')}
            </Button>
            {appleSignInAvailable && onSignInWithApple ? (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={12}
                style={{ width: '100%', height: 48 }}
                onPress={onSignInWithApple}
              />
            ) : null}
            <Button
              variant="ghost"
              loading={isSubmitting}
              onPress={onContinueAsGuest}
              leftIcon={<UserRound size={18} color={colors.textSecondary} strokeWidth={1.75} />}
            >
              {t('welcome.continueAsGuest')}
            </Button>
          </View>

          <View className="flex-row items-center justify-center gap-2 pt-2">
            <Sparkles size={16} color={colors.textSecondary} strokeWidth={1.5} />
            <Text variant="caption" color="secondary">
              {t('welcome.guestHint')}
            </Text>
          </View>
          <LegalFooterLinks className="pt-2" />
        </AuthCard>
      </View>
    </Screen>
  );
}
