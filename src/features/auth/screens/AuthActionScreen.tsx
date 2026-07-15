import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { CommonActions } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '@/components/primitives/Button';
import { Screen } from '@/components/layout/Screen';
import { Text } from '@/components/primitives/Text';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { handleAuthActionLink } from '@/features/auth/services/authActionLinkService';
import { useAuth } from '@/features/auth/store/AuthProvider';
import type { AuthStackParamList, RootStackParamList } from '@/navigation/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type AuthActionScreenProps = NativeStackScreenProps<AuthStackParamList, 'AuthAction'>;

function resolveAuthenticatedRoot(
  isGuest: boolean,
  role: ReturnType<typeof useAuth>['role'],
): keyof RootStackParamList {
  if (isGuest) {
    return 'PlayerApp';
  }
  if (role === 'scout' || role === 'coach') {
    return 'ScoutApp';
  }
  return 'PlayerApp';
}

export function AuthActionScreen({ navigation, route }: AuthActionScreenProps) {
  const { t } = useAppTranslation(['auth', 'common']);
  const { status, pendingRoleSelection, isGuest, role } = useAuth();
  const { mode, oobCode } = route.params;
  const [isProcessing, setIsProcessing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const processAction = async () => {
      setIsProcessing(true);
      setError(null);
      setSuccessMessage(null);

      try {
        const result = await handleAuthActionLink({ mode, oobCode });

        if (cancelled) {
          return;
        }

        if (result.status === 'reset-password-ready') {
          navigation.replace('CompletePasswordReset', { oobCode, email: result.email });
          return;
        }

        if (result.status === 'verified-email') {
          setSuccessMessage(t('auth:authAction.verifyEmailSuccess'));
          return;
        }

        if (result.status === 'recovered-email') {
          setSuccessMessage(t('auth:authAction.recoverEmailSuccess'));
          return;
        }

        setError(t('auth:authAction.unsupportedMode'));
      } catch (actionError) {
        if (!cancelled) {
          setError(actionError instanceof Error ? actionError.message : t('auth:authAction.failed'));
        }
      } finally {
        if (!cancelled) {
          setIsProcessing(false);
        }
      }
    };

    void processAction();

    return () => {
      cancelled = true;
    };
  }, [mode, navigation, oobCode, t]);

  const title = useMemo(() => {
    if (mode === 'verifyEmail') {
      return t('auth:authAction.verifyEmailTitle');
    }
    if (mode === 'resetPassword') {
      return t('auth:authAction.resetPasswordTitle');
    }
    if (mode === 'recoverEmail') {
      return t('auth:authAction.recoverEmailTitle');
    }
    return t('auth:authAction.title');
  }, [mode, t]);

  const continueIntoApp = () => {
    const rootNavigation = navigation.getParent();

    if (status === 'authenticated' && !pendingRoleSelection && rootNavigation) {
      rootNavigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: resolveAuthenticatedRoot(isGuest, role) }],
        }),
      );
      return;
    }

    navigation.navigate('Login');
  };

  return (
    <Screen title={title} subtitle={t('auth:authAction.subtitle')} safeArea>
      <AuthCard title={title} subtitle={t('auth:authAction.cardSubtitle')}>
        {isProcessing ? (
          <Text variant="body-sm" color="secondary">
            {t('auth:authAction.processing')}
          </Text>
        ) : null}

        {error ? (
          <View className="rounded-lg border border-error/30 bg-error-muted px-3 py-3 dark:border-red-800/40 dark:bg-red-950/40">
            <Text variant="body-sm" color="error">
              {error}
            </Text>
          </View>
        ) : null}

        {successMessage ? (
          <View className="rounded-lg border border-accent/20 bg-accent-muted px-3 py-3 dark:border-green-800/40 dark:bg-green-950/40">
            <Text variant="body-sm" color="accent">
              {successMessage}
            </Text>
          </View>
        ) : null}

        {!isProcessing ? (
          <Button variant="accent" onPress={continueIntoApp}>
            {successMessage ? t('auth:authAction.continueToApp') : t('common:back')}
          </Button>
        ) : null}
      </AuthCard>
    </Screen>
  );
}
