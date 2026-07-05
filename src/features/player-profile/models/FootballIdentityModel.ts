import {
  type AcademicStatus,
  type CareerTimelineEntry,
  type CareerTimelineEntryType,
  type ClubHistoryEntry,
  type ContractStatus,
  type FootballIdentity,
  type PlayerAvailabilityStatus,
  type PreferredFoot,
  type TransferStatus,
  defaultFootballIdentity,
} from '@/features/player-profile/types/footballIdentity';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function parseClubHistory(value: unknown): ClubHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const entries: ClubHistoryEntry[] = [];

  for (const item of value) {
    const record = asRecord(item);
    if (!record || typeof record.club !== 'string' || typeof record.period !== 'string') {
      continue;
    }

    entries.push({
      club: record.club,
      period: record.period,
      league: typeof record.league === 'string' ? record.league : undefined,
      appearances: typeof record.appearances === 'number' ? record.appearances : undefined,
      yearsAtClub: typeof record.yearsAtClub === 'number' ? record.yearsAtClub : undefined,
    });
  }

  return entries;
}

function parseCareerTimeline(value: unknown): CareerTimelineEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const validTypes: CareerTimelineEntryType[] = ['club', 'achievement', 'transfer', 'education'];
  const entries: CareerTimelineEntry[] = [];

  for (const [index, item] of value.entries()) {
    const record = asRecord(item);
    if (!record || typeof record.title !== 'string') {
      continue;
    }

    const type = validTypes.includes(record.type as CareerTimelineEntryType)
      ? (record.type as CareerTimelineEntryType)
      : 'club';

    entries.push({
      id: typeof record.id === 'string' ? record.id : `timeline-${index}`,
      type,
      title: record.title,
      organization: typeof record.organization === 'string' ? record.organization : '',
      period: typeof record.period === 'string' ? record.period : '',
      description: typeof record.description === 'string' ? record.description : undefined,
    });
  }

  return entries;
}

function parsePreferredFoot(value: unknown, fallback: PreferredFoot): PreferredFoot {
  if (value === 'left' || value === 'right' || value === 'both') {
    return value;
  }
  const normalized = typeof value === 'string' ? value.toLowerCase() : '';
  if (normalized.includes('left') && normalized.includes('right')) {
    return 'both';
  }
  if (normalized.includes('left')) {
    return 'left';
  }
  if (normalized.includes('right')) {
    return 'right';
  }
  return fallback;
}

function clampRating(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(5, Math.max(1, Math.round(value)));
}

function parseEnumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

const contractStatuses: ContractStatus[] = [
  'under_contract',
  'expiring',
  'free_agent',
  'youth_contract',
];
const availabilityStatuses: PlayerAvailabilityStatus[] = [
  'available',
  'unavailable',
  'on_loan',
  'injured',
];
const transferStatuses: TransferStatus[] = [
  'not_for_sale',
  'open_to_offers',
  'listed',
  'loan_listed',
];
const academicStatuses: AcademicStatus[] = [
  'in_school',
  'graduated',
  'university',
  'not_applicable',
];

export type LegacyProfileFields = {
  club?: string;
  position?: string;
  preferredFoot?: string;
  biography?: string;
};

export function createDefaultFootballIdentity(
  legacy: LegacyProfileFields = {},
): FootballIdentity {
  const preferredPositions = legacy.position ? [legacy.position] : [];

  return {
    ...defaultFootballIdentity,
    currentClub: legacy.club ?? defaultFootballIdentity.currentClub,
    preferredPositions,
    strongFoot: parsePreferredFoot(legacy.preferredFoot, defaultFootballIdentity.strongFoot),
    biographyHeadline: '',
  };
}

export function parseFootballIdentity(
  data: unknown,
  legacy: LegacyProfileFields = {},
): FootballIdentity {
  const defaults = createDefaultFootballIdentity(legacy);
  const record = asRecord(data);
  if (!record) {
    return defaults;
  }

  const preferredPositions = parseStringArray(record.preferredPositions);
  const secondaryPositions = parseStringArray(record.secondaryPositions);

  return {
    currentClub:
      typeof record.currentClub === 'string' ? record.currentClub : defaults.currentClub,
    clubHistory: parseClubHistory(record.clubHistory),
    careerTimeline: parseCareerTimeline(record.careerTimeline),
    preferredPositions:
      preferredPositions.length > 0 ? preferredPositions : defaults.preferredPositions,
    secondaryPositions,
    preferredFormation:
      typeof record.preferredFormation === 'string' ? record.preferredFormation : '',
    strongFoot: parsePreferredFoot(record.strongFoot, defaults.strongFoot),
    weakFootRating: clampRating(record.weakFootRating, defaults.weakFootRating),
    skillMovesRating: clampRating(record.skillMovesRating, defaults.skillMovesRating),
    hasCaptainExperience:
      typeof record.hasCaptainExperience === 'boolean'
        ? record.hasCaptainExperience
        : defaults.hasCaptainExperience,
    jerseyNumber:
      typeof record.jerseyNumber === 'number' ? record.jerseyNumber : defaults.jerseyNumber,
    languagesSpoken: parseStringArray(record.languagesSpoken),
    academicStatus: parseEnumValue(
      record.academicStatus,
      academicStatuses,
      defaults.academicStatus,
    ),
    contractStatus: parseEnumValue(
      record.contractStatus,
      contractStatuses,
      defaults.contractStatus,
    ),
    availability: parseEnumValue(
      record.availability,
      availabilityStatuses,
      defaults.availability,
    ),
    preferredCountries: parseStringArray(record.preferredCountries),
    preferredLeagues: parseStringArray(record.preferredLeagues),
    preferredPlayingStyle:
      typeof record.preferredPlayingStyle === 'string'
        ? record.preferredPlayingStyle
        : '',
    transferStatus: parseEnumValue(
      record.transferStatus,
      transferStatuses,
      defaults.transferStatus,
    ),
    biographyHeadline:
      typeof record.biographyHeadline === 'string'
        ? record.biographyHeadline
        : defaults.biographyHeadline,
  };
}

export function serializeFootballIdentity(identity: FootballIdentity): Record<string, unknown> {
  return {
    currentClub: identity.currentClub,
    clubHistory: identity.clubHistory,
    careerTimeline: identity.careerTimeline,
    preferredPositions: identity.preferredPositions,
    secondaryPositions: identity.secondaryPositions,
    preferredFormation: identity.preferredFormation,
    strongFoot: identity.strongFoot,
    weakFootRating: identity.weakFootRating,
    skillMovesRating: identity.skillMovesRating,
    hasCaptainExperience: identity.hasCaptainExperience,
    jerseyNumber: identity.jerseyNumber,
    languagesSpoken: identity.languagesSpoken,
    academicStatus: identity.academicStatus,
    contractStatus: identity.contractStatus,
    availability: identity.availability,
    preferredCountries: identity.preferredCountries,
    preferredLeagues: identity.preferredLeagues,
    preferredPlayingStyle: identity.preferredPlayingStyle,
    transferStatus: identity.transferStatus,
    biographyHeadline: identity.biographyHeadline,
  };
}

export function syncLegacyProfileFields(
  identity: FootballIdentity,
  biography: string,
): {
  club: string;
  position: string;
  preferredFoot: string;
  biographyHeadline: string;
} {
  const primaryPosition = identity.preferredPositions[0] ?? 'Player';
  const footLabel =
    identity.strongFoot === 'both'
      ? 'Both'
      : identity.strongFoot === 'left'
        ? 'Left'
        : 'Right';

  return {
    club: identity.currentClub,
    position: primaryPosition,
    preferredFoot: footLabel,
    biographyHeadline: identity.biographyHeadline || biography.slice(0, 120),
  };
}

export function formatFootLabel(foot: PreferredFoot): string {
  if (foot === 'both') {
    return 'Both';
  }
  return foot === 'left' ? 'Left' : 'Right';
}
