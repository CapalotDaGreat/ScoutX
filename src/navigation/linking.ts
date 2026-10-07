import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import type { LinkingOptions } from '@react-navigation/native';
import {
  getAppScheme,
  getDeepLinkPrefixes,
  normalizeIncomingDeepLink,
  parseAuthActionLink,
} from '@/config/deepLinking';
import { stashPendingAuthAction } from '@/features/auth/services/pendingAuthDeepLinkService';
import {
  extractLinkPath,
  isValidPushPath,
  resolveDeepLinkPath,
  resolutionToPath,
} from '@/navigation/deepLinkResolver';
import { getDeepLinkSession, stashResumePath } from '@/navigation/deepLinkSession';
import type { RootStackParamList } from '@/navigation/types';

const prefixes = getDeepLinkPrefixes();

function captureAndNormalize(url: string): string {
  const authAction = parseAuthActionLink(url);
  if (authAction) {
    stashPendingAuthAction(authAction);
    return normalizeIncomingDeepLink(url);
  }

  const resolution = resolveDeepLinkPath(extractLinkPath(url, prefixes), getDeepLinkSession());
  if (resolution.kind === 'passthrough') {
    return url;
  }
  if (resolution.kind === 'requires_auth') {
    stashResumePath(resolution.resumePath);
  }
  return `${getAppScheme()}://${resolutionToPath(resolution)}`;
}

type NotificationResponseLike = {
  notification: { request: { content: { data?: Record<string, unknown> | null } } };
};

function pushResponseUrl(response: NotificationResponseLike | null | undefined): string | null {
  const path = response?.notification.request.content.data?.path;
  return typeof path === 'string' && isValidPushPath(path) ? `${getAppScheme()}://${path}` : null;
}

/**
 * Public Football Passport URLs use `player/:slug` once (GuestApp) so unauthenticated
 * visitors and deep links can open a passport without conflicting with PlayerApp tab paths.
 *
 * Authenticated guests build in PlayerApp; public slug links still resolve via GuestApp.
 *
 * Firebase auth action links (`auth/action`, `__/auth/action`) open AuthAction
 * and return users to ScoutX after email verification or password reset.
 *
 * Push taps carry `data.path` and go through the same gate as URLs.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes,
  async getInitialURL() {
    const url = await Linking.getInitialURL();
    if (url) {
      return captureAndNormalize(url);
    }
    if (Platform.OS === 'web') {
      return null;
    }
    try {
      const Notifications = await import('expo-notifications');
      const pushUrl = pushResponseUrl(await Notifications.getLastNotificationResponseAsync());
      return pushUrl ? captureAndNormalize(pushUrl) : null;
    } catch {
      return null;
    }
  },
  subscribe(listener) {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      listener(captureAndNormalize(url));
    });

    let removePush: (() => void) | undefined;
    let cancelled = false;
    if (Platform.OS !== 'web') {
      void import('expo-notifications')
        .then((Notifications) => {
          if (cancelled) return;
          const pushSub = Notifications.addNotificationResponseReceivedListener((response) => {
            const pushUrl = pushResponseUrl(response);
            if (pushUrl) listener(captureAndNormalize(pushUrl));
          });
          removePush = () => pushSub.remove();
        })
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
      subscription.remove();
      removePush?.();
    };
  },
  config: {
    screens: {
      Auth: {
        screens: {
          Welcome: 'welcome',
          Login: 'login',
          Register: 'register',
          ForgotPassword: 'forgot-password',
          RoleSelection: 'role',
          AuthAction: {
            path: 'auth/action',
            parse: {
              mode: (value: string) => value,
              oobCode: (value: string) => value,
              apiKey: (value: string) => value,
            },
          },
          CompletePasswordReset: {
            path: 'auth/reset-password',
            parse: {
              oobCode: (value: string) => value,
              email: (value: string) => value,
            },
          },
        },
      },
      PlayerApp: {
        screens: {
          PlayerTabs: {
            screens: {
              Home: 'player/home',
              Performance: 'player/performance',
              Media: 'player/media',
              Discover: 'player/discover',
            },
          },
          PlayerDetail: 'player/detail/:playerId',
          Settings: 'player/settings',
          Trials: 'player/trials',
          RequestCenter: 'player/requests',
          AnalysisReport: 'match/:jobId',
          GlobalSearch: 'player/search',
          PlayerRegister: 'player/register',
          PlayerLogin: 'player/login',
          PlayerForgotPassword: 'player/forgot-password',
        },
      },
      ScoutApp: {
        screens: {
          ScoutTabs: {
            screens: {
              Dashboard: 'scout',
              Discover: 'scout/discover',
              Pipeline: 'scout/pipeline',
              Trials: 'scout/trials',
            },
          },
          PlayerDetail: 'scout/player/:playerId',
          PlayerComparison: 'scout/compare',
          ActivityInbox: 'scout/activity',
          Settings: 'scout/settings',
          GlobalSearch: 'scout/search',
        },
      },
      GuestApp: {
        screens: {
          GuestMain: 'guest',
          PlayerDetail: 'guest/player/:playerId',
          PublicPortfolio: {
            path: 'player/:slug',
            parse: {
              slug: (value: string) => value,
            },
          },
          GuestRegister: 'guest/register',
          GuestLogin: 'guest/login',
          GuestForgotPassword: 'guest/forgot-password',
        },
      },
      LinkUnavailable: 'link/unavailable',
    },
  },
};
