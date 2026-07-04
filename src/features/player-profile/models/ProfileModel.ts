import { type PlayerProfile, type PlayerProfileStat, type PlayerProfilePerformanceItem } from '@/features/player-profile/types';
import { type PlayerMatchStatistics } from '@/features/player-statistics/types';
import { serializeMatchStatistics } from '@/features/player-statistics/models/MatchLogModel';
import { mockPlayerStatisticsMatches } from '@/features/player-statistics/services/mockPlayerStatisticsService';
import { mapMatchesToProfileStats } from '@/features/player-statistics/utils/profileStatsMapper';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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
      minutes: typeof match.minutes === 'number' ? match.minutes : 0,
      goals: typeof match.goals === 'number' ? match.goals : 0,
      assists: typeof match.assists === 'number' ? match.assists : 0,
      cleanSheet: typeof match.cleanSheet === 'boolean' ? match.cleanSheet : false,
      passAccuracy: typeof match.passAccuracy === 'number' ? match.passAccuracy : 0,
      shots: typeof match.shots === 'number' ? match.shots : 0,
      tackles: typeof match.tackles === 'number' ? match.tackles : 0,
      yellowCards: typeof match.yellowCards === 'number' ? match.yellowCards : 0,
      redCards: typeof match.redCards === 'number' ? match.redCards : 0,
      matchRating: typeof match.matchRating === 'number' ? match.matchRating : 0,
      notes: typeof match.notes === 'string' ? match.notes : '',
    });
  }

  return matches;
}

export class ProfileModel {
  public static getDefaultProfile(userId: string, email: string): PlayerProfile {
    return {
      id: userId,
      fullName: email.split('@')[0] || 'New Player',
      position: 'Attacking Midfielder',
      club: 'Free Agent',
      nationality: 'Unknown',
      preferredFoot: 'Right',
      height: '180 cm',
      weight: '75 kg',
      biography: 'Introduce yourself to scouts here...',
      coverImageUrl: 'https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=1200&q=80',
      avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
      stats: mapMatchesToProfileStats(mockPlayerStatisticsMatches),
      performanceSummary: [
        { label: 'Key Passes', value: 7, max: 10, hint: 'Excellent vision' },
        { label: 'Shots on Target', value: 6, max: 10, hint: 'Clinical finishing' },
        { label: 'Pressing Intensity', value: 8, max: 10, hint: 'Consistent defensive work' },
      ],
      statisticsMatches: mockPlayerStatisticsMatches,
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

    const statisticsMatches =
      parsePlayerMatchStatistics(data.statisticsMatches).length > 0
        ? parsePlayerMatchStatistics(data.statisticsMatches)
        : mockPlayerStatisticsMatches;

    return {
      id,
      fullName: typeof data.fullName === 'string' ? data.fullName : '',
      position: typeof data.position === 'string' ? data.position : '',
      club: typeof data.club === 'string' ? data.club : '',
      nationality: typeof data.nationality === 'string' ? data.nationality : '',
      preferredFoot: typeof data.preferredFoot === 'string' ? data.preferredFoot : '',
      height: typeof data.height === 'string' ? data.height : '',
      weight: typeof data.weight === 'string' ? data.weight : '',
      biography: typeof data.biography === 'string' ? data.biography : '',
      coverImageUrl: typeof data.coverImageUrl === 'string' ? data.coverImageUrl : '',
      avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : '',
      stats:
        stats.length > 0
          ? stats
          : mapMatchesToProfileStats(statisticsMatches),
      performanceSummary:
        performanceSummary.length > 0
          ? performanceSummary
          : [
              { label: 'Key Passes', value: 0, max: 10, hint: 'Vision level' },
              { label: 'Shots on Target', value: 0, max: 10, hint: 'Finishing level' },
              { label: 'Pressing Intensity', value: 0, max: 10, hint: 'Defensive level' },
            ],
      statisticsMatches,
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

    return data;
  }
}
