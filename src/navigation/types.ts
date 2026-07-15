import type { NavigatorScreenParams } from '@react-navigation/native';

import type { FirebaseAuthActionMode } from '@/config/deepLinking';

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  RoleSelection: undefined;
  AuthAction: {
    mode: FirebaseAuthActionMode;
    oobCode: string;
    apiKey?: string;
  };
  CompletePasswordReset: {
    oobCode: string;
    email?: string;
  };
};

export type PlayerTabParamList = {
  Home: undefined;
  Performance: undefined;
  Track: undefined;
  Search: undefined;
};

export type PlayerStackParamList = {
  PlayerTabs: NavigatorScreenParams<PlayerTabParamList>;
  PublicPortfolio: { playerId?: string; slug?: string; previewMode?: boolean };
  CareerReplay: undefined;
  Settings: undefined;
  PlayerDetail: { playerId: string };
  PlayerLogin: undefined;
  PlayerRegister: undefined;
  PlayerForgotPassword: undefined;
};

export type ScoutTabParamList = {
  Dashboard: undefined;
  Discover: undefined;
  Pipeline: undefined;
};

export type ScoutStackParamList = {
  ScoutTabs: NavigatorScreenParams<ScoutTabParamList>;
  PlayerDetail: { playerId: string };
  PlayerComparison: undefined;
  ActivityInbox: undefined;
  PublicPortfolio: { playerId?: string; slug?: string };
  Settings: undefined;
};

export type GuestStackParamList = {
  GuestMain: undefined;
  PlayerDetail: { playerId: string };
  PublicPortfolio: { playerId?: string; slug?: string };
  GuestRegister: undefined;
  GuestLogin: undefined;
  GuestForgotPassword: undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  PlayerApp: NavigatorScreenParams<PlayerStackParamList>;
  ScoutApp: NavigatorScreenParams<ScoutStackParamList>;
  GuestApp: NavigatorScreenParams<GuestStackParamList>;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
