import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GuestExploreBanner } from '@/features/auth/components/GuestExploreBanner';
import { LoginScreen } from '@/features/auth/screens/LoginScreen';
import { RegisterScreen } from '@/features/auth/screens/RegisterScreen';
import { PlayerDiscoveryScreen } from '@/features/scout-discovery/components/PlayerDiscoveryScreen';
import { PlayerDetailScreen } from '@/features/scout-discovery/components/PlayerDetailScreen';
import { useDiscoveryFilters } from '@/features/scout-discovery/hooks/useDiscoveryFilters';
import { ScoutWorkspaceProvider } from '@/features/scout-discovery/hooks/useScoutWorkspace';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { PublicPortfolioStackScreen } from '@/features/public-portfolio/components/PublicPortfolioStackScreen';
import { type GuestStackParamList } from '@/navigation/types';

const Stack = createNativeStackNavigator<GuestStackParamList>();

function GuestMainRoute({ navigation }: NativeStackScreenProps<GuestStackParamList, 'GuestMain'>) {
  const { signOut } = useAuth();
  const [search, setSearch] = useState('');
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
    <View className="flex-1 bg-background dark:bg-neutral-950">
      <GuestExploreBanner onSignOut={() => void signOut()} />
      <View className="flex-1">
        <PlayerDiscoveryScreen
          search={search}
          onSearchChange={setSearch}
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
  const { signUp, isSubmitting, error, clearUpgrade } = useAuth();

  return (
    <RegisterScreen
      onSubmit={async (payload) => {
        await signUp(payload);
      }}
      onBack={() => {
        clearUpgrade();
        navigation.goBack();
      }}
      isSubmitting={isSubmitting}
      error={error}
    />
  );
}

function GuestLoginRoute({ navigation }: NativeStackScreenProps<GuestStackParamList, 'GuestLogin'>) {
  const { signIn, isSubmitting, error, successMessage, clearUpgrade } = useAuth();

  return (
    <LoginScreen
      onSubmit={async (payload) => {
        await signIn(payload);
      }}
      onBack={() => {
        clearUpgrade();
        navigation.goBack();
      }}
      onForgotPassword={() => undefined}
      isSubmitting={isSubmitting}
      error={error}
      successMessage={successMessage}
    />
  );
}

function GuestUpgradeListener() {
  const navigation = useNavigation<NativeStackScreenProps<GuestStackParamList>['navigation']>();
  const { upgradeIntent } = useAuth();

  useEffect(() => {
    if (upgradeIntent === 'register') {
      navigation.navigate('GuestRegister');
    } else if (upgradeIntent === 'login') {
      navigation.navigate('GuestLogin');
    }
  }, [navigation, upgradeIntent]);

  return null;
}

function GuestStackContent() {
  const { user } = useAuth();

  return (
    <ScoutWorkspaceProvider scoutId={user?.uid ?? null}>
      <GuestUpgradeListener />
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="GuestMain" component={GuestMainRoute} />
        <Stack.Screen name="PlayerDetail" component={GuestPlayerDetailRoute} />
        <Stack.Screen name="PublicPortfolio" component={GuestPublicPortfolioRoute} />
        <Stack.Screen name="GuestRegister" component={GuestRegisterRoute} />
        <Stack.Screen name="GuestLogin" component={GuestLoginRoute} />
      </Stack.Navigator>
    </ScoutWorkspaceProvider>
  );
}

export function GuestRootNavigator() {
  return <GuestStackContent />;
}
