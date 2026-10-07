import { useEffect, useMemo } from 'react';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AccountUpgradePrompt } from '@/features/auth/components/AccountUpgradePrompt';
import { useAccountUpgradePrompt } from '@/features/auth/hooks/useAccountUpgradePrompt';
import { LoginScreen } from '@/features/auth/screens/LoginScreen';
import { ForgotPasswordScreen } from '@/features/auth/screens/ForgotPasswordScreen';
import { RegisterScreen } from '@/features/auth/screens/RegisterScreen';
import { PublicPortfolioStackScreen } from '@/features/public-portfolio/components/PublicPortfolioStackScreen';
import { CareerReplayScreen } from '@/features/career-replay/components/CareerReplayScreen';
import { AnalysisReportScreen } from '@/features/match-analysis/components/AnalysisReportScreen';
import { SettingsScreen } from '@/features/settings';
import { PrivacyCenterScreen } from '@/features/legal/screens/PrivacyCenterScreen';
import { PlanUsageScreen } from '@/features/premium/screens/PlanUsageScreen';
import { PortfolioPrivacySettings } from '@/features/public-portfolio';
import { PlayerWorkspaceProvider, usePlayerWorkspace } from '@/features/player-profile/context/PlayerWorkspaceProvider';
import { defaultPrivacySettings, type PrivacySettings } from '@/features/player-profile/types/privacySettings';
import { appendSystemJourneyEvents } from '@/features/career-timeline/services/careerTimelineService';
import { PlayerTrialsScreen } from '@/features/trial-invitations';
import { usePlayerTrialInvitations } from '@/features/trial-invitations/hooks/useTrialInvitations';
import { FootballMemoryScreen } from '@/features/football-memory/components/FootballMemoryScreen';
import { useFootballMemory } from '@/features/football-memory/hooks/useFootballMemory';
import { PlayerDetailScreen } from '@/features/scout-discovery/components/PlayerDetailScreen';
import { RequestCenterScreen } from '@/features/request-center/components/RequestCenterScreen';
import { PlayerTabNavigator } from '@/navigation/PlayerTabNavigator';
import { type PlayerStackParamList, type RootStackParamList } from '@/navigation/types';
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
  route,
}: NativeStackScreenProps<PlayerStackParamList, 'Trials'>) {
  return <PlayerTrialsScreen onBack={() => navigation.goBack()} focusTrialId={route.params?.trialId} />;
}

function RequestCenterRoute({
  navigation,
  route,
}: NativeStackScreenProps<PlayerStackParamList, 'RequestCenter'>) {
  return (
    <RequestCenterScreen
      onBack={() => navigation.goBack()}
      onOpenTrial={(trialId) => navigation.navigate('Trials', { trialId })}
      focusRequestId={route.params?.requestId}
    />
  );
}

function usePassportPrivacyChange() {
  const { profile, saveProfile } = usePlayerWorkspace();

  return async (privacy: PrivacySettings) => {
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
}

function SettingsRoute({
  navigation,
}: NativeStackScreenProps<PlayerStackParamList, 'Settings'>) {
  const { signOut } = useAuth();
  const { profile, isSaving } = usePlayerWorkspace();
  const handlePrivacyChange = usePassportPrivacyChange();

  return (
    <SettingsScreen
      onBack={() => navigation.goBack()}
      onSignOut={() => void signOut()}
      onOpenPrivacyCenter={() => navigation.navigate('PrivacyCenter')}
      onOpenPlan={() => navigation.navigate('PlanUsage')}
      privacySettings={profile?.privacy ?? defaultPrivacySettings()}
      onPrivacyChange={handlePrivacyChange}
      privacyDisabled={isSaving || !profile}
    />
  );
}

function PrivacyCenterRoute({
  navigation,
}: NativeStackScreenProps<PlayerStackParamList, 'PrivacyCenter'>) {
  const { profile, isSaving } = usePlayerWorkspace();
  const handlePrivacyChange = usePassportPrivacyChange();

  return (
    <PrivacyCenterScreen
      onBack={() => navigation.goBack()}
      visibilitySection={
        <PortfolioPrivacySettings
          settings={profile?.privacy ?? defaultPrivacySettings()}
          onChange={(next) => void handlePrivacyChange(next)}
          disabled={isSaving || !profile}
        />
      }
    />
  );
}

function PlanUsageRoute({ navigation }: NativeStackScreenProps<PlayerStackParamList, 'PlanUsage'>) {
  return <PlanUsageScreen onBack={() => navigation.goBack()} />;
}

function GlobalSearchRoute({
  navigation,
}: NativeStackScreenProps<PlayerStackParamList, 'GlobalSearch'>) {
  const { index } = useFootballMemory();

  return (
    <FootballMemoryScreen
      index={index}
      onBack={() => navigation.goBack()}
      onOpenLink={(link) => {
        switch (link.route) {
          case 'trial':
            navigation.navigate('Trials', { trialId: link.entityId });
            return;
          case 'analysis':
            navigation.navigate('AnalysisReport', { jobId: link.entityId });
            return;
          case 'reel':
            navigation.navigate('PlayerTabs', { screen: 'Media', params: { reelId: link.entityId } });
            return;
          case 'media':
            navigation.navigate('PlayerTabs', { screen: 'Media', params: undefined });
            return;
          case 'stats':
            navigation.navigate('PlayerTabs', { screen: 'Performance', params: { segment: 'stats' } });
            return;
          case 'career':
            navigation.navigate('PlayerTabs', { screen: 'Performance', params: { segment: 'career' } });
        }
      }}
    />
  );
}

function AnalysisReportRoute({
  navigation,
  route,
}: NativeStackScreenProps<PlayerStackParamList, 'AnalysisReport'>) {
  return <AnalysisReportScreen jobId={route.params.jobId} onBack={() => navigation.goBack()} />;
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

// Rendered beside the stack, so it holds the root navigator and must address the nested screen.
function PlayerUpgradeListener() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { upgradeIntent, clearUpgrade } = useAuth();

  useEffect(() => {
    if (!upgradeIntent) {
      return;
    }
    navigation.navigate('PlayerApp', {
      screen: upgradeIntent === 'register' ? 'PlayerRegister' : 'PlayerLogin',
    });
    clearUpgrade();
  }, [clearUpgrade, navigation, upgradeIntent]);

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
        <Stack.Screen name="PrivacyCenter" component={PrivacyCenterRoute} />
        <Stack.Screen name="PlanUsage" component={PlanUsageRoute} />
        <Stack.Screen name="GlobalSearch" component={GlobalSearchRoute} />
        <Stack.Screen name="Trials" component={TrialsRoute} />
        <Stack.Screen name="RequestCenter" component={RequestCenterRoute} />
        <Stack.Screen name="PlayerDetail" component={PlayerDetailRoute} />
        <Stack.Screen name="AnalysisReport" component={AnalysisReportRoute} />
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
