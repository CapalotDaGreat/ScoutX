import {
} from '@/features/trust-system/constants';
import {
  type ClubTenure,
  type TrustProfile,
  type TrustRecommendation,
  type TrustRecommendationDraft,
  type TrustVerificationStatus,
} from '@/features/trust-system/types';
import { type ClubHistoryEntry } from '@/features/player-profile/types/footballIdentity';
import {
  asRecord,
  parseIsoDate,
  parseString,
  parseStringList,
} from '@/utils/firestoreParsing';

function parseVerification(value: unknown): TrustVerificationStatus {
  const record = asRecord(value);
  return {
    verified: record?.verified === true,
    verifiedAt:
      typeof record?.verifiedAt === 'string' ? record.verifiedAt : null,
  };
}

export function parseTrustProfile(value: unknown, playerId: string): TrustProfile | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const clubRecord = asRecord(record.club);
  const now = new Date().toISOString();

  return {
    playerId: parseString(record.playerId, playerId),
    player: parseVerification(record.player),
    scout: parseVerification(record.scout),
    club: {
      ...parseVerification(record.club),
      clubId: typeof clubRecord?.clubId === 'string' ? clubRecord.clubId : null,
      clubName: typeof clubRecord?.clubName === 'string' ? clubRecord.clubName : null,
    },
    coach: parseVerification(record.coach),
    updatedAt: parseIsoDate(record.updatedAt, now),
  };
}

export function serializeTrustProfile(profile: TrustProfile): Record<string, unknown> {
  return {
    playerId: profile.playerId,
    player: profile.player,
    scout: profile.scout,
    club: profile.club,
    coach: profile.coach ?? { verified: false, verifiedAt: null },
    updatedAt: profile.updatedAt,
  };
}

export function parseTrustRecommendation(value: unknown, id: string): TrustRecommendation | null {
  const record = asRecord(value);
  if (!record || typeof record.playerId !== 'string') {
    return null;
  }

  const now = new Date().toISOString();
  const type = record.type === 'scout_endorsement' ? 'scout_endorsement' : 'coach_recommendation';
  const authorRole = record.authorRole === 'scout' ? 'scout' : 'coach';

  return {
    id,
    playerId: record.playerId,
    authorId: parseString(record.authorId),
    authorName: parseString(record.authorName, 'Anonymous'),
    authorRole,
    authorTitle: parseString(record.authorTitle),
    authorOrganization: parseString(record.authorOrganization),
    authorAvatarUrl: parseString(record.authorAvatarUrl),
    type,
    category: typeof record.category === 'string' ? record.category : null,
    relationship: parseString(record.relationship),
    headline: parseString(record.headline),
    body: parseString(record.body),
    skills: parseStringList(record.skills),
    yearsKnown: typeof record.yearsKnown === 'number' ? record.yearsKnown : null,
    featured: record.featured === true,
    createdAt: parseIsoDate(record.createdAt, now),
    updatedAt: parseIsoDate(record.updatedAt, now),
  };
}

export function serializeTrustRecommendation(
  recommendation: TrustRecommendation,
): Record<string, unknown> {
  return {
    playerId: recommendation.playerId,
    authorId: recommendation.authorId,
    authorName: recommendation.authorName,
    authorRole: recommendation.authorRole,
    authorTitle: recommendation.authorTitle,
    authorOrganization: recommendation.authorOrganization,
    authorAvatarUrl: recommendation.authorAvatarUrl,
    type: recommendation.type,
    category: recommendation.category,
    relationship: recommendation.relationship,
    headline: recommendation.headline,
    body: recommendation.body,
    skills: recommendation.skills,
    yearsKnown: recommendation.yearsKnown,
    featured: recommendation.featured,
    createdAt: recommendation.createdAt,
    updatedAt: recommendation.updatedAt,
  };
}

export function buildRecommendationFromDraft(
  playerId: string,
  authorId: string,
  authorName: string,
  authorAvatarUrl: string,
  draft: TrustRecommendationDraft,
  existing?: TrustRecommendation,
): TrustRecommendation {
  const now = new Date().toISOString();
  const authorRole: TrustRecommendation['authorRole'] =
    draft.type === 'scout_endorsement' ? 'scout' : 'coach';

  return {
    id: existing?.id ?? `trust-rec-${Date.now()}`,
    playerId,
    authorId,
    authorName,
    authorRole,
    authorTitle: draft.authorTitle.trim(),
    authorOrganization: draft.authorOrganization.trim(),
    authorAvatarUrl,
    type: draft.type,
    category: draft.category?.trim() || draft.skills[0] || null,
    relationship: draft.relationship.trim(),
    headline: draft.headline.trim(),
    body: draft.body.trim(),
    skills: draft.skills.filter((skill) => skill.trim().length > 0),
    yearsKnown: draft.yearsKnown ?? null,
    featured: draft.featured ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function createDefaultTrustProfile(playerId: string): TrustProfile {
  const now = new Date().toISOString();
  return {
    playerId,
    player: { verified: false, verifiedAt: null },
    scout: { verified: false, verifiedAt: null },
    club: { verified: false, verifiedAt: null, clubId: null, clubName: null },
    coach: { verified: false, verifiedAt: null },
    updatedAt: now,
  };
}

export function computeYearsFromPeriod(period: string): number {
  const normalized = period.trim().toLowerCase();
  const presentMatch = normalized.includes('present') || normalized.includes('current');
  const yearMatches = period.match(/\d{4}/g);

  if (!yearMatches || yearMatches.length === 0) {
    return 1;
  }

  const startYear = Number(yearMatches[0]);
  const endYear = presentMatch
    ? new Date().getFullYear()
    : Number(yearMatches[yearMatches.length - 1]);

  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) {
    return 1;
  }

  return Math.max(1, endYear - startYear + (presentMatch ? 0 : 1));
}

export function buildClubTenures(
  currentClub: string,
  clubHistory: ClubHistoryEntry[],
): ClubTenure[] {
  const tenures: ClubTenure[] = [];

  if (currentClub && currentClub !== 'Free Agent') {
    const currentHistory = clubHistory.find((entry) => entry.club === currentClub);
    tenures.push({
      club: currentClub,
      years: currentHistory?.yearsAtClub ?? computeYearsFromPeriod(currentHistory?.period ?? 'Present'),
      period: currentHistory?.period ?? 'Present',
      isCurrent: true,
      league: currentHistory?.league,
    });
  }

  for (const entry of clubHistory) {
    if (entry.club === currentClub) {
      continue;
    }
    tenures.push({
      club: entry.club,
      years: entry.yearsAtClub ?? computeYearsFromPeriod(entry.period),
      period: entry.period,
      isCurrent: false,
      league: entry.league,
    });
  }

  return tenures;
}

export function sortRecommendations(recommendations: TrustRecommendation[]): TrustRecommendation[] {
  return [...recommendations].sort((a, b) => {
    if (a.featured !== b.featured) {
      return a.featured ? -1 : 1;
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export function groupRecommendationsByType(recommendations: TrustRecommendation[]) {
  return {
    coach: recommendations.filter((item) => item.type === 'coach_recommendation'),
    scout: recommendations.filter((item) => item.type === 'scout_endorsement'),
  };
}
