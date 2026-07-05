import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { SessionLoadingScreen } from '@/features/auth/screens/SessionLoadingScreen';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { AuthStackNavigator } from '@/navigation/AuthStackNavigator';
import { GuestRootNavigator } from '@/navigation/GuestRootNavigator';
import { linking } from '@/navigation/linking';
import { useNavigationTheme } from '@/navigation/navigationTheme';
import { PlayerRootNavigator } from '@/navigation/PlayerRootNavigator';
import { ScoutRootNavigator } from '@/navigation/ScoutRootNavigator';
import { type RootStackParamList } from '@/navigation/types';
import { NavigationContainer } from '@react-navigation/native';

const RootStack = createNativeStackNavigator<RootStackParamList>();

function resolveRootRouteName(
  status: ReturnType<typeof useAuth>['status'],
  pendingRoleSelection: boolean,
  isGuest: boolean,
  role: ReturnType<typeof useAuth>['role'],
): keyof RootStackParamList {
  if (status !== 'authenticated') {
    return 'Auth';
  }
  if (pendingRoleSelection) {
    return 'Auth';
  }
  if (isGuest) {
    return 'GuestApp';
  }
  if (role === 'scout' || role === 'coach') {
    return 'ScoutApp';
  }
  return 'PlayerApp';
}

export function RootNavigator() {
  const navigationTheme = useNavigationTheme();
  const { status, pendingRoleSelection, isGuest, role } = useAuth();

  const rootRoute = useMemo(
    () => resolveRootRouteName(status, pendingRoleSelection, isGuest, role),
    [isGuest, pendingRoleSelection, role, status],
  );

  if (status === 'loading') {
    return <SessionLoadingScreen />;
  }

  return (
    <NavigationContainer linking={linking} theme={navigationTheme}>
      <RootStack.Navigator
        key={`${status}-${role ?? 'none'}-${isGuest ? 'guest' : 'user'}-${pendingRoleSelection ? 'role' : 'ready'}`}
        initialRouteName={rootRoute}
        screenOptions={{ headerShown: false, animation: 'fade' }}
      >
        <RootStack.Screen name="Auth" component={AuthStackNavigator} />
        <RootStack.Screen name="PlayerApp" component={PlayerRootNavigator} />
        <RootStack.Screen name="ScoutApp" component={ScoutRootNavigator} />
        <RootStack.Screen name="GuestApp" component={GuestRootNavigator} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
