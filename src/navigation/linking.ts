import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation/types';

/**
 * Public Football Passport URLs use `player/:slug` once (GuestApp) to avoid
 * React Navigation "conflicting screens" errors. Player and scout in-app
 * preview uses `navigation.navigate()` without URL paths.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [
    'scoutx://',
    'https://scoutx.app',
    'http://localhost:8081',
    'http://localhost:19006',
  ],
  config: {
    screens: {
      Auth: {
        screens: {
          Welcome: 'welcome',
          Login: 'login',
          Register: 'register',
          ForgotPassword: 'forgot-password',
          RoleSelection: 'role',
        },
      },
      PlayerApp: {
        screens: {
          PlayerTabs: {
            screens: {
              Portfolio: 'player/portfolio',
              Career: 'player/career',
              Statistics: 'player/stats',
              Gps: 'player/gps',
              Trials: 'player/trials',
            },
          },
        },
      },
      ScoutApp: {
        screens: {
          ScoutTabs: {
            screens: {
              Dashboard: 'scout',
              Discover: 'scout/discover',
              Pipeline: 'scout/pipeline',
            },
          },
          PlayerDetail: 'scout/player/:playerId',
          ActivityInbox: 'scout/activity',
        },
      },
      GuestApp: {
        screens: {
          GuestMain: 'guest',
          PlayerDetail: 'guest/player/:playerId',
          PublicPortfolio: 'player/:slug',
          GuestRegister: 'guest/register',
          GuestLogin: 'guest/login',
        },
      },
    },
  },
};
