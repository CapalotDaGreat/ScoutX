export type PreferredFoot = 'left' | 'right' | 'both';

export type ContractStatus =
  | 'under_contract'
  | 'expiring'
  | 'free_agent'
  | 'youth_contract';

export type PlayerAvailabilityStatus =
  | 'available'
  | 'unavailable'
  | 'on_loan'
  | 'injured';

export type TransferStatus =
  | 'not_for_sale'
  | 'open_to_offers'
  | 'listed'
  | 'loan_listed';

export type AcademicStatus =
  | 'in_school'
  | 'graduated'
  | 'university'
  | 'not_applicable';

export type CareerTimelineEntryType =
  | 'club'
  | 'achievement'
  | 'transfer'
  | 'education';

export type ClubHistoryEntry = {
  club: string;
  period: string;
  league?: string;
  appearances?: number;
};

export type CareerTimelineEntry = {
  id: string;
  type: CareerTimelineEntryType;
  title: string;
  organization: string;
  period: string;
  description?: string;
};

export type FootballIdentity = {
  currentClub: string;
  clubHistory: ClubHistoryEntry[];
  careerTimeline: CareerTimelineEntry[];
  preferredPositions: string[];
  secondaryPositions: string[];
  preferredFormation: string;
  strongFoot: PreferredFoot;
  weakFootRating: number;
  skillMovesRating: number;
  hasCaptainExperience: boolean;
  jerseyNumber: number | null;
  languagesSpoken: string[];
  academicStatus: AcademicStatus;
  contractStatus: ContractStatus;
  availability: PlayerAvailabilityStatus;
  preferredCountries: string[];
  preferredLeagues: string[];
  preferredPlayingStyle: string;
  transferStatus: TransferStatus;
  biographyHeadline: string;
};

export const defaultFootballIdentity: FootballIdentity = {
  currentClub: 'Free Agent',
  clubHistory: [],
  careerTimeline: [],
  preferredPositions: [],
  secondaryPositions: [],
  preferredFormation: '',
  strongFoot: 'right',
  weakFootRating: 3,
  skillMovesRating: 3,
  hasCaptainExperience: false,
  jerseyNumber: null,
  languagesSpoken: [],
  academicStatus: 'not_applicable',
  contractStatus: 'free_agent',
  availability: 'available',
  preferredCountries: [],
  preferredLeagues: [],
  preferredPlayingStyle: '',
  transferStatus: 'open_to_offers',
  biographyHeadline: '',
};
