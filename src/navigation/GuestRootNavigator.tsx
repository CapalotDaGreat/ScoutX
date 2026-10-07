import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AccountUpgradePrompt } from '@/features/auth/components/AccountUpgradePrompt';
import { useAccountUpgradePrompt } from '@/features/auth/hooks/useAccountUpgradePrompt';
import { LoginScreen } from '@/features/auth/screens/LoginScreen';
import { ForgotPasswordScreen } from '@/features/auth/screens/ForgotPasswordScreen';
import { RegisterScreen } from '@/features/auth/screens/RegisterScreen';
import { PlayerDiscoveryScreen } from '@/features/scout-discovery/components/PlayerDiscoveryScreen';
import { PlayerDetailScreen } from '@/features/scout-discovery/components/PlayerDetailScreen';
import { useDiscoveryFilters } from '@/features/scout-discovery/hooks/useDiscoveryFilters';
import { ScoutWorkspaceProvider } from '@/features/scout-discovery/hooks/useScoutWorkspace';
import { type DiscoverablePlayer, type DiscoverySearchScope } from '@/features/scout-discovery/types';
import { RecruitmentProvider } from '@/features/scout-recruitment';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { PublicPortfolioStackScreen } from '@/features/public-portfolio/components/PublicPortfolioStackScreen';
import { type GuestStackParamList, type RootStackParamList } from '@/navigation/types';

const Stack = createNativeStackNavigator<GuestStackParamList>();

function GuestMainRoute({ navigation }: NativeStackScreenProps<GuestStackParamList, 'GuestMain'>) {
  const [search, setSearch] = useState('');
  const [searchScope, setSearchScope] = useState<DiscoverySearchScope>('all');
  const {
    filters,
    sort,
    activeFilterCount,
    activePresetId,
    updateFilter,
    setFilters,
    setSort,
    resetFilters,
    applyPreset,
  } = useDiscoveryFilters();

  const openPlayer = useCallback(
    (player: DiscoverablePlayer) => {
      navigation.navigate('PlayerDetail', { playerId: player.id });
    },
    [navigation],
  );

  return (
    <View className="flex-1 bg-background">
      <View className="flex-1">
        <PlayerDiscoveryScreen
          search={search}
          onSearchChange={setSearch}
          searchScope={searchScope}
          onSearchScopeChange={setSearchScope}
          filters={filters}
          sort={sort}
          activeFilterCount={activeFilterCount}
          activePresetId={activePresetId}
          onFilterChange={updateFilter}
          onFiltersReplace={setFilters}
          onSortChange={setSort}
          onResetFilters={resetFilters}
          onApplyPreset={applyPreset}
          onSaveCurrentPreset={() => undefined}
          onPlayerPress={openPlayer}
          guestMode
        />
      </View>
    </View>
  );
}

function GuestPlayerDetailRoute({
  navigation,
  route,
}: NativeStackScreenProps<GuestStackParamList, 'PlayerDetail'>) {
  return (
    <PlayerDetailScreen
      playerId={route.params.playerId}
      onBack={() => navigation.goBack()}
      guestMode
      onViewPortfolio={(playerId) => navigation.navigate('PublicPortfolio', { playerId })}
    />
  );
}

function GuestPublicPortfolioRoute({
  navigation,
  route,
}: NativeStackScreenProps<GuestStackParamList, 'PublicPortfolio'>) {
  const { beginUpgrade } = useAuth();

  return (
    <PublicPortfolioStackScreen
      playerId={route.params.playerId}
      slug={route.params.slug}
      onBack={() => navigation.goBack()}
      onSignInForEndorsement={() => {
        beginUpgrade('login');
        navigation.navigate('GuestLogin');
      }}
      onRegisterForEndorsement={() => {
        beginUpgrade('register');
        navigation.navigate('GuestRegister');
      }}
    />
  );
}

function GuestRegisterRoute({
  navigation,
}: NativeStackScreenProps<GuestStackParamList, 'GuestRegister'>) {
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

function GuestLoginRoute({ navigation }: NativeStackScreenProps<GuestStackParamList, 'GuestLogin'>) {
  const { signIn, signInWithApple, signInWithGoogle, isSubmitting, error, successMessage, clearUpgrade } = useAuth();

  return (
    <LoginScreen
      onSubmit={async (payload) => {
        await signIn(payload);
      }}
      onBack={() => {
        clearUpgrade();
        navigation.goBack();
      }}
      onForgotPassword={() => navigation.navigate('GuestForgotPassword')}
      onSignInWithApple={() => void signInWithApple()}
      onSignInWithGoogle={() => void signInWithGoogle()}
      isSubmitting={isSubmitting}
      error={error}
      successMessage={successMessage}
    />
  );
}

function GuestForgotPasswordRoute({
  navigation,
}: NativeStackScreenProps<GuestStackParamList, 'GuestForgotPassword'>) {
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
function GuestUpgradeListener() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { upgradeIntent, clearUpgrade } = useAuth();

  useEffect(() => {
    if (!upgradeIntent) {
      return;
    }
    navigation.navigate('GuestApp', {
      screen: upgradeIntent === 'register' ? 'GuestRegister' : 'GuestLogin',
    });
    clearUpgrade();
  }, [clearUpgrade, navigation, upgradeIntent]);

  return null;
}

function GuestStackContent() {
  const { beginUpgrade } = useAuth();
  const { visible, dismiss } = useAccountUpgradePrompt();

  return (
    <>
      <GuestUpgradeListener />
      <AccountUpgradePrompt
        visible={visible}
        onDismiss={() => void dismiss()}
        onCreateAccount={() => beginUpgrade('register')}
        onSignIn={() => beginUpgrade('login')}
      />
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="GuestMain" component={GuestMainRoute} />
        <Stack.Screen name="PlayerDetail" component={GuestPlayerDetailRoute} />
        <Stack.Screen name="PublicPortfolio" component={GuestPublicPortfolioRoute} />
        <Stack.Screen name="GuestRegister" component={GuestRegisterRoute} />
        <Stack.Screen name="GuestLogin" component={GuestLoginRoute} />
        <Stack.Screen name="GuestForgotPassword" component={GuestForgotPasswordRoute} />
      </Stack.Navigator>
    </>
  );
}

export function GuestRootNavigator() {
  const { user } = useAuth();

  return (
    <ScoutWorkspaceProvider scoutId={user?.uid ?? null}>
      {/* Provider required by discovery hooks; guest UI does not persist recruitment. */}
      <RecruitmentProvider scoutId={null} scoutName={user?.name ?? 'Guest'}>
        <GuestStackContent />
      </RecruitmentProvider>
    </ScoutWorkspaceProvider>
  );
}
