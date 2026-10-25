import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { FieldPath, FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { createCallableOptions } from './callableOptions';
import { SCOUT_FOOTBALL_SOURCES_COLLECTION } from './footballSources/core';
import { loadVisibleSources } from './footballSources/service';
import { isAccountHeld } from './moderation/holds';
import { applyYouthDisplay } from './publicPassport';
import { loadSafetyPolicy } from './safety/userSafety';
import { buildDiscoverySearchIndex, indexedSearchMatches, searchWords } from './discoverySearchIndex';

type Privacy = {
  discoverableByScouts?: boolean;
  showStatistics?: boolean;
};

type ProfileDoc = Record<string, unknown> & {
  privacy?: Privacy;
  identity?: Record<string, unknown>;
};

type CoverageState = 'strong' | 'moderate' | 'limited' | 'insufficient';

const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST', 'CF'] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function flag(privacy: Privacy | undefined, key: keyof Privacy, fallback: boolean): boolean {
  const value = privacy?.[key];
  return typeof value === 'boolean' ? value : fallback;
}

type LoggedStat = { total: number; sampleSize: number };

/** Totals only count matches that actually recorded the stat; missing values are not zeros. */
function sumLoggedStat(matches: unknown[], key: 'goals' | 'assists'): LoggedStat {
  let total = 0;
  let sampleSize = 0;
  for (const item of matches) {
    const value = asRecord(item)?.[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      total += value;
      sampleSize += 1;
    }
  }
  return { total, sampleSize };
}

function loggedStatMetric(stat: LoggedStat, visible: boolean) {
  if (!visible || stat.sampleSize === 0) {
    return { value: null, sampleSize: 0, provenance: null };
  }
  return { value: stat.total, sampleSize: stat.sampleSize, provenance: 'self_reported' as const };
}

function parseHeightCm(height: unknown): number | null {
  if (typeof height !== 'string') {
    return null;
  }
  const match = height.match(/(\d{2,3})/);
  return match ? Number(match[1]) : null;
}

function mapPosition(value: unknown): (typeof POSITIONS)[number] | null {
  if (typeof value !== 'string') {
    return null;
  }
  const upper = value.trim().toUpperCase();
  return (POSITIONS as readonly string[]).includes(upper)
    ? (upper as (typeof POSITIONS)[number])
    : null;
}

function coverageFromSummary(summary: Record<string, unknown> | null): Record<string, CoverageState> {
  const empty: Record<string, CoverageState> = {
    technical: 'insufficient',
    tactical: 'insufficient',
    physical: 'insufficient',
    consistency: 'insufficient',
    video: 'insufficient',
  };
  const list = Array.isArray(summary?.coverage) ? summary.coverage : [];
  for (const item of list) {
    const row = asRecord(item);
    if (!row || typeof row.id !== 'string') {
      continue;
    }
    if (row.state === 'strong' || row.state === 'moderate' || row.state === 'limited' || row.state === 'insufficient') {
      empty[row.id] = row.state;
    }
  }
  return empty;
}

/**
 * Pre-Phase-J identities were written with a fixed seed (right foot, 3/3 stars, available,
 * open to offers, free agent). That exact combination was never stated by the player.
 */
export function stripLegacyIdentitySeed(identity: Record<string, unknown>): Record<string, unknown> {
  const seeded =
    identity.strongFoot === 'right' &&
    identity.weakFootRating === 3 &&
    identity.skillMovesRating === 3 &&
    identity.availability === 'available' &&
    identity.transferStatus === 'open_to_offers' &&
    identity.contractStatus === 'free_agent' &&
    identity.academicStatus === 'not_applicable';
  if (!seeded) {
    return identity;
  }
  return {
    ...identity,
    strongFoot: null,
    weakFootRating: null,
    skillMovesRating: null,
    availability: null,
    transferStatus: null,
    contractStatus: null,
    academicStatus: null,
    currentClub: identity.currentClub === 'Free Agent' ? '' : identity.currentClub,
  };
}

export function buildDiscoverableProjection(input: {
  playerId: string;
  profile: ProfileDoc;
  summary: Record<string, unknown> | null;
  verified: boolean;
  verificationLevel: 'none' | 'basic' | 'verified';
  nowIso: string;
}): Record<string, unknown> | null {
  if (!flag(input.profile.privacy, 'discoverableByScouts', false)) {
    return null;
  }

  const identity = stripLegacyIdentitySeed(input.profile.identity ?? {});
  const positions = [
    mapPosition(input.profile.position),
    ...(Array.isArray(identity.preferredPositions)
      ? identity.preferredPositions.map(mapPosition)
      : []),
    ...(Array.isArray(identity.secondaryPositions)
      ? identity.secondaryPositions.map(mapPosition)
      : []),
  ].filter((item): item is (typeof POSITIONS)[number] => item !== null);
  const uniquePositions = [...new Set(positions)];
  const matches = Array.isArray(input.profile.statisticsMatches) ? input.profile.statisticsMatches : [];
  const videos = asRecord(input.profile.highlightVideos)?.videos;
  const videoCount = Array.isArray(videos) ? videos.length : 0;
  const lastEvidenceAt =
    typeof input.summary?.lastEvidenceAt === 'string'
      ? input.summary.lastEvidenceAt
      : matches
          .map((item) => {
            const row = asRecord(item);
            return typeof row?.date === 'string' ? row.date : null;
          })
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null;
  const matchCount =
    typeof input.summary?.matchCount === 'number' ? input.summary.matchCount : matches.length;
  const statsVisible = flag(input.profile.privacy, 'showStatistics', true);
  const goals = sumLoggedStat(matches, 'goals');
  const assists = sumLoggedStat(matches, 'assists');
  const style =
    typeof identity.preferredPlayingStyle === 'string' ? identity.preferredPlayingStyle : '';

  return {
    id: input.playerId,
    fullName: typeof input.profile.fullName === 'string' ? input.profile.fullName : '',
    age: null,
    nationality: typeof input.profile.nationality === 'string' ? input.profile.nationality : '',
    club:
      typeof input.profile.club === 'string' && input.profile.club && input.profile.club !== 'Free Agent'
        ? input.profile.club
        : typeof identity.currentClub === 'string'
          ? identity.currentClub
          : '',
    // A preferred league is an aspiration, not the league the player plays in.
    league: '',
    position: uniquePositions,
    primaryPosition: uniquePositions[0] ?? null,
    secondaryPositions: uniquePositions.slice(1),
    roleDescriptors: [],
    styleTags: style ? [style] : [],
    preferredFoot:
      identity.strongFoot === 'left' || identity.strongFoot === 'right' || identity.strongFoot === 'both'
        ? identity.strongFoot
        : null,
    heightCm: parseHeightCm(input.profile.height),
    weightKg: parseHeightCm(input.profile.weight),
    avatarUrl: typeof input.profile.avatarUrl === 'string' ? input.profile.avatarUrl : '',
    coverImageUrl: typeof input.profile.coverImageUrl === 'string' ? input.profile.coverImageUrl : '',
    biography: typeof input.profile.biography === 'string' ? input.profile.biography : '',
    overallRating: null,
    overallRatingSource: null,
    potentialRating: null,
    potentialRatingSource: null,
    availability:
      identity.availability === 'available' ||
      identity.availability === 'unavailable' ||
      identity.availability === 'on_loan'
        ? identity.availability
        : identity.availability === 'injured'
          ? 'unavailable'
          : null,
    verified: input.verified,
    verificationLevel: input.verificationLevel,
    weakFoot: typeof identity.weakFootRating === 'number' ? identity.weakFootRating : null,
    skillMoves: typeof identity.skillMovesRating === 'number' ? identity.skillMovesRating : null,
    matchCount,
    analysisSampleCount: 0,
    recentlyActive: Boolean(
      lastEvidenceAt && Date.now() - new Date(lastEvidenceAt).getTime() <= 30 * 24 * 60 * 60 * 1000,
    ),
    hasHighlightVideos: videoCount > 0,
    updatedAt: input.nowIso,
    lastEvidenceAt,
    lastAnalyzedAt: null,
    goals: statsVisible ? goals.total : 0,
    assists: statsVisible ? assists.total : 0,
    sprintSpeedKmh: null,
    ratings: { passing: null, shooting: null, defending: null, physical: null },
    form: [],
    radarStats: [],
    evidenceCoverage: coverageFromSummary(input.summary),
    metrics: {
      goals: loggedStatMetric(goals, statsVisible),
      assists: loggedStatMetric(assists, statsVisible),
      matchCount: { value: matchCount, sampleSize: matchCount, provenance: matchCount > 0 ? 'match_derived' : null },
      videoCount: {
        value: videoCount,
        sampleSize: videoCount > 0 ? 1 : 0,
        provenance: videoCount > 0 ? 'self_reported' : null,
      },
    },
    distanceKm: null,
    clubHistory: Array.isArray(identity.clubHistory) ? identity.clubHistory : [],
    achievements: [],
    searchKeywords: [
      typeof input.profile.fullName === 'string' ? input.profile.fullName.toLowerCase() : '',
      ...uniquePositions.map((item) => item.toLowerCase()),
    ].filter(Boolean),
    ...(typeof input.profile.username === 'string' ? { username: input.profile.username } : {}),
  };
}

export async function projectDiscoverablePlayer(playerId: string): Promise<void> {
  const db = getFirestore();
  const [profileSnap, summarySnap, verificationSnap, policy] = await Promise.all([
    db.collection('profiles').doc(playerId).get(),
    db.collection('passportSummaries').doc(playerId).get(),
    db.collection('verificationStates').doc(`player-${playerId}`).get(),
    loadSafetyPolicy(playerId, db),
  ]);
  const ref = db.collection('discoverablePlayers').doc(playerId);
  const scoutSourcesRef = db.collection(SCOUT_FOOTBALL_SOURCES_COLLECTION).doc(playerId);
  const unlist = () =>
    Promise.all([ref.delete().catch(() => undefined), scoutSourcesRef.delete().catch(() => undefined)]);
  if (!profileSnap.exists || !policy.canBeDiscovered || (await isAccountHeld(playerId, db))) {
    await unlist();
    return;
  }
  const profile = profileSnap.data() as ProfileDoc;
  const verificationLevel =
    verificationSnap.data()?.level === 'verified'
      ? 'verified'
      : verificationSnap.data()?.level === 'basic'
        ? 'basic'
        : 'none';
  const projection = buildDiscoverableProjection({
    playerId,
    profile,
    summary: summarySnap.exists ? (summarySnap.data() as Record<string, unknown>) : null,
    verified: verificationLevel === 'verified',
    verificationLevel,
    nowIso: new Date().toISOString(),
  });
  if (!projection) {
    await unlist();
    return;
  }
  // Scouts see links the player shared with scouts or on the Passport, only while listed.
  const scoutSources = await loadVisibleSources(db, playerId, ['passport', 'scouts']);
  await (scoutSources.length > 0
    ? scoutSourcesRef.set({ playerId, sources: scoutSources, projectedAt: new Date().toISOString() })
    : scoutSourcesRef.delete().catch(() => undefined));
  const existing = await ref.get();
  const viewCount = existing.exists ? (existing.data()?.viewCount ?? 0) : 0;
  const display = applyYouthDisplay(projection, policy);
  await ref.set({
    ...display,
    searchKeywords: policy.isMinor
      ? [
          String(display.fullName ?? '').toLowerCase(),
          ...((projection.searchKeywords as string[] | undefined) ?? []).filter(
            (keyword) => keyword !== String(profile.fullName ?? '').toLowerCase(),
          ),
        ].filter(Boolean)
      : projection.searchKeywords,
    viewCount,
    _search: buildDiscoverySearchIndex({ ...display, viewCount }),
  });
}

export const onProfileWrittenProjectDiscovery = onDocumentWritten(
  'profiles/{playerId}',
  async (event) => {
    try {
      await projectDiscoverablePlayer(event.params.playerId);
    } catch (error) {
      logger.error('Failed to project discoverable player from profile', {
        playerId: event.params.playerId,
        error,
      });
      throw error;
    }
  },
);

export const onPassportSummaryWrittenProjectDiscovery = onDocumentWritten(
  'passportSummaries/{playerId}',
  async (event) => {
    try {
      await projectDiscoverablePlayer(event.params.playerId);
    } catch (error) {
      logger.error('Failed to project discoverable player from summary', {
        playerId: event.params.playerId,
        error,
      });
      throw error;
    }
  },
);

function isRecruiter(request: CallableRequest): boolean {
  const role = request.auth?.token.role;
  return role === 'scout' || role === 'coach' || role === 'club' || role === 'admin';
}

export const recordDiscoverableView = onCall(createCallableOptions(), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const { assertCallableRateLimit, DISCOVERY_VIEW_LIMIT } = await import('./security/rateLimit');
  await assertCallableRateLimit(uid, DISCOVERY_VIEW_LIMIT);
  const playerId = typeof request.data?.playerId === 'string' ? request.data.playerId : '';
  if (!playerId || playerId === uid) {
    return { recorded: false };
  }
  const ref = getFirestore().collection('discoverablePlayers').doc(playerId);
  const snap = await ref.get();
  if (!snap.exists) {
    return { recorded: false };
  }
  await ref.update({ viewCount: FieldValue.increment(1) });
  return { recorded: true };
});

type SearchFilters = {
  positions?: string[];
  nationalities?: string[];
  clubs?: string[];
  leagues?: string[];
  verifiedOnly?: boolean;
  recentlyActive?: boolean;
  hasHighlightVideos?: boolean;
  matchCountMin?: number | null;
  ageMin?: number | null;
  ageMax?: number | null;
};

/**
 * Server-side discovery page. Firestore cannot express every filter combination, so the
 * callable applies the remaining predicates in memory over a bounded, indexed window.
 */
export const searchDiscoverablePlayers = onCall(createCallableOptions(), async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  if (!isRecruiter(request) && request.auth.token.role !== 'player') {
    throw new HttpsError('permission-denied', 'A signed-in PitchProof role is required.');
  }
  const { assertCallableRateLimit, DISCOVERY_SEARCH_LIMIT } = await import('./security/rateLimit');
  await assertCallableRateLimit(request.auth.uid, DISCOVERY_SEARCH_LIMIT);
  const filters = asRecord(request.data?.filters) as SearchFilters | null;
  const search = typeof request.data?.search === 'string' ? request.data.search.trim().toLowerCase() : '';
  const pageSize = Math.min(40, Math.max(1, typeof request.data?.pageSize === 'number' ? request.data.pageSize : 20));
  const cursor = typeof request.data?.cursor === 'string' ? request.data.cursor : null;

  if (!Number.isSafeInteger(pageSize)) throw new HttpsError('invalid-argument', 'Invalid page size.');
  const db = getFirestore();
  const ready = await db.collection('discoverySearchState').doc('current').get();
  if (ready.get('ready') !== true || ready.get('version') !== 1) throw new HttpsError('failed-precondition', 'Search index is updating.');
  const identity = JSON.stringify({ search, filters });
  let candidates = db.collection('discoverablePlayers').orderBy('_search.order.recently_updated').orderBy(FieldPath.documentId());
  const firstTerm = searchWords(search)[0];
  if (firstTerm) candidates = candidates.where('_search.tokens', 'array-contains', `all:${Array.from(firstTerm).slice(0, 32).join('')}`);
  if (cursor) {
    let decoded: unknown;
    try { decoded = JSON.parse(cursor); } catch { throw new HttpsError('invalid-argument', 'Invalid search cursor.'); }
    const value = asRecord(decoded);
    if (!value || value.identity !== identity || typeof value.order !== 'string' || typeof value.id !== 'string'
      || value.id.includes('/') || cursor.length > 16384) throw new HttpsError('invalid-argument', 'Search changed; restart discovery.');
    candidates = candidates.startAfter(value.order, value.id);
  }
  const snapshot = await candidates.limit(pageSize).get();

  const players = snapshot.docs
    .map((docSnap) => ({ ...(docSnap.data() as Record<string, unknown>), id: docSnap.id } as Record<string, unknown> & { id: string }))
    .filter((player) => {
      if (search) {
        if (!indexedSearchMatches(player, search, 'all')) {
          return false;
        }
      }
      if (filters?.verifiedOnly && player.verified !== true) return false;
      if (filters?.recentlyActive && player.recentlyActive !== true) return false;
      if (filters?.hasHighlightVideos && player.hasHighlightVideos !== true) return false;
      if (typeof filters?.matchCountMin === 'number' && Number(player.matchCount ?? 0) < filters.matchCountMin) {
        return false;
      }
      if (filters?.positions && filters.positions.length > 0) {
        const positions = Array.isArray(player.position) ? player.position : [];
        if (!filters.positions.some((item) => positions.includes(item))) return false;
      }
      if (filters?.nationalities && filters.nationalities.length > 0) {
        if (!filters.nationalities.includes(String(player.nationality ?? ''))) return false;
      }
      if (filters?.clubs && filters.clubs.length > 0) {
        if (!filters.clubs.includes(String(player.club ?? ''))) return false;
      }
      if (filters?.leagues && filters.leagues.length > 0) {
        if (!filters.leagues.includes(String(player.league ?? ''))) return false;
      }
      const age = typeof player.age === 'number' ? player.age : null;
      if (typeof filters?.ageMin === 'number' && (age === null || age < filters.ageMin)) return false;
      if (typeof filters?.ageMax === 'number' && (age === null || age > filters.ageMax)) return false;
      return true;
    });

  const last = snapshot.docs.at(-1);
  const hasMore = snapshot.size === pageSize;
  return {
    players,
    nextCursor: hasMore && last ? JSON.stringify({ identity, order: last.get('_search.order.recently_updated'), id: last.id }) : null,
    hasMore,
  };
});
