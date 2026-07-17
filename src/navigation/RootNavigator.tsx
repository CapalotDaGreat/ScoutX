import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { NavigationContainer, CommonActions } from '@react-navigation/native';
import type { NavigationContainerRef } from '@react-navigation/native';
import { SessionLoadingScreen } from '@/features/auth/screens/SessionLoadingScreen';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { consumePendingAuthAction } from '@/features/auth/services/pendingAuthDeepLinkService';
import { AuthStackNavigator } from '@/navigation/AuthStackNavigator';
import { GuestRootNavigator } from '@/navigation/GuestRootNavigator';
import { linking } from '@/navigation/linking';
import { useNavigationTheme } from '@/navigation/navigationTheme';
import { PlayerRootNavigator } from '@/navigation/PlayerRootNavigator';
import { ScoutRootNavigator } from '@/navigation/ScoutRootNavigator';
import { type RootStackParamList } from '@/navigation/types';

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
    return 'PlayerApp';
  }
  if (role === 'scout' || role === 'coach') {
    return 'ScoutApp';
  }
  return 'PlayerApp';
}

function isGuestPublicBrowseState(
  state: ReturnType<NavigationContainerRef<RootStackParamList>['getRootState']> | undefined,
): boolean {
  if (!state) {
    return false;
  }
  const route = state.routes[state.index ?? 0];
  if (route?.name !== 'GuestApp') {
    return false;
  }
  const nested = route.state as { routes?: Array<{ name?: string }>; index?: number } | undefined;
  const nestedRoute = nested?.routes?.[nested.index ?? 0];
  return nestedRoute?.name === 'PublicPortfolio' || nestedRoute?.name === 'PlayerDetail';
}

export function RootNavigator() {
  const navigationTheme = useNavigationTheme();
  const { status, pendingRoleSelection, isGuest, role, isBootstrappingSession } = useAuth();
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  const lastSyncedRootRef = useRef<keyof RootStackParamList | null>(null);

  const rootRoute = useMemo(
    () => resolveRootRouteName(status, pendingRoleSelection, isGuest, role),
    [isGuest, pendingRoleSelection, role, status],
  );

  const showBootstrapOverlay =
    status !== 'authenticated' && (status === 'loading' || isBootstrappingSession);

  useEffect(() => {
    if (showBootstrapOverlay) {
      return;
    }

    const navigation = navigationRef.current;
    if (!navigation?.isReady()) {
      return;
    }

    const pending = consumePendingAuthAction();
    if (pending) {
      lastSyncedRootRef.current = 'Auth';
      navigation.dispatch(
        CommonActions.navigate({
          name: 'Auth',
          params: {
            screen: 'AuthAction',
            params: {
              mode: pending.mode,
              oobCode: pending.oobCode,
              apiKey: pending.apiKey,
            },
          },
        }),
      );
      return;
    }

    // Allow unauthenticated deep links into GuestApp public passport / player detail
    // without immediately resetting back to Auth.
    if (status !== 'authenticated' && isGuestPublicBrowseState(navigation.getRootState())) {
      lastSyncedRootRef.current = 'GuestApp';
      return;
    }

    if (lastSyncedRootRef.current === rootRoute) {
      return;
    }

    lastSyncedRootRef.current = rootRoute;
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: rootRoute }],
      }),
    );
  }, [showBootstrapOverlay, status, rootRoute, pendingRoleSelection, isGuest, role]);

  return (
    <NavigationContainer ref={navigationRef} linking={linking} theme={navigationTheme}>
      <View style={styles.root}>
        <RootStack.Navigator
          initialRouteName={rootRoute}
          screenOptions={{ headerShown: false, animation: 'fade' }}
        >
          <RootStack.Screen name="Auth" component={AuthStackNavigator} />
          <RootStack.Screen name="PlayerApp" component={PlayerRootNavigator} />
          <RootStack.Screen name="ScoutApp" component={ScoutRootNavigator} />
          <RootStack.Screen name="GuestApp" component={GuestRootNavigator} />
        </RootStack.Navigator>

        {showBootstrapOverlay ? (
          <View style={styles.overlay} pointerEvents="auto">
            <SessionLoadingScreen />
          </View>
        ) : null}
      </View>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
});
