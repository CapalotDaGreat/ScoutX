import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  RoleSelection: undefined;
};

export type PlayerTabParamList = {
  Profile: undefined;
  Feed: undefined;
  Statistics: undefined;
  Gps: undefined;
  Trials: undefined;
};

export type PlayerStackParamList = {
  PlayerTabs: NavigatorScreenParams<PlayerTabParamList>;
  PublicPortfolio: { playerId: string; previewMode?: boolean };
};

export type ScoutTabParamList = {
  Dashboard: undefined;
  Discover: undefined;
  Feed: undefined;
  Compare: undefined;
  Pipeline: undefined;
};

export type ScoutStackParamList = {
  ScoutTabs: NavigatorScreenParams<ScoutTabParamList>;
  PlayerDetail: { playerId: string };
  ActivityInbox: undefined;
  PublicPortfolio: { playerId: string };
};

export type GuestStackParamList = {
  GuestMain: undefined;
  PlayerDetail: { playerId: string };
  PublicPortfolio: { playerId: string };
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
