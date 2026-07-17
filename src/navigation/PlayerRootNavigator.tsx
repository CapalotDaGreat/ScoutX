import { useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AccountUpgradePrompt } from '@/features/auth/components/AccountUpgradePrompt';
import { useAccountUpgradePrompt } from '@/features/auth/hooks/useAccountUpgradePrompt';
import { LoginScreen } from '@/features/auth/screens/LoginScreen';
import { ForgotPasswordScreen } from '@/features/auth/screens/ForgotPasswordScreen';
import { RegisterScreen } from '@/features/auth/screens/RegisterScreen';
import { PublicPortfolioStackScreen } from '@/features/public-portfolio/components/PublicPortfolioStackScreen';
import { CareerReplayScreen } from '@/features/career-replay/components/CareerReplayScreen';
import { SettingsScreen } from '@/features/settings';
import { PlayerWorkspaceProvider, usePlayerWorkspace } from '@/features/player-profile/context/PlayerWorkspaceProvider';
import { defaultPrivacySettings, type PrivacySettings } from '@/features/player-profile/types/privacySettings';
import { appendSystemJourneyEvents } from '@/features/career-timeline/services/careerTimelineService';
import { PlayerTrialsScreen } from '@/features/trial-invitations';
import { PlayerDetailScreen } from '@/features/scout-discovery/components/PlayerDetailScreen';
import { PlayerTabNavigator } from '@/navigation/PlayerTabNavigator';
import { type PlayerStackParamList } from '@/navigation/types';
import { useAuth } from '@/features/auth/store/AuthProvider';

const Stack = createNativeStackNavigator<PlayerStackParamList>();

function PlayerTabsRoute() {
  return <PlayerTabNavigator />;
}

function PublicPortfolioRoute({
  navigation,
  route,
}: NativeStackScreenProps<PlayerStackParamList, 'PublicPortfolio'>) {
  const { portfolioPreview, isLoading } = usePlayerWorkspace();
  const { beginUpgrade, isGuest } = useAuth();

  return (
    <PublicPortfolioStackScreen
      playerId={route.params.playerId}
      slug={route.params.slug}
      previewMode={route.params.previewMode}
      previewData={route.params.previewMode ? portfolioPreview ?? undefined : undefined}
      previewLoading={route.params.previewMode ? isLoading : false}
      onBack={() => navigation.goBack()}
      onSignInForEndorsement={
        isGuest
          ? () => {
              beginUpgrade('login');
              navigation.navigate('PlayerLogin');
            }
          : undefined
      }
      onRegisterForEndorsement={
        isGuest
          ? () => {
              beginUpgrade('register');
              navigation.navigate('PlayerRegister');
            }
          : undefined
      }
    />
  );
}

function CareerReplayRoute({
  navigation,
}: NativeStackScreenProps<PlayerStackParamList, 'CareerReplay'>) {
  return <CareerReplayScreen onBack={() => navigation.goBack()} />;
}

function TrialsRoute({
  navigation,
}: NativeStackScreenProps<PlayerStackParamList, 'Trials'>) {
  return <PlayerTrialsScreen onBack={() => navigation.goBack()} />;
}

function SettingsRoute({
  navigation,
}: NativeStackScreenProps<PlayerStackParamList, 'Settings'>) {
  const { signOut } = useAuth();
  const { profile, isSaving, saveProfile } = usePlayerWorkspace();

  const handlePrivacyChange = async (privacy: PrivacySettings) => {
    if (!profile) {
      await saveProfile({ privacy });
      return;
    }

    let nextJourney = profile.footballJourney;
    if (privacy.publicPortfolioEnabled && !profile.privacy?.publicPortfolioEnabled) {
      nextJourney = appendSystemJourneyEvents(nextJourney, { type: 'portfolio_enabled' });
    }
    if (privacy.discoverableByScouts && !profile.privacy?.discoverableByScouts) {
      nextJourney = appendSystemJourneyEvents(nextJourney, { type: 'discoverable_enabled' });
    }

    await saveProfile({
      privacy,
      ...(nextJourney !== profile.footballJourney ? { footballJourney: nextJourney } : {}),
    });
  };

  return (
    <SettingsScreen
      onBack={() => navigation.goBack()}
      onSignOut={() => void signOut()}
      privacySettings={profile?.privacy ?? defaultPrivacySettings()}
      onPrivacyChange={handlePrivacyChange}
      privacyDisabled={isSaving || !profile}
    />
  );
}

function PlayerDetailRoute({
  navigation,
  route,
}: NativeStackScreenProps<PlayerStackParamList, 'PlayerDetail'>) {
  return (
    <PlayerDetailScreen
      playerId={route.params.playerId}
      onBack={() => navigation.goBack()}
      guestMode
      onViewPortfolio={(playerId) => navigation.navigate('PublicPortfolio', { playerId })}
    />
  );
}

function PlayerRegisterRoute({
  navigation,
}: NativeStackScreenProps<PlayerStackParamList, 'PlayerRegister'>) {
  const { signUp, signInWithApple, signInWithGoogle, isSubmitting, error, clearUpgrade } = useAuth();

  return (
    <RegisterScreen
      onSubmit={async (payload) => {
        await signUp(payload);
      }}
      onBack={() => {
        clearUpgrade();
        navigation.goBack();
      }}
      onSignInWithApple={() => void signInWithApple()}
      onSignInWithGoogle={() => void signInWithGoogle()}
      isSubmitting={isSubmitting}
      error={error}
    />
  );
}

function PlayerLoginRoute({
  navigation,
}: NativeStackScreenProps<PlayerStackParamList, 'PlayerLogin'>) {
  const { signIn, signInWithApple, signInWithGoogle, isSubmitting, error, successMessage, clearUpgrade } =
    useAuth();

  return (
    <LoginScreen
      onSubmit={async (payload) => {
        await signIn(payload);
      }}
      onBack={() => {
        clearUpgrade();
        navigation.goBack();
      }}
      onForgotPassword={() => navigation.navigate('PlayerForgotPassword')}
      onSignInWithApple={() => void signInWithApple()}
      onSignInWithGoogle={() => void signInWithGoogle()}
      isSubmitting={isSubmitting}
      error={error}
      successMessage={successMessage}
    />
  );
}

function PlayerForgotPasswordRoute({
  navigation,
}: NativeStackScreenProps<PlayerStackParamList, 'PlayerForgotPassword'>) {
  const { forgotPassword, isSubmitting, error, successMessage } = useAuth();

  return (
    <ForgotPasswordScreen
      onSubmit={forgotPassword}
      onBack={() => navigation.goBack()}
      isSubmitting={isSubmitting}
      error={error}
      successMessage={successMessage}
    />
  );
}

function PlayerUpgradeListener() {
  const navigation = useNavigation<NativeStackScreenProps<PlayerStackParamList>['navigation']>();
  const { upgradeIntent } = useAuth();

  useEffect(() => {
    if (upgradeIntent === 'register') {
      navigation.navigate('PlayerRegister');
    } else if (upgradeIntent === 'login') {
      navigation.navigate('PlayerLogin');
    }
  }, [navigation, upgradeIntent]);

  return null;
}

function PlayerStackContent() {
  const { beginUpgrade, isGuest } = useAuth();
  const { visible, dismiss } = useAccountUpgradePrompt();

  return (
    <>
      {isGuest ? <PlayerUpgradeListener /> : null}
      {isGuest ? (
        <AccountUpgradePrompt
          visible={visible}
          onDismiss={() => void dismiss()}
          onCreateAccount={() => beginUpgrade('register')}
          onSignIn={() => beginUpgrade('login')}
        />
      ) : null}
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="PlayerTabs" component={PlayerTabsRoute} />
        <Stack.Screen name="PublicPortfolio" component={PublicPortfolioRoute} />
        <Stack.Screen name="CareerReplay" component={CareerReplayRoute} />
        <Stack.Screen name="Settings" component={SettingsRoute} />
        <Stack.Screen name="Trials" component={TrialsRoute} />
        <Stack.Screen name="PlayerDetail" component={PlayerDetailRoute} />
        <Stack.Screen name="PlayerRegister" component={PlayerRegisterRoute} />
        <Stack.Screen name="PlayerLogin" component={PlayerLoginRoute} />
        <Stack.Screen name="PlayerForgotPassword" component={PlayerForgotPasswordRoute} />
      </Stack.Navigator>
    </>
  );
}

export function PlayerRootNavigator() {
  return (
    <PlayerWorkspaceProvider>
      <PlayerStackContent />
    </PlayerWorkspaceProvider>
  );
}
