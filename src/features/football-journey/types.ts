export type JourneyEntryType =
  | 'academy'
  | 'club_transfer'
  | 'achievement'
  | 'league_title'
  | 'cup_win'
  | 'international_callup'
  | 'injury'
  | 'recovery'
  | 'trial'
  | 'professional_contract'
  | 'highlight_video'
  | 'coach_recommendation'
  | 'gps_session'
  | 'statistics_milestone';

export type JourneyMediaType = 'image' | 'video';

export type JourneyMedia = {
  type: JourneyMediaType;
  url: string;
  thumbnailUrl?: string;
  caption?: string;
};

export type JourneyEntrySource = 'manual' | 'system' | 'legacy';

export type JourneyEntry = {
  id: string;
  type: JourneyEntryType;
  title: string;
  subtitle?: string;
  organization?: string;
  description?: string;
  date: string;
  endDate?: string;
  media: JourneyMedia[];
  metadata?: Record<string, string | number | boolean>;
  source: JourneyEntrySource;
  createdAt: string;
  updatedAt: string;
};

export type JourneyYearGroup = {
  year: string;
  entries: JourneyEntry[];
};

export type FootballJourney = {
  entries: JourneyEntry[];
  updatedAt: string;
};

export const emptyFootballJourney = (): FootballJourney => ({
  entries: [],
  updatedAt: new Date().toISOString(),
});
