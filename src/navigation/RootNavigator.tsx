import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { NavigationContainer, CommonActions, getStateFromPath } from '@react-navigation/native';
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
import { resolveDeepLinkPath, resolutionToPath, type DeepLinkRole } from '@/navigation/deepLinkResolver';
import { consumeResumePath, setDeepLinkSession } from '@/navigation/deepLinkSession';
import { LinkUnavailableScreen } from '@/navigation/screens/LinkUnavailableScreen';
import { GuardianLinkScreen } from '@/navigation/screens/GuardianLinkScreen';
import { ReportLinkScreen } from '@/navigation/screens/ReportLinkScreen';

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

/** Link screens that sit outside the role apps and must survive the first auth sync. */
const STANDALONE_LINK_ROUTES: ReadonlySet<string> = new Set(['LinkUnavailable', 'GuardianLink', 'ReportLink']);

export function RootNavigator() {
  const navigationTheme = useNavigationTheme();
  const { status, pendingRoleSelection, isGuest, role, isBootstrappingSession, user } = useAuth();
  const sessionUid = user?.uid ?? null;
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  // Keyed by root route and account, so switching accounts within the same app also resets.
  const lastSyncedRootRef = useRef<string | null>(null);

  const rootRoute = useMemo(
    () => resolveRootRouteName(status, pendingRoleSelection, isGuest, role),
    [isGuest, pendingRoleSelection, role, status],
  );

  const showBootstrapOverlay = isBootstrappingSession;

  const linkRole: DeepLinkRole = isGuest ? 'guest' : role === 'scout' || role === 'coach' || role === 'player' ? role : null;
  const linkAuthenticated = status === 'authenticated' && !pendingRoleSelection && !isBootstrappingSession;
  setDeepLinkSession({ authenticated: linkAuthenticated, role: linkRole });

  useEffect(() => {
    if (showBootstrapOverlay || status === 'loading') {
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

    // Allow visitors (signed out, or in the automatic anonymous guest session) to stay on a
    // public passport / player detail deep link instead of being reset to Auth or Home.
    if ((status !== 'authenticated' || isGuest) && isGuestPublicBrowseState(navigation.getRootState())) {
      lastSyncedRootRef.current = 'GuestApp';
      return;
    }

    const needsRole = status === 'authenticated' && pendingRoleSelection;
    const syncKey = needsRole ? 'RoleSelection' : `${rootRoute}:${sessionUid ?? ''}`;
    if (lastSyncedRootRef.current === syncKey) {
      return;
    }

    const isFirstSync = lastSyncedRootRef.current === null;
    lastSyncedRootRef.current = syncKey;
    // A cold start from a link already resolved into the right app: keep the linked screen.
    const rootState = navigation.getRootState();
    const linkedRoute = rootState?.routes[rootState.index ?? 0]?.name;
    if (isFirstSync && !needsRole && (linkedRoute === rootRoute || (linkedRoute && STANDALONE_LINK_ROUTES.has(linkedRoute)))) {
      return;
    }
    if (needsRole) {
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'Auth', params: { screen: 'RoleSelection' } }],
        }),
      );
      return;
    }
    const resumePath = linkAuthenticated ? consumeResumePath() : null;
    const resumeState = resumePath
      ? getStateFromPath(
          resolutionToPath(resolveDeepLinkPath(resumePath, { authenticated: true, role: linkRole })),
          linking.config,
        )
      : undefined;
    if (resumeState) {
      navigation.resetRoot(resumeState as Parameters<typeof navigation.resetRoot>[0]);
      return;
    }
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: rootRoute }],
      }),
    );
  }, [showBootstrapOverlay, status, rootRoute, pendingRoleSelection, isGuest, role, linkAuthenticated, linkRole, sessionUid]);

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
          <RootStack.Screen name="LinkUnavailable" component={LinkUnavailableScreen} />
          <RootStack.Screen name="GuardianLink" component={GuardianLinkScreen} />
          <RootStack.Screen name="ReportLink" component={ReportLinkScreen} />
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
    ...StyleSheet.absoluteFill,
    zIndex: 20,
  },
});
