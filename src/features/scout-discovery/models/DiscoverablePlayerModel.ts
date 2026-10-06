import { type PlayerProfile } from '@/features/player-profile/types';
import {
  type DiscoverablePlayer,
  type DiscoveryCoverage,
  type DiscoveryMetric,
  type DiscoveryRatingSource,
  type FormResult,
  type PlayerAvailability,
  type PlayerPosition,
  type PreferredFoot,
  type RadarStat,
} from '@/features/scout-discovery/types';
import { calculatePlayerStatistics } from '@/features/player-statistics/services/statisticsCalculator';

const POSITION_ALIASES: Record<string, PlayerPosition> = {
  gk: 'GK',
  goalkeeper: 'GK',
  cb: 'CB',
  'centre back': 'CB',
  'center back': 'CB',
  lb: 'LB',
  'left back': 'LB',
  rb: 'RB',
  'right back': 'RB',
  cdm: 'CDM',
  'defensive midfielder': 'CDM',
  cm: 'CM',
  midfielder: 'CM',
  'central midfielder': 'CM',
  cam: 'CAM',
  'attacking midfielder': 'CAM',
  lw: 'LW',
  'left winger': 'LW',
  rw: 'RW',
  'right winger': 'RW',
  st: 'ST',
  striker: 'ST',
  cf: 'CF',
  'centre forward': 'CF',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseHeightCm(height: string): number | null {
  const match = height.match(/(\d{2,3})/);
  return match ? Number(match[1]) : null;
}

function parseWeightKg(weight: string): number | null {
  const match = weight.match(/(\d{2,3})/);
  return match ? Number(match[1]) : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseRatingSource(value: unknown): DiscoveryRatingSource | null {
  return value === 'match_derived' ||
    value === 'coach_provided' ||
    value === 'club_provided' ||
    value === 'ai_derived'
    ? value
    : null;
}

/** Self-reported 1–5 star ratings; anything outside that range is treated as unset. */
function parseStarRating(value: unknown): number | null {
  return typeof value === 'number' && value >= 1 && value <= 5 ? value : null;
}

function mapPosition(value: string): PlayerPosition | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (POSITION_ALIASES[normalized]) {
    return POSITION_ALIASES[normalized];
  }
  const upper = value.trim().toUpperCase();
  const valid: PlayerPosition[] = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST', 'CF'];
  return valid.includes(upper as PlayerPosition) ? (upper as PlayerPosition) : null;
}

function resolvePositions(profile: PlayerProfile): PlayerPosition[] {
  const candidates = [
    profile.position,
    ...profile.identity.preferredPositions,
    ...profile.identity.secondaryPositions,
  ];
  const mapped = candidates
    .map(mapPosition)
    .filter((position): position is PlayerPosition => position !== null);
  return [...new Set(mapped)];
}

function mapAvailability(value: string | null): PlayerAvailability | null {
  if (value === 'injured') return 'unavailable';
  if (value === 'available' || value === 'unavailable' || value === 'on_loan') return value;
  return null;
}

export const EMPTY_EVIDENCE_COVERAGE: DiscoveryCoverage = {
  technical: 'insufficient',
  tactical: 'insufficient',
  physical: 'insufficient',
  consistency: 'insufficient',
  video: 'insufficient',
};

function metric(value: number | null, sampleSize: number, provenance: DiscoveryMetric['provenance']): DiscoveryMetric {
  return { value, sampleSize, provenance };
}

const COVERAGE_STATES = ['strong', 'moderate', 'limited', 'insufficient'] as const;

function parseCoverage(value: unknown): DiscoveryCoverage {
  const record = asRecord(value);
  const state = (raw: unknown): DiscoveryCoverage['technical'] =>
    typeof raw === 'string' && (COVERAGE_STATES as readonly string[]).includes(raw)
      ? (raw as DiscoveryCoverage['technical'])
      : 'insufficient';
  return {
    technical: state(record?.technical),
    tactical: state(record?.tactical),
    physical: state(record?.physical),
    consistency: state(record?.consistency),
    video: state(record?.video),
  };
}

function parseMetric(value: unknown, fallback: DiscoveryMetric): DiscoveryMetric {
  const record = asRecord(value);
  if (!record) {
    return fallback;
  }
  return {
    value: nullableNumber(record.value),
    sampleSize: typeof record.sampleSize === 'number' ? record.sampleSize : fallback.sampleSize,
    provenance:
      record.provenance === 'match_derived' ||
      record.provenance === 'self_reported' ||
      record.provenance === 'coach_provided' ||
      record.provenance === 'club_provided' ||
      record.provenance === 'ai_derived' ||
      record.provenance === 'gps_derived'
        ? record.provenance
        : fallback.provenance,
  };
}

function parseMetrics(
  value: unknown,
  recorded: { goals: number; assists: number; matchCount: number; hasVideos: boolean },
): DiscoverablePlayer['metrics'] {
  const record = asRecord(value);
  return {
    goals: parseMetric(record?.goals, metric(recorded.goals, recorded.matchCount, recorded.matchCount > 0 ? 'match_derived' : null)),
    assists: parseMetric(record?.assists, metric(recorded.assists, recorded.matchCount, recorded.matchCount > 0 ? 'match_derived' : null)),
    matchCount: parseMetric(record?.matchCount, metric(recorded.matchCount, recorded.matchCount, recorded.matchCount > 0 ? 'match_derived' : null)),
    videoCount: parseMetric(record?.videoCount, metric(recorded.hasVideos ? 1 : 0, recorded.hasVideos ? 1 : 0, recorded.hasVideos ? 'self_reported' : null)),
  };
}

function buildSearchKeywords(profile: DiscoverablePlayer): string[] {
  const keywords = [
    profile.fullName.toLowerCase(),
    profile.club.toLowerCase(),
    profile.nationality.toLowerCase(),
    profile.league.toLowerCase(),
    ...profile.position.map((p) => p.toLowerCase()),
  ];
  if (profile.username) {
    keywords.push(profile.username.toLowerCase());
  }
  return keywords;
}

export function buildDiscoverablePlayerFromProfile(profile: PlayerProfile): DiscoverablePlayer {
  const matches = profile.statisticsMatches ?? [];
  const totals = calculatePlayerStatistics(matches).totals;
  const goals = totals.find((item) => item.key === 'goals')?.value ?? 0;
  const assists = totals.find((item) => item.key === 'assists')?.value ?? 0;
  const positions = resolvePositions(profile);
  const hasVideos = (profile.highlightVideos?.videos.length ?? 0) > 0;
  const league =
    profile.identity.clubHistory[0]?.league ??
    '';

  const player: DiscoverablePlayer = {
    id: profile.id,
    fullName: profile.fullName,
    // The profile has no birth date field; age stays unknown instead of being guessed.
    age: null,
    nationality: profile.nationality,
    club: profile.club || profile.identity.currentClub,
    league,
    position: positions,
    primaryPosition: positions[0] ?? null,
    secondaryPositions: positions.slice(1),
    roleDescriptors: [],
    styleTags: profile.identity.preferredPlayingStyle
      ? [profile.identity.preferredPlayingStyle]
      : [],
    preferredFoot: profile.identity.strongFoot,
    heightCm: parseHeightCm(profile.height),
    weightKg: parseWeightKg(profile.weight),
    avatarUrl: profile.avatarUrl,
    coverImageUrl: profile.coverImageUrl,
    biography: profile.biography || profile.identity.biographyHeadline,
    // Mixed 0–100 grades are not a ScoutX product signal. Leave unknown.
    overallRating: null,
    overallRatingSource: null,
    potentialRating: null,
    potentialRatingSource: null,
    availability: mapAvailability(profile.identity.availability),
    // Verification is asserted server-side (trust sync); a public portfolio is not verification.
    verified: false,
    verificationLevel: 'none',
    weakFoot: parseStarRating(profile.identity.weakFootRating),
    skillMoves: parseStarRating(profile.identity.skillMovesRating),
    matchCount: matches.length,
    analysisSampleCount: 0,
    recentlyActive: matches.some((match) => {
      const days = (Date.now() - new Date(match.date).getTime()) / (1000 * 60 * 60 * 24);
      return days <= 30;
    }),
    hasHighlightVideos: hasVideos,
    updatedAt: new Date().toISOString(),
    lastEvidenceAt: matches
      .map((match) => match.date)
      .filter((date) => typeof date === 'string')
      .sort()
      .at(-1) ?? null,
    lastAnalyzedAt: null,
    viewCount: 0,
    goals: typeof goals === 'number' ? goals : 0,
    assists: typeof assists === 'number' ? assists : 0,
    // Sprint speed only comes from GPS sessions, which are not part of the profile.
    sprintSpeedKmh: null,
    // Attribute ratings require an explicit source (coach/club/analysis); none exists here.
    ratings: {
      passing: null,
      shooting: null,
      defending: null,
      physical: null,
    },
    form: matches.slice(-5).map((match): FormResult => {
      if (match.result.startsWith('W')) return 'W';
      if (match.result.startsWith('D')) return 'D';
      return 'L';
    }),
    radarStats: [],
    evidenceCoverage: {
      ...EMPTY_EVIDENCE_COVERAGE,
      video: hasVideos ? 'limited' : 'insufficient',
      consistency: matches.length >= 5 ? 'moderate' : matches.length > 0 ? 'limited' : 'insufficient',
    },
    metrics: {
      goals: metric(typeof goals === 'number' ? goals : null, matches.length, matches.length > 0 ? 'match_derived' : null),
      assists: metric(typeof assists === 'number' ? assists : null, matches.length, matches.length > 0 ? 'match_derived' : null),
      matchCount: metric(matches.length, matches.length, matches.length > 0 ? 'match_derived' : null),
      videoCount: metric(hasVideos ? (profile.highlightVideos?.videos.length ?? 0) : 0, hasVideos ? 1 : 0, hasVideos ? 'self_reported' : null),
    },
    distanceKm: null,
    clubHistory: profile.identity.clubHistory.map((entry) => ({
      club: entry.club,
      period: entry.period,
      yearsAtClub: entry.yearsAtClub,
    })),
    achievements: profile.identity.careerTimeline
      .filter((entry) => entry.type === 'achievement')
      .map((entry) => entry.title),
    searchKeywords: [],
    ...(profile.username ? { username: profile.username } : {}),
  };

  player.searchKeywords = buildSearchKeywords(player);
  return player;
}

export function parseDiscoverablePlayer(value: unknown): DiscoverablePlayer | null {
  const record = asRecord(value);
  if (!record || typeof record.id !== 'string' || typeof record.fullName !== 'string') {
    return null;
  }

  const positionRaw = Array.isArray(record.position) ? record.position : [];
  const position = positionRaw.filter(
    (item): item is PlayerPosition =>
      typeof item === 'string' &&
      ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST', 'CF'].includes(item),
  );

  const ratingsRecord = asRecord(record.ratings) ?? {};
  const radarRaw = Array.isArray(record.radarStats) ? record.radarStats : [];

  const player: DiscoverablePlayer = {
    id: record.id,
    fullName: record.fullName,
    age: nullableNumber(record.age),
    nationality: typeof record.nationality === 'string' ? record.nationality : '',
    club: typeof record.club === 'string' && record.club !== 'Free Agent' ? record.club : '',
    league: typeof record.league === 'string' && record.league !== 'Amateur' ? record.league : '',
    position,
    primaryPosition:
      record.primaryPosition === 'GK' ||
      record.primaryPosition === 'CB' ||
      record.primaryPosition === 'LB' ||
      record.primaryPosition === 'RB' ||
      record.primaryPosition === 'CDM' ||
      record.primaryPosition === 'CM' ||
      record.primaryPosition === 'CAM' ||
      record.primaryPosition === 'LW' ||
      record.primaryPosition === 'RW' ||
      record.primaryPosition === 'ST' ||
      record.primaryPosition === 'CF'
        ? record.primaryPosition
        : (position[0] ?? null),
    secondaryPositions: Array.isArray(record.secondaryPositions)
      ? record.secondaryPositions.filter(
          (item): item is PlayerPosition =>
            typeof item === 'string' &&
            ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST', 'CF'].includes(item),
        )
      : position.slice(1),
    roleDescriptors: [],
    styleTags: Array.isArray(record.styleTags)
      ? record.styleTags.filter((item): item is string => typeof item === 'string')
      : [],
    preferredFoot:
      record.preferredFoot === 'left' || record.preferredFoot === 'right' || record.preferredFoot === 'both'
        ? record.preferredFoot
        : null,
    heightCm: nullableNumber(record.heightCm),
    weightKg: nullableNumber(record.weightKg),
    avatarUrl: typeof record.avatarUrl === 'string' ? record.avatarUrl : '',
    coverImageUrl: typeof record.coverImageUrl === 'string' ? record.coverImageUrl : '',
    biography: typeof record.biography === 'string' ? record.biography : '',
    overallRating: nullableNumber(record.overallRating),
    overallRatingSource:
      nullableNumber(record.overallRating) === null
        ? null
        : parseRatingSource(record.overallRatingSource),
    potentialRating: nullableNumber(record.potentialRating),
    potentialRatingSource:
      nullableNumber(record.potentialRating) === null
        ? null
        : parseRatingSource(record.potentialRatingSource),
    availability:
      record.availability === 'available' ||
      record.availability === 'unavailable' ||
      record.availability === 'on_loan'
        ? record.availability
        : null,
    verified: record.verified === true,
    verificationLevel:
      record.verificationLevel === 'verified' || record.verificationLevel === 'basic'
        ? record.verificationLevel
        : record.verified === true
          ? 'verified'
          : 'none',
    weakFoot: parseStarRating(record.weakFoot),
    skillMoves: parseStarRating(record.skillMoves),
    matchCount: typeof record.matchCount === 'number' ? record.matchCount : 0,
    analysisSampleCount:
      typeof record.analysisSampleCount === 'number' ? record.analysisSampleCount : 0,
    recentlyActive: record.recentlyActive === true,
    hasHighlightVideos: record.hasHighlightVideos === true,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
    lastEvidenceAt: typeof record.lastEvidenceAt === 'string' ? record.lastEvidenceAt : null,
    lastAnalyzedAt: typeof record.lastAnalyzedAt === 'string' ? record.lastAnalyzedAt : null,
    viewCount: typeof record.viewCount === 'number' ? record.viewCount : 0,
    goals: typeof record.goals === 'number' ? record.goals : 0,
    assists: typeof record.assists === 'number' ? record.assists : 0,
    sprintSpeedKmh: nullableNumber(record.sprintSpeedKmh),
    ratings: {
      passing: nullableNumber(ratingsRecord.passing),
      shooting: nullableNumber(ratingsRecord.shooting),
      defending: nullableNumber(ratingsRecord.defending),
      physical: nullableNumber(ratingsRecord.physical),
    },
    form: Array.isArray(record.form)
      ? record.form.filter((item): item is FormResult => item === 'W' || item === 'D' || item === 'L')
      : [],
    radarStats: radarRaw
      .map((item) => {
        const stat = asRecord(item);
        if (!stat || typeof stat.label !== 'string' || typeof stat.value !== 'number') {
          return null;
        }
        return { label: stat.label, value: stat.value };
      })
      .filter((item): item is RadarStat => item !== null),
    evidenceCoverage: parseCoverage(record.evidenceCoverage),
    metrics: parseMetrics(record.metrics, {
      goals: typeof record.goals === 'number' ? record.goals : 0,
      assists: typeof record.assists === 'number' ? record.assists : 0,
      matchCount: typeof record.matchCount === 'number' ? record.matchCount : 0,
      hasVideos: record.hasHighlightVideos === true,
    }),
    distanceKm: typeof record.distanceKm === 'number' ? record.distanceKm : null,
    clubHistory: Array.isArray(record.clubHistory)
      ? record.clubHistory.flatMap((item) => {
          const entry = asRecord(item);
          if (!entry || typeof entry.club !== 'string' || typeof entry.period !== 'string') {
            return [];
          }
          return [
            {
              club: entry.club,
              period: entry.period,
              ...(typeof entry.yearsAtClub === 'number' ? { yearsAtClub: entry.yearsAtClub } : {}),
            },
          ];
        })
      : [],
    achievements: Array.isArray(record.achievements)
      ? record.achievements.filter((item): item is string => typeof item === 'string')
      : [],
    searchKeywords: Array.isArray(record.searchKeywords)
      ? record.searchKeywords.filter((item): item is string => typeof item === 'string')
      : [],
    username: typeof record.username === 'string' ? record.username : undefined,
  };

  if (player.searchKeywords.length === 0) {
    player.searchKeywords = buildSearchKeywords(player);
  }

  return player;
}

export function serializeDiscoverablePlayer(player: DiscoverablePlayer): Record<string, unknown> {
  return { ...player };
}

/** Formats a nullable rating for display; unknown values render as an em dash. */
export function formatRating(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(Math.round(value)) : '—';
}

/** Joins the parts of a meta line, skipping unknown values instead of printing them. */
export function joinKnown(parts: ReadonlyArray<string | number | null | undefined>): string {
  return parts
    .filter((part): part is string | number => part !== null && part !== undefined && part !== '')
    .map(String)
    .join(' · ');
}
