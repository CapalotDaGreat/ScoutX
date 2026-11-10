import { View } from 'react-native';
import { ArrowRight, Check, UserRound } from 'lucide-react-native';
import { Button } from '@/components/primitives/Button';
import { Heading } from '@/components/primitives/Heading';
import { Screen } from '@/components/layout/Screen';
import { Text } from '@/components/primitives/Text';
import { PitchSurface } from '@/components/football/PitchSurface';
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
        <View className="w-full max-w-lg self-center gap-6 py-4">
          <PitchSurface className="p-5">
            <Heading level={1} style={{ color: colors.onPitch }}>
              {t('welcome.title')}
            </Heading>
            <Text variant="body-sm" className="mt-1" style={{ color: colors.onPitchMuted }}>
              {t('welcome.subtitle')}
            </Text>
            <Text variant="body" weight="semibold" className="mt-5" style={{ color: colors.onPitch }}>
              {t('welcome.heroTitle')}
            </Text>
            <Text variant="body-sm" className="mt-1" style={{ color: colors.onPitchMuted }}>
              {t('welcome.heroDescription')}
            </Text>
            <View className="mt-4 gap-2.5" accessibilityRole="summary">
              {[t('welcome.trustMatch'), t('welcome.trustFootage'), t('welcome.trustShare')].map((line) => (
                <View key={line} className="flex-row items-start gap-2.5">
                  <View className="mt-0.5" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <Check size={16} color={colors.highlight} strokeWidth={2.5} />
                  </View>
                  <Text variant="body-sm" className="min-w-0 flex-1" style={{ color: colors.onPitch }}>
                    {line}
                  </Text>
                </View>
              ))}
            </View>
          </PitchSurface>

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
              variant="ghost"
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
        </View>
      </View>
    </Screen>
  );
}
