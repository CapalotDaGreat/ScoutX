import { type PlayerProfile } from '@/features/player-profile/types';
import {
  type DiscoverablePlayer,
  type DiscoveryRatingSource,
  type FormResult,
  type PlayerAvailability,
  type PlayerPosition,
  type PreferredFoot,
  type RadarStat,
} from '@/features/scout-discovery/types';
import { calculatePlayerStatistics } from '@/features/player-statistics/services/statisticsCalculator';
import { averageOfRecorded } from '@/features/player-statistics/utils/recordedStats';

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

function mapAvailability(value: string): PlayerAvailability {
  if (value === 'unavailable' || value === 'on_loan' || value === 'injured') {
    return value === 'injured' ? 'unavailable' : (value as PlayerAvailability);
  }
  return 'available';
}

/**
 * Radar stats are only produced from values a player actually recorded. Each axis is a
 * per-match average normalised against an explicit, documented ceiling so axes are
 * comparable. Axes without recorded data are omitted rather than defaulted.
 */
const RADAR_AXES: ReadonlyArray<{
  key: 'goals' | 'assists' | 'shots' | 'tackles' | 'passAccuracy';
  label: string;
  perMatchCeiling: number;
}> = [
  { key: 'goals', label: 'Goals / match', perMatchCeiling: 2 },
  { key: 'assists', label: 'Assists / match', perMatchCeiling: 2 },
  { key: 'shots', label: 'Shots / match', perMatchCeiling: 6 },
  { key: 'tackles', label: 'Tackles / match', perMatchCeiling: 8 },
  { key: 'passAccuracy', label: 'Pass accuracy', perMatchCeiling: 100 },
];

function buildRadarStats(profile: PlayerProfile): RadarStat[] {
  const matches = profile.statisticsMatches ?? [];
  if (matches.length === 0) {
    return [];
  }
  return RADAR_AXES.flatMap((axis) => {
    const values = matches
      .map((match) => match[axis.key])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (values.length === 0) {
      return [];
    }
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    return [{ label: axis.label, value: Math.min(1, Math.max(0, average / axis.perMatchCeiling)) }];
  });
}

/**
 * Overall rating is the mean of recorded match ratings (0–10) scaled to 0–100. There is no
 * baseline: a player without a single recorded match rating has no overall rating.
 */
function computeOverallRating(profile: PlayerProfile): number | null {
  const matches = profile.statisticsMatches ?? [];
  if (matches.length === 0) {
    return null;
  }
  const avgRating = averageOfRecorded(matches, 'matchRating');
  if (avgRating === null) {
    return null;
  }
  return Math.min(100, Math.max(0, Math.round(avgRating * 10)));
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
  const overallRating = computeOverallRating(profile);
  const hasVideos = (profile.highlightVideos?.videos.length ?? 0) > 0;
  const league =
    profile.identity.clubHistory[0]?.league ??
    profile.identity.preferredLeagues[0] ??
    'Amateur';

  const player: DiscoverablePlayer = {
    id: profile.id,
    fullName: profile.fullName,
    // The profile has no birth date field; age stays unknown instead of being guessed.
    age: null,
    nationality: profile.nationality || 'Unknown',
    club: profile.club || profile.identity.currentClub || 'Free Agent',
    league,
    position: positions,
    preferredFoot: profile.identity.strongFoot as PreferredFoot,
    heightCm: parseHeightCm(profile.height),
    weightKg: parseWeightKg(profile.weight),
    avatarUrl: profile.avatarUrl,
    coverImageUrl: profile.coverImageUrl,
    biography: profile.biography || profile.identity.biographyHeadline,
    overallRating,
    overallRatingSource: overallRating === null ? null : 'match_derived',
    // No potential model exists; never derive potential from overall.
    potentialRating: null,
    potentialRatingSource: null,
    availability: mapAvailability(profile.identity.availability),
    // Verification is asserted server-side (trust sync); a public portfolio is not verification.
    verified: false,
    weakFoot: parseStarRating(profile.identity.weakFootRating),
    skillMoves: parseStarRating(profile.identity.skillMovesRating),
    matchCount: matches.length,
    recentlyActive: matches.some((match) => {
      const days = (Date.now() - new Date(match.date).getTime()) / (1000 * 60 * 60 * 24);
      return days <= 30;
    }),
    hasHighlightVideos: hasVideos,
    updatedAt: new Date().toISOString(),
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
    radarStats: buildRadarStats(profile),
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
    nationality: typeof record.nationality === 'string' ? record.nationality : 'Unknown',
    club: typeof record.club === 'string' ? record.club : 'Free Agent',
    league: typeof record.league === 'string' ? record.league : 'Amateur',
    position,
    preferredFoot:
      record.preferredFoot === 'left' || record.preferredFoot === 'right' || record.preferredFoot === 'both'
        ? record.preferredFoot
        : 'right',
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
        : 'available',
    verified: record.verified === true,
    weakFoot: parseStarRating(record.weakFoot),
    skillMoves: parseStarRating(record.skillMoves),
    matchCount: typeof record.matchCount === 'number' ? record.matchCount : 0,
    recentlyActive: record.recentlyActive === true,
    hasHighlightVideos: record.hasHighlightVideos === true,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
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
