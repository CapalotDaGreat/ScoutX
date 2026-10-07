import { useMemo, useCallback } from 'react';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ClipboardList, Compass, Home, Kanban } from 'lucide-react-native';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { ScoutDashboardScreen } from '@/features/scout-discovery/components/ScoutDashboardScreen';
import { PlayerDiscoveryScreen } from '@/features/scout-discovery/components/PlayerDiscoveryScreen';
import { RecruitmentPipelineScreen } from '@/features/scout-recruitment';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { useScoutFlow } from '@/navigation/context/ScoutFlowContext';
import { useRecruitment } from '@/features/scout-recruitment';
import { useScoutAllTrialInvitations } from '@/features/trial-invitations/hooks/useTrialInvitations';
import { createNavigationTabBar } from '@/navigation/NavigationTabBar';
import { ScoutTrialsTab } from '@/navigation/ScoutTrialsTab';
import { type ScoutStackParamList, type ScoutTabParamList } from '@/navigation/types';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';

const Tab = createBottomTabNavigator<ScoutTabParamList>();

type ScoutTabId = keyof ScoutTabParamList;

function useScoutTabNavigation() {
  return useNavigation<
    BottomTabNavigationProp<ScoutTabParamList> &
      NativeStackNavigationProp<ScoutStackParamList>
  >();
}

function ScoutDashboardRoute() {
  const { user } = useAuth();
  const navigation = useScoutTabNavigation();
  const flow = useScoutFlow();
  const recruitment = useRecruitment();
  const scoutName = user?.name?.split(' ')[0] ?? 'Scout';

  const handleDiscoverPress = useCallback(() => {
    navigation.navigate('Discover');
  }, [navigation]);

  const handlePipelinePress = useCallback(() => {
    navigation.navigate('Pipeline');
  }, [navigation]);

  const handleSearchSubmit = useCallback(() => {
    flow.recordSearchSubmit();
    navigation.navigate('Discover');
  }, [flow, navigation]);

  const handlePlayerPress = useCallback(
    (player: DiscoverablePlayer) => {
      flow.openPlayerDetail(player.id);
    },
    [flow],
  );

  const handleActivityPress = useCallback(() => {
    navigation.navigate('ActivityInbox');
  }, [navigation]);

  const handleOpenComparisonPress = useCallback(() => {
    navigation.navigate('PlayerComparison');
  }, [navigation]);

  const handleSettingsPress = useCallback(() => {
    navigation.navigate('Settings');
  }, [navigation]);

  const handleGlobalSearchPress = useCallback(() => {
    navigation.navigate('GlobalSearch');
  }, [navigation]);

  return (
    <ScoutDashboardScreen
      scoutName={scoutName}
      searchValue={flow.search}
      onSearchChange={flow.setSearch}
      onSearchSubmit={handleSearchSubmit}
      onDiscoverPress={handleDiscoverPress}
      onPipelinePress={handlePipelinePress}
      onActivityPress={handleActivityPress}
      pipelineCount={recruitment.savedCount}
      onPlayerPress={handlePlayerPress}
      onPlayerIdPress={(playerId) => flow.openPlayerDetail(playerId)}
      onOpenComparisonPress={handleOpenComparisonPress}
      onSettingsPress={handleSettingsPress}
      onSearchPress={handleGlobalSearchPress}
      embeddedInTabShell
    />
  );
}

function ScoutDiscoverRoute() {
  const navigation = useScoutTabNavigation();
  const flow = useScoutFlow();

  const handlePlayerPress = useCallback(
    (player: DiscoverablePlayer) => {
      flow.openPlayerDetail(player.id);
    },
    [flow],
  );

  return (
    <PlayerDiscoveryScreen
      search={flow.search}
      onSearchChange={flow.setSearch}
      searchScope={flow.searchScope}
      onSearchScopeChange={flow.setSearchScope}
      onPlayerPress={handlePlayerPress}
      filters={flow.filters}
      sort={flow.sort}
      activeFilterCount={flow.activeFilterCount}
      activePresetId={flow.activePresetId}
      onFilterChange={flow.updateFilter}
      onFiltersReplace={flow.setFilters}
      onSortChange={flow.setSort}
      onResetFilters={flow.resetFilters}
      onApplyPreset={flow.applyPreset}
      onSaveCurrentPreset={flow.saveCurrentFilterPreset}
      onSettingsPress={() => navigation.navigate('Settings')}
    />
  );
}

function ScoutPipelineRoute() {
  const navigation = useScoutTabNavigation();
  const flow = useScoutFlow();

  return (
    <RecruitmentPipelineScreen
      onDiscoverPress={() => navigation.navigate('Discover')}
      onPlayerPress={(playerId) => flow.openPlayerDetail(playerId)}
      onSettingsPress={() => navigation.navigate('Settings')}
    />
  );
}

function ScoutTrialsRoute() {
  const navigation = useScoutTabNavigation();
  const flow = useScoutFlow();
  const route = useRoute<RouteProp<ScoutTabParamList, 'Trials'>>();

  return (
    <ScoutTrialsTab
      onPlayerPress={(playerId) => flow.openPlayerDetail(playerId)}
      onSettingsPress={() => navigation.navigate('Settings')}
      focusTrialId={route.params?.trialId}
    />
  );
}

function ScoutTabBarContainer() {
  const recruitment = useRecruitment();
  const { pendingCount } = useScoutAllTrialInvitations();
  const { t, i18n } = useAppTranslation('navigation');

  const ScoutTabBar = useMemo(
    () =>
      createNavigationTabBar<ScoutTabId>({
        tabs: [
          { id: 'Dashboard', label: t('tabs.home'), icon: Home },
          { id: 'Discover', label: t('tabs.discover'), icon: Compass },
          { id: 'Pipeline', label: t('tabs.pipeline'), icon: Kanban },
          { id: 'Trials', label: t('tabs.trials'), icon: ClipboardList },
        ],
        resolveBadge: (tabId) => {
          if (tabId === 'Pipeline') {
            return recruitment.savedCount;
          }
          if (tabId === 'Trials') {
            return pendingCount > 0 ? pendingCount : null;
          }
          return null;
        },
        testID: 'scout-tab-bar',
      }),
    [pendingCount, recruitment.savedCount, t, i18n.language],
  );

  return (
    <Tab.Navigator
      tabBar={(props: BottomTabBarProps) => <ScoutTabBar {...props} />}
      screenOptions={{ headerShown: false, lazy: true }}
    >
      <Tab.Screen name="Dashboard" component={ScoutDashboardRoute} />
      <Tab.Screen name="Discover" component={ScoutDiscoverRoute} />
      <Tab.Screen name="Pipeline" component={ScoutPipelineRoute} />
      <Tab.Screen name="Trials" component={ScoutTrialsRoute} />
    </Tab.Navigator>
  );
}

export function ScoutTabNavigator() {
  return <ScoutTabBarContainer />;
}
