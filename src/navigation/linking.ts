import * as Linking from 'expo-linking';
import type { LinkingOptions } from '@react-navigation/native';
import {
  getDeepLinkPrefixes,
  normalizeIncomingDeepLink,
  parseAuthActionLink,
} from '@/config/deepLinking';
import { stashPendingAuthAction } from '@/features/auth/services/pendingAuthDeepLinkService';
import type { RootStackParamList } from '@/navigation/types';

function captureAndNormalize(url: string): string {
  const authAction = parseAuthActionLink(url);
  if (authAction) {
    stashPendingAuthAction(authAction);
  }
  return normalizeIncomingDeepLink(url);
}

/**
 * Public Football Passport URLs use `player/:slug` once (GuestApp) so unauthenticated
 * visitors and deep links can open a passport without conflicting with PlayerApp tab paths.
 *
 * Authenticated guests build in PlayerApp; public slug links still resolve via GuestApp.
 *
 * Firebase auth action links (`auth/action`, `__/auth/action`) open AuthAction
 * and return users to ScoutX after email verification or password reset.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: getDeepLinkPrefixes(),
  async getInitialURL() {
    const url = await Linking.getInitialURL();
    if (!url) {
      return null;
    }

    return captureAndNormalize(url);
  },
  subscribe(listener) {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      listener(captureAndNormalize(url));
    });

    return () => {
      subscription.remove();
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
    },
  },
};
