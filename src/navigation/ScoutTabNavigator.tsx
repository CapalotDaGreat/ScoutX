import { useMemo, useCallback } from 'react';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Compass, GitCompare, Home, Kanban, Newspaper } from 'lucide-react-native';
import { SocialFeedScreen } from '@/features/social-feed';
import { ScoutDashboardScreen } from '@/features/scout-discovery/components/ScoutDashboardScreen';
import { PlayerDiscoveryScreen } from '@/features/scout-discovery/components/PlayerDiscoveryScreen';
import { PlayerComparisonScreen } from '@/features/player-comparison';
import { RecruitmentPipelineScreen } from '@/features/scout-recruitment';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { useScoutFlow } from '@/navigation/context/ScoutFlowContext';
import { useScoutWorkspace } from '@/features/scout-discovery/hooks/useScoutWorkspace';
import { useRecruitment } from '@/features/scout-recruitment';
import { createNavigationTabBar } from '@/navigation/NavigationTabBar';
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
  const { user, signOut } = useAuth();
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
      onSignOut={() => void signOut()}
      embeddedInTabShell
    />
  );
}

function ScoutDiscoverRoute() {
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
    />
  );
}

function ScoutFeedRoute() {
  return <SocialFeedScreen embeddedInTabShell allowCreate />;
}

function ScoutCompareRoute() {
  const navigation = useScoutTabNavigation();

  return (
    <PlayerComparisonScreen
      onDiscoverPress={() => navigation.navigate('Discover')}
      embeddedInTabShell
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
    />
  );
}

function ScoutTabBarContainer() {
  const workspace = useScoutWorkspace();
  const recruitment = useRecruitment();

  const ScoutTabBar = useMemo(
    () =>
      createNavigationTabBar<ScoutTabId>({
        tabs: [
          { id: 'Dashboard', label: 'Home', icon: Home },
          { id: 'Discover', label: 'Discover', icon: Compass },
          { id: 'Feed', label: 'Feed', icon: Newspaper },
          { id: 'Compare', label: 'Compare', icon: GitCompare },
          { id: 'Pipeline', label: 'Pipeline', icon: Kanban },
        ],
        resolveBadge: (tabId) => {
          if (tabId === 'Pipeline') {
            return recruitment.savedCount;
          }
          if (tabId === 'Compare') {
            return workspace.comparisonPlayerIds.length;
          }
          return null;
        },
        testID: 'scout-tab-bar',
      }),
    [recruitment.savedCount, workspace.comparisonPlayerIds.length],
  );

  return (
    <Tab.Navigator
      tabBar={(props: BottomTabBarProps) => <ScoutTabBar {...props} />}
      screenOptions={{ headerShown: false, lazy: true }}
    >
      <Tab.Screen name="Dashboard" component={ScoutDashboardRoute} />
      <Tab.Screen name="Discover" component={ScoutDiscoverRoute} />
      <Tab.Screen name="Feed" component={ScoutFeedRoute} />
      <Tab.Screen name="Compare" component={ScoutCompareRoute} />
      <Tab.Screen name="Pipeline" component={ScoutPipelineRoute} />
    </Tab.Navigator>
  );
}

export function ScoutTabNavigator() {
  return <ScoutTabBarContainer />;
}
