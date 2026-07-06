import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PublicPortfolioStackScreen } from '@/features/public-portfolio/components/PublicPortfolioStackScreen';
import { CareerReplayScreen } from '@/features/career-replay/components/CareerReplayScreen';
import { SettingsScreen } from '@/features/settings';
import { PlayerWorkspaceProvider, usePlayerWorkspace } from '@/features/player-profile/context/PlayerWorkspaceProvider';
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

  return (
    <PublicPortfolioStackScreen
      playerId={route.params.playerId}
      slug={route.params.slug}
      previewMode={route.params.previewMode}
      previewData={route.params.previewMode ? portfolioPreview ?? undefined : undefined}
      previewLoading={route.params.previewMode ? isLoading : false}
      onBack={() => navigation.goBack()}
    />
  );
}

function CareerReplayRoute({
  navigation,
}: NativeStackScreenProps<PlayerStackParamList, 'CareerReplay'>) {
  return <CareerReplayScreen onBack={() => navigation.goBack()} />;
}

function SettingsRoute({
  navigation,
}: NativeStackScreenProps<PlayerStackParamList, 'Settings'>) {
  const { signOut } = useAuth();

  return (
    <SettingsScreen
      onBack={() => navigation.goBack()}
      onSignOut={() => void signOut()}
    />
  );
}

export function PlayerRootNavigator() {
  return (
    <PlayerWorkspaceProvider>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="PlayerTabs" component={PlayerTabsRoute} />
        <Stack.Screen name="PublicPortfolio" component={PublicPortfolioRoute} />
        <Stack.Screen name="CareerReplay" component={CareerReplayRoute} />
        <Stack.Screen name="Settings" component={SettingsRoute} />
      </Stack.Navigator>
    </PlayerWorkspaceProvider>
  );
}
