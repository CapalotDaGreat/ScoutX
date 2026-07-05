import { type PlayerProfile } from '@/features/player-profile/types';
import {
  type DiscoverablePlayer,
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

function parseHeightCm(height: string): number {
  const match = height.match(/(\d{2,3})/);
  return match ? Number(match[1]) : 0;
}

function parseWeightKg(weight: string): number {
  const match = weight.match(/(\d{2,3})/);
  return match ? Number(match[1]) : 0;
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
  return mapped.length > 0 ? [...new Set(mapped)] : ['CM'];
}

function resolveAge(profile: PlayerProfile, recordAge?: unknown): number {
  if (typeof recordAge === 'number' && recordAge > 0) {
    return recordAge;
  }
  if (typeof profile.identity.academicStatus === 'string') {
    if (profile.identity.academicStatus === 'in_school') {
      return 17;
    }
    if (profile.identity.academicStatus === 'university') {
      return 20;
    }
  }
  return 18;
}

function mapAvailability(value: string): PlayerAvailability {
  if (value === 'unavailable' || value === 'on_loan' || value === 'injured') {
    return value === 'injured' ? 'unavailable' : (value as PlayerAvailability);
  }
  return 'available';
}

function buildRadarStats(profile: PlayerProfile): RadarStat[] {
  const matches = profile.statisticsMatches ?? [];
  const overview = calculatePlayerStatistics(matches);
  const pick = (key: string, label: string, fallback: number): RadarStat => {
    const metric = overview.totals.find((item) => item.key === key);
    const raw = metric?.value ?? fallback;
    return { label, value: Math.min(1, Math.max(0, raw / 100)) };
  };

  return [
    pick('minutes', 'PAC', 0.5),
    pick('goals', 'SHO', 0.4),
    pick('passAccuracy', 'PAS', 0.5),
    pick('assists', 'DRI', 0.45),
    pick('tackles', 'DEF', 0.4),
    pick('minutes', 'PHY', 0.5),
  ];
}

function computeOverallRating(profile: PlayerProfile): number {
  const matches = profile.statisticsMatches ?? [];
  if (matches.length === 0) {
    return 55;
  }
  const avgRating = matches.reduce((sum, match) => sum + match.matchRating, 0) / matches.length;
  return Math.min(99, Math.max(40, Math.round(avgRating * 10)));
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
    age: resolveAge(profile),
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
    potentialRating: Math.min(99, overallRating + 8),
    availability: mapAvailability(profile.identity.availability),
    verified: profile.privacy?.publicPortfolioEnabled ?? false,
    weakFoot: profile.identity.weakFootRating,
    skillMoves: profile.identity.skillMovesRating,
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
    sprintSpeedKmh: 0,
    ratings: {
      passing: Math.min(99, overallRating + 2),
      shooting: Math.min(99, overallRating),
      defending: Math.min(99, overallRating - 4),
      physical: Math.min(99, overallRating - 2),
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
    age: typeof record.age === 'number' ? record.age : 18,
    nationality: typeof record.nationality === 'string' ? record.nationality : 'Unknown',
    club: typeof record.club === 'string' ? record.club : 'Free Agent',
    league: typeof record.league === 'string' ? record.league : 'Amateur',
    position: position.length > 0 ? position : ['CM'],
    preferredFoot:
      record.preferredFoot === 'left' || record.preferredFoot === 'right' || record.preferredFoot === 'both'
        ? record.preferredFoot
        : 'right',
    heightCm: typeof record.heightCm === 'number' ? record.heightCm : 0,
    weightKg: typeof record.weightKg === 'number' ? record.weightKg : 0,
    avatarUrl: typeof record.avatarUrl === 'string' ? record.avatarUrl : '',
    coverImageUrl: typeof record.coverImageUrl === 'string' ? record.coverImageUrl : '',
    biography: typeof record.biography === 'string' ? record.biography : '',
    overallRating: typeof record.overallRating === 'number' ? record.overallRating : 50,
    potentialRating: typeof record.potentialRating === 'number' ? record.potentialRating : 60,
    availability:
      record.availability === 'available' ||
      record.availability === 'unavailable' ||
      record.availability === 'on_loan'
        ? record.availability
        : 'available',
    verified: record.verified === true,
    weakFoot: typeof record.weakFoot === 'number' ? record.weakFoot : 3,
    skillMoves: typeof record.skillMoves === 'number' ? record.skillMoves : 3,
    matchCount: typeof record.matchCount === 'number' ? record.matchCount : 0,
    recentlyActive: record.recentlyActive === true,
    hasHighlightVideos: record.hasHighlightVideos === true,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
    viewCount: typeof record.viewCount === 'number' ? record.viewCount : 0,
    goals: typeof record.goals === 'number' ? record.goals : 0,
    assists: typeof record.assists === 'number' ? record.assists : 0,
    sprintSpeedKmh: typeof record.sprintSpeedKmh === 'number' ? record.sprintSpeedKmh : 0,
    ratings: {
      passing: typeof ratingsRecord.passing === 'number' ? ratingsRecord.passing : 50,
      shooting: typeof ratingsRecord.shooting === 'number' ? ratingsRecord.shooting : 50,
      defending: typeof ratingsRecord.defending === 'number' ? ratingsRecord.defending : 50,
      physical: typeof ratingsRecord.physical === 'number' ? ratingsRecord.physical : 50,
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
