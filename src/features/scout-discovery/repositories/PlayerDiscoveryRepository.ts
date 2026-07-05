import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  setDoc,
  startAfter,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import { useMockData } from '@/config/appMode';
import { resolveQueryCursor } from '@/firebase/firestorePagination';
import { DISCOVERY_PAGE_SIZE } from '@/features/scout-discovery/constants';
import { parseDiscoverablePlayer } from '@/features/scout-discovery/models/DiscoverablePlayerModel';
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

function emptyDashboard(): ScoutDashboardData {
  return {
    featured: [],
    recommended: [],
    recentlyViewed: [],
    trending: [],
    nearby: [],
    matchingPreferences: [],
    matchingCount: 0,
  };
}

function buildDashboard(players: DiscoverablePlayer[]): ScoutDashboardData {
  const sorted = [...players].sort((a, b) => b.overallRating - a.overallRating);
  return {
    featured: sorted.filter((player) => player.verified).slice(0, 5),
    recommended: sorted.slice(0, 6),
    recentlyViewed: [],
    trending: [...sorted].sort((a, b) => b.viewCount - a.viewCount).slice(0, 6),
    nearby: sorted.filter((player) => player.distanceKm !== null).slice(0, 4),
    matchingPreferences: sorted
      .filter((player) => player.potentialRating >= 70 && player.age <= 23)
      .slice(0, 8),
    matchingCount: sorted.filter((player) => player.potentialRating >= 70 && player.age <= 23).length,
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
      if (useMockData()) {
        const filtered = filterAndSortPlayers(mockDiscoverablePlayers, discoveryQuery);
        return paginatePlayers(filtered, cursor, pageSize);
      }
      return { players: [], nextCursor: null, hasMore: false };
    }

    try {
      const playersRef = collection(db, 'discoverablePlayers');
      const cursorSnapshot = await resolveQueryCursor(db, 'discoverablePlayers', cursor);
      const playersQuery = query(
        playersRef,
        orderBy('updatedAt', 'desc'),
        ...(cursorSnapshot ? [startAfter(cursorSnapshot)] : []),
        limit(pageSize),
      );

      const snapshot = await getDocs(playersQuery);
      const players = snapshot.docs
        .map((docSnap) => parseDiscoverablePlayer({ id: docSnap.id, ...docSnap.data() }))
        .filter((player): player is DiscoverablePlayer => player !== null);

      const filtered = filterAndSortPlayers(players, discoveryQuery);
      const lastDoc = snapshot.docs[snapshot.docs.length - 1] as DocumentSnapshot | undefined;

      return {
        players: filtered,
        nextCursor: lastDoc?.id ?? null,
        hasMore: snapshot.docs.length === pageSize,
      };
    } catch {
      if (useMockData()) {
        const filtered = filterAndSortPlayers(mockDiscoverablePlayers, discoveryQuery);
        return paginatePlayers(filtered, cursor, pageSize);
      }
      return { players: [], nextCursor: null, hasMore: false };
    }
  }

  public async fetchPlayerById(playerId: string): Promise<DiscoverablePlayer | null> {
    if (useMockData()) {
      return getMockPlayerById(playerId) ?? null;
    }

    const db = getFirestoreDb();
    if (!db) {
      return null;
    }

    try {
      const docSnap = await getDoc(doc(db, 'discoverablePlayers', playerId));
      if (!docSnap.exists()) {
        return null;
      }
      return parseDiscoverablePlayer({ id: docSnap.id, ...docSnap.data() });
    } catch {
      return null;
    }
  }

  public async fetchPlayersByIds(playerIds: string[]): Promise<DiscoverablePlayer[]> {
    const uniqueIds = [...new Set(playerIds)];
    const results = await Promise.all(uniqueIds.map((id) => this.fetchPlayerById(id)));
    return results.filter((player): player is DiscoverablePlayer => player !== null);
  }

  public async fetchAllDiscoverablePlayers(limitCount = 100): Promise<DiscoverablePlayer[]> {
    const db = getFirestoreDb();
    if (!db) {
      return useMockData() ? mockDiscoverablePlayers : [];
    }

    try {
      const snapshot = await getDocs(
        query(collection(db, 'discoverablePlayers'), orderBy('updatedAt', 'desc'), limit(limitCount)),
      );
      return snapshot.docs
        .map((docSnap) => parseDiscoverablePlayer({ id: docSnap.id, ...docSnap.data() }))
        .filter((player): player is DiscoverablePlayer => player !== null);
    } catch {
      return useMockData() ? mockDiscoverablePlayers : [];
    }
  }

  public async fetchDashboard(): Promise<ScoutDashboardData> {
    const players = await this.fetchAllDiscoverablePlayers(50);
    if (players.length === 0) {
      return emptyDashboard();
    }
    return buildDashboard(players);
  }

  public async recordProfileView(playerId: string): Promise<void> {
    const db = getFirestoreDb();
    if (!db) {
      return;
    }

    try {
      await setDoc(
        doc(db, 'discoverablePlayers', playerId),
        { viewCount: increment(1), updatedAt: new Date().toISOString() },
        { merge: true },
      );
    } catch {
      // Non-critical analytics.
    }
  }
}
