import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import { DISCOVERY_PAGE_SIZE } from '@/features/scout-discovery/constants';
import { filterAndSortPlayers } from '@/features/scout-discovery/services/discoveryQueryService';
import {
  getMockPlayerById,
  mockDiscoverablePlayers,
} from '@/features/scout-discovery/services/mockPlayerDiscoveryData';
import {
  type DiscoverablePlayer,
  type DiscoveryPageResult,
  type DiscoveryQuery,
  type ScoutDashboardData,
} from '@/features/scout-discovery/types';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseDiscoverablePlayer(value: unknown): DiscoverablePlayer | null {
  const record = asRecord(value);
  if (!record || typeof record.id !== 'string') {
    return null;
  }

  const mock = getMockPlayerById(record.id);
  if (mock) {
    return mock;
  }

  return null;
}

function paginatePlayers(
  players: DiscoverablePlayer[],
  cursor: string | null,
  pageSize: number,
): DiscoveryPageResult {
  const startIndex = cursor ? players.findIndex((player) => player.id === cursor) + 1 : 0;
  const slice = players.slice(startIndex, startIndex + pageSize);
  const nextCursor = slice.length === pageSize ? slice[slice.length - 1]?.id ?? null : null;

  return {
    players: slice,
    nextCursor,
    hasMore: startIndex + pageSize < players.length,
  };
}

export class PlayerDiscoveryRepository {
  private static instance: PlayerDiscoveryRepository | null = null;

  private constructor() {}

  public static getInstance(): PlayerDiscoveryRepository {
    if (!this.instance) {
      this.instance = new PlayerDiscoveryRepository();
    }
    return this.instance;
  }

  public async fetchPlayersPage(
    discoveryQuery: DiscoveryQuery,
    cursor: string | null,
    pageSize = DISCOVERY_PAGE_SIZE,
  ): Promise<DiscoveryPageResult> {
    const db = getFirestoreDb();

    if (!db) {
      const filtered = filterAndSortPlayers(mockDiscoverablePlayers, discoveryQuery);
      return paginatePlayers(filtered, cursor, pageSize);
    }

    try {
      const playersRef = collection(db, 'discoverablePlayers');
      const playersQuery = query(
        playersRef,
        orderBy('updatedAt', 'desc'),
        limit(pageSize),
        ...(cursor
          ? [startAfter({ id: cursor } as unknown as QueryDocumentSnapshot)]
          : []),
      );

      const snapshot = await getDocs(playersQuery);
      const players = snapshot.docs
        .map((docSnap) => parseDiscoverablePlayer({ id: docSnap.id, ...docSnap.data() }))
        .filter((player): player is DiscoverablePlayer => player !== null);

      if (players.length === 0) {
        const filtered = filterAndSortPlayers(mockDiscoverablePlayers, discoveryQuery);
        return paginatePlayers(filtered, cursor, pageSize);
      }

      const filtered = filterAndSortPlayers(players, discoveryQuery);
      const lastDoc = snapshot.docs[snapshot.docs.length - 1] as DocumentSnapshot | undefined;

      return {
        players: filtered,
        nextCursor: lastDoc?.id ?? null,
        hasMore: snapshot.docs.length === pageSize,
      };
    } catch {
      const filtered = filterAndSortPlayers(mockDiscoverablePlayers, discoveryQuery);
      return paginatePlayers(filtered, cursor, pageSize);
    }
  }

  public async fetchPlayerById(playerId: string): Promise<DiscoverablePlayer | null> {
    return getMockPlayerById(playerId) ?? null;
  }

  public async fetchDashboard(): Promise<ScoutDashboardData> {
    const sorted = filterAndSortPlayers(mockDiscoverablePlayers, {
      search: '',
      filters: {
        ageMin: null,
        ageMax: null,
        positions: [],
        nationalities: [],
        preferredFoot: null,
        heightMin: null,
        heightMax: null,
        weightMin: null,
        weightMax: null,
        clubs: [],
        leagues: [],
        availability: null,
        overallMin: null,
        potentialMin: null,
        distanceMaxKm: null,
        sprintSpeedMin: null,
        passingMin: null,
        shootingMin: null,
        defendingMin: null,
        physicalMin: null,
        weakFootMin: null,
        skillMovesMin: null,
        matchCountMin: null,
        recentlyActive: false,
        hasHighlightVideos: false,
        verifiedOnly: false,
      },
      sort: 'overall',
    });

    return {
      featured: sorted.filter((p) => p.verified).slice(0, 5),
      recommended: sorted.slice(0, 6),
      recentlyViewed: sorted.slice(2, 6),
      trending: [...sorted].sort((a, b) => b.viewCount - a.viewCount).slice(0, 6),
      nearby: sorted.filter((p) => p.distanceKm !== null).slice(0, 4),
      matchingPreferences: sorted
        .filter((p) => p.potentialRating >= 80 && p.age <= 23 && p.verified)
        .slice(0, 8),
      matchingCount: sorted.filter((p) => p.potentialRating >= 80 && p.age <= 23).length,
    };
  }
}
