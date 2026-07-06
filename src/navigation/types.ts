import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  RoleSelection: undefined;
};

export type PlayerTabParamList = {
  Portfolio: undefined;
  Career: undefined;
  Statistics: undefined;
  Gps: undefined;
  Trials: undefined;
};

export type PlayerStackParamList = {
  PlayerTabs: NavigatorScreenParams<PlayerTabParamList>;
  PublicPortfolio: { playerId?: string; slug?: string; previewMode?: boolean };
  CareerReplay: undefined;
  Settings: undefined;
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
