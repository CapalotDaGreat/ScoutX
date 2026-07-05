import { NavigationContainer } from '@react-navigation/native';
import { SessionLoadingScreen } from '@/features/auth/screens/SessionLoadingScreen';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { AuthStackNavigator } from '@/navigation/AuthStackNavigator';
import { GuestRootNavigator } from '@/navigation/GuestRootNavigator';
import { linking } from '@/navigation/linking';
import { useNavigationTheme } from '@/navigation/navigationTheme';
import { PlayerRootNavigator } from '@/navigation/PlayerRootNavigator';
import { ScoutRootNavigator } from '@/navigation/ScoutRootNavigator';

export function RootNavigator() {
  const navigationTheme = useNavigationTheme();
  const { status, pendingRoleSelection, isGuest, role } = useAuth();

  if (status === 'loading') {
    return <SessionLoadingScreen />;
  }

  return (
    <NavigationContainer linking={linking} theme={navigationTheme}>
      {status === 'authenticated' ? (
        pendingRoleSelection ? (
          <AuthStackNavigator initialRouteName="RoleSelection" />
        ) : isGuest ? (
          <GuestRootNavigator />
        ) : role === 'scout' ? (
          <ScoutRootNavigator />
        ) : (
          <PlayerRootNavigator />
        )
      ) : (
        <AuthStackNavigator />
      )}
    </NavigationContainer>
  );
}
