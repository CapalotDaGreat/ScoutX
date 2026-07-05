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
          Profile: 'player/profile',
          Statistics: 'player/stats',
          Gps: 'player/gps',
          Trials: 'player/trials',
        },
      },
      ScoutApp: {
        screens: {
          ScoutTabs: {
            screens: {
              Dashboard: 'scout',
              Discover: 'scout/discover',
              Compare: 'scout/compare',
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
          GuestRegister: 'guest/register',
          GuestLogin: 'guest/login',
        },
      },
    },
  },
};
