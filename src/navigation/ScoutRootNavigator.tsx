import { useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { PlayerDetailScreen } from '@/features/scout-discovery/components/PlayerDetailScreen';
import {
  RecruitmentProvider,
} from '@/features/scout-recruitment';
import {
  ScoutWorkspaceProvider,
} from '@/features/scout-discovery/hooks/useScoutWorkspace';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { ScoutFlowProvider, useScoutFlow } from '@/navigation/context/ScoutFlowContext';
import { ScoutTabNavigator } from '@/navigation/ScoutTabNavigator';
import { ActivityInboxScreen } from '@/features/activity-feed';
import { PublicPortfolioScreen } from '@/features/public-portfolio';
import { type ScoutStackParamList } from '@/navigation/types';

const Stack = createNativeStackNavigator<ScoutStackParamList>();

function ScoutTabsRoute() {
  const navigation = useNavigation<NativeStackScreenProps<ScoutStackParamList>['navigation']>();
  const { setOpenPlayerDetail } = useScoutFlow();

  useEffect(() => {
    setOpenPlayerDetail((playerId: string) => {
      navigation.navigate('PlayerDetail', { playerId });
    });
  }, [navigation, setOpenPlayerDetail]);

  return <ScoutTabNavigator />;
}

function PlayerDetailRoute({
  navigation,
  route,
}: NativeStackScreenProps<ScoutStackParamList, 'PlayerDetail'>) {
  return (
    <PlayerDetailScreen
      playerId={route.params.playerId}
      onBack={() => navigation.goBack()}
    />
  );
}

function ActivityInboxRoute({
  navigation,
}: NativeStackScreenProps<ScoutStackParamList, 'ActivityInbox'>) {
  return <ActivityInboxScreen onBack={() => navigation.goBack()} embeddedInTabShell />;
}

function PublicPortfolioRoute({
  navigation,
  route,
}: NativeStackScreenProps<ScoutStackParamList, 'PublicPortfolio'>) {
  return (
    <PublicPortfolioScreen
      playerId={route.params.playerId}
      onBack={() => navigation.goBack()}
    />
  );
}

export function ScoutRootNavigator() {
  const { user } = useAuth();

  return (
    <ScoutWorkspaceProvider scoutId={user?.uid ?? null}>
      <RecruitmentProvider scoutId={user?.uid ?? null} scoutName={user?.name ?? 'Scout'}>
        <ScoutFlowProvider>
          <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            <Stack.Screen name="ScoutTabs" component={ScoutTabsRoute} />
            <Stack.Screen name="PlayerDetail" component={PlayerDetailRoute} />
            <Stack.Screen name="ActivityInbox" component={ActivityInboxRoute} />
            <Stack.Screen name="PublicPortfolio" component={PublicPortfolioRoute} />
          </Stack.Navigator>
        </ScoutFlowProvider>
      </RecruitmentProvider>
    </ScoutWorkspaceProvider>
  );
}
