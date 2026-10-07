import { useMockData } from '@/config/appMode';
import { type PlayerProfile, type PlayerProfileStat, type PlayerProfilePerformanceItem } from '@/features/player-profile/types';
import { type PlayerMatchStatistics } from '@/features/player-statistics/types';
import { serializeMatchStatistics } from '@/features/player-statistics/models/MatchLogModel';
import { mockPlayerStatisticsMatches } from '@/features/player-statistics/services/mockPlayerStatisticsService';
import { mapMatchesToProfileStats } from '@/features/player-statistics/utils/profileStatsMapper';
import {
  createDefaultFootballIdentity,
  parseFootballIdentity,
  serializeFootballIdentity,
  syncLegacyProfileFields,
} from '@/features/player-profile/models/FootballIdentityModel';
import {
  parseFootballJourney,
  serializeFootballJourney,
} from '@/features/football-journey/models/JourneyModel';
import {
  parseHighlightVideoLibrary,
  serializeHighlightVideoLibrary,
} from '@/features/highlight-videos/models/HighlightVideoModel';
import { emptyHighlightVideoLibrary } from '@/features/highlight-videos/types';
import { defaultPrivacySettings } from '@/features/player-profile/types/privacySettings';
import {
  parsePrivacySettings,
  serializePrivacySettings,
} from '@/features/player-profile/models/PrivacySettingsModel';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseEarnedMilestones(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const milestones: NonNullable<PlayerProfile['earnedMilestones']> = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record || typeof record.id !== 'string' || typeof record.earnedAt !== 'string') {
      continue;
    }
    milestones.push({ id: record.id, earnedAt: record.earnedAt });
  }
  return milestones;
}

export function parsePlayerMatchStatistics(value: unknown): PlayerMatchStatistics[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const matches: PlayerMatchStatistics[] = [];

  for (const item of value) {
    const match = asRecord(item);
    if (!match) {
      continue;
    }

    matches.push({
      id: typeof match.id === 'string' ? match.id : `match-${matches.length + 1}`,
      date: typeof match.date === 'string' ? match.date : new Date().toISOString(),
      opponent: typeof match.opponent === 'string' ? match.opponent : 'Unknown opponent',
      competition: typeof match.competition === 'string' ? match.competition : 'Match',
      result: typeof match.result === 'string' ? match.result : 'N/A',
      ...(typeof match.position === 'string' && match.position ? { position: match.position } : {}),
      minutes: typeof match.minutes === 'number' ? match.minutes : 0,
      goals: typeof match.goals === 'number' ? match.goals : 0,
      assists: typeof match.assists === 'number' ? match.assists : 0,
      cleanSheet: typeof match.cleanSheet === 'boolean' ? match.cleanSheet : false,
      passAccuracy: typeof match.passAccuracy === 'number' ? match.passAccuracy : null,
      shots: typeof match.shots === 'number' ? match.shots : null,
      tackles: typeof match.tackles === 'number' ? match.tackles : null,
      yellowCards: typeof match.yellowCards === 'number' ? match.yellowCards : 0,
      redCards: typeof match.redCards === 'number' ? match.redCards : 0,
      matchRating: typeof match.matchRating === 'number' ? match.matchRating : null,
      notes: typeof match.notes === 'string' ? match.notes : '',
    });
  }

  return matches;
}

export class ProfileModel {
  public static getDefaultProfile(userId: string, email: string): PlayerProfile {
    const fullName = email.split('@')[0] || 'New Player';
    const identity = createDefaultFootballIdentity();

    return {
      id: userId,
      fullName,
      position: identity.preferredPositions[0] ?? '',
      club: identity.currentClub,
      nationality: '',
      preferredFoot: '',
      height: '',
      weight: '',
      biography: '',
      coverImageUrl: '',
      avatarUrl: '',
      stats: mapMatchesToProfileStats([]),
      performanceSummary: [],
      statisticsMatches: [],
      identity,
      footballJourney: {
        entries: [],
        updatedAt: new Date().toISOString(),
      },
      highlightVideos: emptyHighlightVideoLibrary(),
      privacy: defaultPrivacySettings(),
      username: undefined,
      hiddenEndorsementIds: [],
      featuredMediaIds: [],
    };
  }

  public static fromFirestore(id: string, data: Record<string, unknown>): PlayerProfile {
    const stats: PlayerProfileStat[] = [];
    if (Array.isArray(data.stats)) {
      for (const s of data.stats) {
        const stat = asRecord(s);
        if (stat) {
          const trend = asRecord(stat.trend) ?? {};
          stats.push({
            label: typeof stat.label === 'string' ? stat.label : '',
            value: typeof stat.value === 'string' ? stat.value : '',
            trend: {
              value: typeof trend.value === 'string' ? trend.value : '',
              direction:
                trend.direction === 'up' || trend.direction === 'down' || trend.direction === 'neutral'
                  ? trend.direction
                  : 'neutral',
            },
          });
        }
      }
    }

    const performanceSummary: PlayerProfilePerformanceItem[] = [];
    if (Array.isArray(data.performanceSummary)) {
      for (const p of data.performanceSummary) {
        const performanceItem = asRecord(p);
        if (performanceItem) {
          performanceSummary.push({
            label: typeof performanceItem.label === 'string' ? performanceItem.label : '',
            value: typeof performanceItem.value === 'number' ? performanceItem.value : 0,
            max: typeof performanceItem.max === 'number' ? performanceItem.max : 10,
            hint: typeof performanceItem.hint === 'string' ? performanceItem.hint : '',
          });
        }
      }
    }

    const parsedMatches = parsePlayerMatchStatistics(data.statisticsMatches);
    const statisticsMatches =
      parsedMatches.length > 0 ? parsedMatches : useMockData() ? mockPlayerStatisticsMatches : [];

    const legacyFields = {
      club: typeof data.club === 'string' ? data.club : '',
      position: typeof data.position === 'string' ? data.position : '',
      preferredFoot: typeof data.preferredFoot === 'string' ? data.preferredFoot : '',
      biography: typeof data.biography === 'string' ? data.biography : '',
    };

    const identity = parseFootballIdentity(data.identity, legacyFields);
    const synced = syncLegacyProfileFields(
      identity,
      typeof data.biography === 'string' ? data.biography : '',
    );

    return {
      id,
      fullName: typeof data.fullName === 'string' ? data.fullName : '',
      position: synced.position,
      club: synced.club,
      nationality: typeof data.nationality === 'string' ? data.nationality : '',
      preferredFoot: synced.preferredFoot,
      height: typeof data.height === 'string' ? data.height : '',
      weight: typeof data.weight === 'string' ? data.weight : '',
      biography: legacyFields.biography,
      coverImageUrl: typeof data.coverImageUrl === 'string' ? data.coverImageUrl : '',
      avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : '',
      stats:
        stats.length > 0
          ? stats
          : mapMatchesToProfileStats(statisticsMatches),
      performanceSummary,
      statisticsMatches,
      identity,
      footballJourney: parseFootballJourney(data.footballJourney),
      highlightVideos: parseHighlightVideoLibrary(data.highlightVideos),
      privacy: parsePrivacySettings(data.privacy),
      username: typeof data.username === 'string' ? data.username : undefined,
      hiddenEndorsementIds: Array.isArray(data.hiddenEndorsementIds)
        ? data.hiddenEndorsementIds.filter((item): item is string => typeof item === 'string')
        : [],
      earnedMilestones: parseEarnedMilestones(data.earnedMilestones),
      featuredMediaIds: Array.isArray(data.featuredMediaIds)
        ? data.featuredMediaIds.filter((item): item is string => typeof item === 'string')
        : [],
    };
  }

  public static toFirestore(profile: Partial<PlayerProfile>): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    if (profile.fullName !== undefined) data.fullName = profile.fullName;
    if (profile.position !== undefined) data.position = profile.position;
    if (profile.club !== undefined) data.club = profile.club;
    if (profile.nationality !== undefined) data.nationality = profile.nationality;
    if (profile.preferredFoot !== undefined) data.preferredFoot = profile.preferredFoot;
    if (profile.height !== undefined) data.height = profile.height;
    if (profile.weight !== undefined) data.weight = profile.weight;
    if (profile.biography !== undefined) data.biography = profile.biography;
    if (profile.coverImageUrl !== undefined) data.coverImageUrl = profile.coverImageUrl;
    if (profile.avatarUrl !== undefined) data.avatarUrl = profile.avatarUrl;

    if (profile.identity !== undefined) {
      data.identity = serializeFootballIdentity(profile.identity);
      const synced = syncLegacyProfileFields(
        profile.identity,
        profile.biography ?? '',
      );
      data.club = synced.club;
      data.position = synced.position;
      data.preferredFoot = synced.preferredFoot;
    }
    if (profile.stats !== undefined) {
      data.stats = profile.stats.map((s) => ({
        label: s.label,
        value: s.value,
        trend: {
          value: s.trend.value,
          direction: s.trend.direction,
        },
      }));
    }
    if (profile.performanceSummary !== undefined) {
      data.performanceSummary = profile.performanceSummary.map((p) => ({
        label: p.label,
        value: p.value,
        max: p.max,
        hint: p.hint,
      }));
    }
    if (profile.statisticsMatches !== undefined) {
      data.statisticsMatches = profile.statisticsMatches.map(serializeMatchStatistics);
    }
    if (profile.footballJourney !== undefined) {
      data.footballJourney = serializeFootballJourney(profile.footballJourney);
    }
    if (profile.highlightVideos !== undefined) {
      data.highlightVideos = serializeHighlightVideoLibrary(profile.highlightVideos);
    }
    if (profile.privacy !== undefined) {
      data.privacy = serializePrivacySettings(profile.privacy);
    }
    if (profile.username !== undefined) {
      data.username = profile.username;
    }
    if (profile.hiddenEndorsementIds !== undefined) {
      data.hiddenEndorsementIds = profile.hiddenEndorsementIds;
    }
    if (profile.earnedMilestones !== undefined) {
      data.earnedMilestones = profile.earnedMilestones.map((item) => ({
        id: item.id,
        earnedAt: item.earnedAt,
      }));
    }
    if (profile.featuredMediaIds !== undefined) {
      data.featuredMediaIds = profile.featuredMediaIds;
    }

    return data;
  }
}
