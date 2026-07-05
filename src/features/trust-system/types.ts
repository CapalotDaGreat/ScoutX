export type TrustEntityType = 'player' | 'scout' | 'club';

export type TrustRecommendationType = 'coach_recommendation' | 'scout_endorsement';

export type TrustAuthorRole = 'coach' | 'scout';

export type TrustVerificationStatus = {
  verified: boolean;
  verifiedAt: string | null;
};

export type TrustProfile = {
  playerId: string;
  player: TrustVerificationStatus;
  scout: TrustVerificationStatus;
  club: TrustVerificationStatus & {
    clubId: string | null;
    clubName: string | null;
  };
  updatedAt: string;
};

export type TrustRecommendation = {
  id: string;
  playerId: string;
  authorId: string;
  authorName: string;
  authorRole: TrustAuthorRole;
  authorTitle: string;
  authorOrganization: string;
  authorAvatarUrl: string;
  type: TrustRecommendationType;
  category: string | null;
  relationship: string;
  headline: string;
  body: string;
  skills: string[];
  yearsKnown: number | null;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TrustRecommendationDraft = {
  type: TrustRecommendationType;
  category?: string | null;
  relationship: string;
  headline: string;
  body: string;
  skills: string[];
  yearsKnown?: number | null;
  featured?: boolean;
  authorTitle: string;
  authorOrganization: string;
};

export type ClubTenure = {
  club: string;
  years: number;
  period: string;
  isCurrent: boolean;
  league?: string;
};

export type PlayerTrustSnapshot = {
  profile: TrustProfile;
  recommendations: TrustRecommendation[];
  clubTenures: ClubTenure[];
};
