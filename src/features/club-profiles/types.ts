export type ClubProfile = {
  id: string;
  name: string;
  league: string;
  country: string;
  logoUrl: string;
  website: string;
  discoverablePlayerCount: number;
  updatedAt: string;
};

export type ClubProfileDraft = {
  name: string;
  league: string;
  country: string;
  logoUrl?: string;
  website?: string;
};
