import { View } from 'react-native';
import { ArrowRight, ShieldCheck, Sparkles, UserRound } from 'lucide-react-native';
import { Button } from '@/components/primitives/Button';
import { Heading } from '@/components/primitives/Heading';
import { Screen } from '@/components/layout/Screen';
import { Text } from '@/components/primitives/Text';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { useTheme } from '@/theme';

export type WelcomeScreenProps = {
  onGetStarted: () => void;
  onSignIn: () => void;
  onContinueAsGuest: () => void;
  isSubmitting?: boolean;
};

export function WelcomeScreen({
  onGetStarted,
  onSignIn,
  onContinueAsGuest,
  isSubmitting = false,
}: WelcomeScreenProps) {
  const { colors } = useTheme();

  return (
    <Screen title="ScoutX" subtitle="Football scouting, refined." safeArea>
      <View className="flex-1 justify-center">
        <AuthCard title="Welcome aboard" subtitle="Build your network, discover opportunities, and manage your football profile with confidence.">
          <View className="items-center justify-center rounded-2xl border border-border bg-background-secondary p-6 dark:border-neutral-800 dark:bg-neutral-900">
            <View className="mb-4 rounded-full bg-accent-muted p-3 dark:bg-green-950">
              <ShieldCheck size={28} color={colors.accent} strokeWidth={1.75} />
            </View>
            <Heading level={3} className="text-center">
              Premium scouting, simplified
            </Heading>
            <Text variant="body-sm" color="secondary" className="mt-2 text-center">
              Secure onboarding, role-aware experiences, and polished flows designed for modern football clubs.
            </Text>
          </View>

          <View className="gap-3">
            <Button variant="accent" onPress={onGetStarted} rightIcon={<ArrowRight size={18} color={colors.accentForeground} strokeWidth={2} />}>
              Create your account
            </Button>
            <Button variant="secondary" onPress={onSignIn}>
              I already have an account
            </Button>
            <Button
              variant="ghost"
              loading={isSubmitting}
              onPress={onContinueAsGuest}
              leftIcon={<UserRound size={18} color={colors.textSecondary} strokeWidth={1.75} />}
            >
              Continue as Guest
            </Button>
          </View>

          <View className="flex-row items-center justify-center gap-2 pt-2">
            <Sparkles size={16} color={colors.textSecondary} strokeWidth={1.5} />
            <Text variant="caption" color="secondary">
              Guest mode preserves your session for easy account upgrade
            </Text>
          </View>
        </AuthCard>
      </View>
    </Screen>
  );
}
