import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PublicPortfolioScreen } from '@/features/public-portfolio';
import { PlayerTabNavigator } from '@/navigation/PlayerTabNavigator';
import { type PlayerStackParamList } from '@/navigation/types';

const Stack = createNativeStackNavigator<PlayerStackParamList>();

function PlayerTabsRoute() {
  return <PlayerTabNavigator />;
}

function PublicPortfolioRoute({
  navigation,
  route,
}: NativeStackScreenProps<PlayerStackParamList, 'PublicPortfolio'>) {
  return (
    <PublicPortfolioScreen
      playerId={route.params.playerId}
      previewMode={route.params.previewMode}
      onBack={() => navigation.goBack()}
    />
  );
}

export function PlayerRootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="PlayerTabs" component={PlayerTabsRoute} />
      <Stack.Screen name="PublicPortfolio" component={PublicPortfolioRoute} />
    </Stack.Navigator>
  );
}
