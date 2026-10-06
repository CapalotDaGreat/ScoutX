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
  yearsAtClub?: number;
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
  /** null = the player has not stated it; never infer a foot. */
  strongFoot: PreferredFoot | null;
  weakFootRating: number | null;
  skillMovesRating: number | null;
  hasCaptainExperience: boolean;
  jerseyNumber: number | null;
  languagesSpoken: string[];
  academicStatus: AcademicStatus | null;
  contractStatus: ContractStatus | null;
  availability: PlayerAvailabilityStatus | null;
  preferredCountries: string[];
  preferredLeagues: string[];
  preferredPlayingStyle: string;
  transferStatus: TransferStatus | null;
  biographyHeadline: string;
};

export const defaultFootballIdentity: FootballIdentity = {
  currentClub: '',
  clubHistory: [],
  careerTimeline: [],
  preferredPositions: [],
  secondaryPositions: [],
  preferredFormation: '',
  strongFoot: null,
  weakFootRating: null,
  skillMovesRating: null,
  hasCaptainExperience: false,
  jerseyNumber: null,
  languagesSpoken: [],
  academicStatus: null,
  contractStatus: null,
  availability: null,
  preferredCountries: [],
  preferredLeagues: [],
  preferredPlayingStyle: '',
  transferStatus: null,
  biographyHeadline: '',
};

/**
 * Identity records created before Phase J were written with a fixed seed. When a stored
 * record still carries that exact combination, the values were never stated by the player.
 */
export function isLegacySeededIdentity(record: Record<string, unknown>): boolean {
  return (
    record.strongFoot === 'right' &&
    record.weakFootRating === 3 &&
    record.skillMovesRating === 3 &&
    record.availability === 'available' &&
    record.transferStatus === 'open_to_offers' &&
    record.contractStatus === 'free_agent' &&
    record.academicStatus === 'not_applicable'
  );
}

/** Returns a copy with the legacy seed removed, or the input unchanged. */
export function stripLegacyIdentitySeed(record: Record<string, unknown>): Record<string, unknown> {
  if (!isLegacySeededIdentity(record)) {
    return record;
  }
  return {
    ...record,
    strongFoot: null,
    weakFootRating: null,
    skillMovesRating: null,
    availability: null,
    transferStatus: null,
    contractStatus: null,
    academicStatus: null,
    currentClub: record.currentClub === 'Free Agent' ? '' : record.currentClub,
  };
}

/** Fields a player must explicitly provide; null/empty means "not stated". */
export function isIdentityFieldStated(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}
