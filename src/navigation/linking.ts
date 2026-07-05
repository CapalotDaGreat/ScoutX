import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation/types';

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['scoutx://', 'https://scoutx.app'],
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
              Profile: 'player/profile',
              Feed: 'player/feed',
              Statistics: 'player/stats',
              Gps: 'player/gps',
              Trials: 'player/trials',
            },
          },
          PublicPortfolio: 'portfolio/:playerId',
        },
      },
      ScoutApp: {
        screens: {
          ScoutTabs: {
            screens: {
              Dashboard: 'scout',
              Discover: 'scout/discover',
              Feed: 'scout/feed',
              Compare: 'scout/compare',
              Pipeline: 'scout/pipeline',
            },
          },
          PlayerDetail: 'scout/player/:playerId',
          ActivityInbox: 'scout/activity',
          PublicPortfolio: 'portfolio/:playerId',
        },
      },
      GuestApp: {
        screens: {
          GuestMain: 'guest',
          PlayerDetail: 'guest/player/:playerId',
          PublicPortfolio: 'portfolio/:playerId',
          GuestRegister: 'guest/register',
          GuestLogin: 'guest/login',
        },
      },
    },
  },
};
