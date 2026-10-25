import { View } from 'react-native';
import { ArrowRight, Goal, UserRound } from 'lucide-react-native';
import { Button } from '@/components/primitives/Button';
import { Heading } from '@/components/primitives/Heading';
import { Screen } from '@/components/layout/Screen';
import { Text } from '@/components/primitives/Text';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { AuthOAuthActions } from '@/features/auth/components/AuthOAuthActions';
import { LegalFooterLinks } from '@/components/legal/LegalFooterLinks';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';

export type WelcomeScreenProps = {
  onGetStarted: () => void;
  onSignIn: () => void;
  onContinueAsGuest: () => void;
  onSignInWithApple?: () => void;
  onSignInWithGoogle?: () => void;
  isSubmitting?: boolean;
};

export function WelcomeScreen({
  onGetStarted,
  onSignIn,
  onContinueAsGuest,
  onSignInWithApple,
  onSignInWithGoogle,
  isSubmitting = false,
}: WelcomeScreenProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation('auth');

  return (
    <Screen safeArea>
      <View className="flex-1 justify-center py-6">
        <AuthCard title={t('welcome.title')} subtitle={t('welcome.subtitle')}>
          <View className="gap-3 border-b border-divider pb-6">
            <Goal size={36} color={colors.accent} strokeWidth={1.5} accessibilityElementsHidden importantForAccessibility="no" />
            <Heading level={3}>
              {t('welcome.heroTitle')}
            </Heading>
            <Text variant="body-sm" color="secondary">
              {t('welcome.heroDescription')}
            </Text>
          </View>

          <View className="gap-3">
            <Button
              variant="accent"
              onPress={onGetStarted}
              rightIcon={<ArrowRight size={18} color={colors.accentForeground} strokeWidth={2} />}
            >
              {t('welcome.createAccount')}
            </Button>
            <Button variant="secondary" onPress={onSignIn}>
              {t('welcome.signIn')}
            </Button>
            <AuthOAuthActions
              onSignInWithApple={onSignInWithApple}
              onSignInWithGoogle={onSignInWithGoogle}
              isSubmitting={isSubmitting}
              appleButtonType="sign-in"
            />
            <Button
              variant="secondary"
              loading={isSubmitting}
              onPress={onContinueAsGuest}
              leftIcon={<UserRound size={18} color={colors.textSecondary} strokeWidth={1.75} />}
            >
              {t('welcome.continueAsGuest')}
            </Button>
          </View>

          <View className="pt-1">
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
