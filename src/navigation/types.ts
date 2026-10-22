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

/** Player tabs: Home | Growth | Media | Discover */
export type PlayerTabParamList = {
  Home: undefined;
  Performance: { segment?: 'development' | 'stats' | 'career'; reflectMatchId?: string } | undefined;
  Media: { reelId?: string } | undefined;
  Discover: undefined;
};

export type PlayerStackParamList = {
  PlayerTabs: NavigatorScreenParams<PlayerTabParamList>;
  PublicPortfolio: { playerId?: string; slug?: string; previewMode?: boolean };
  CareerReplay: undefined;
  Settings: undefined;
  PrivacyCenter: undefined;
  PlanUsage: undefined;
  /** Player trial invitations inbox (stack, not a tab). */
  Trials: { trialId?: string } | undefined;
  RequestCenter: { requestId?: string } | undefined;
  PlayerDetail: { playerId: string; evidenceId?: string };
  AnalysisReport: { jobId: string };
  GlobalSearch: undefined;
  PlayerLogin: undefined;
  PlayerRegister: undefined;
  PlayerForgotPassword: undefined;
};

/** Scout tabs: Home | Discover | Pipeline | Trials */
export type ScoutTabParamList = {
  Dashboard: undefined;
  Discover: undefined;
  Pipeline: undefined;
  Trials: { trialId?: string } | undefined;
};

export type ScoutStackParamList = {
  ScoutTabs: NavigatorScreenParams<ScoutTabParamList>;
  PlayerDetail: { playerId: string; evidenceId?: string };
  PlayerComparison: undefined;
  ActivityInbox: undefined;
  PublicPortfolio: { playerId?: string; slug?: string };
  Settings: undefined;
  PrivacyCenter: undefined;
  GlobalSearch: undefined;
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
  LinkUnavailable: { reason?: string } | undefined;
  GuardianLink: { token: string };
  ReportLink: { ownerId: string; mediaId: string };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
