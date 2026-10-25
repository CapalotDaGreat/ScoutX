import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  documentId,
  startAfter,
  where,
} from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import { useMockData } from '@/config/appMode';
import { DISCOVERY_PAGE_SIZE } from '@/features/scout-discovery/constants';
import { parseDiscoverablePlayer } from '@/features/scout-discovery/models/DiscoverablePlayerModel';
import { filterAndSortPlayers, paginateDiscoveryPlayers } from '@/features/scout-discovery/services/discoveryQueryService';
import { discoveryIndexQuery, readIndexedDiscoveryPage, SEARCH_BATCH_SIZE } from '../services/indexedDiscoveryPage';
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
  const withEvidence = [...players].sort((a, b) => {
    const aAt = a.lastEvidenceAt ?? '';
    const bAt = b.lastEvidenceAt ?? '';
    return bAt.localeCompare(aAt);
  });
  const matching = withEvidence.filter(
    (player) => player.hasHighlightVideos && player.matchCount > 0 && player.recentlyActive,
  );
  return {
    featured: withEvidence.filter((player) => player.verified).slice(0, 5),
    recommended: withEvidence.filter((player) => player.matchCount > 0).slice(0, 6),
    recentlyViewed: [],
    trending: [...players].sort((a, b) => b.viewCount - a.viewCount).slice(0, 6),
    nearby: withEvidence.filter((player) => player.distanceKm !== null).slice(0, 4),
    matchingPreferences: matching.slice(0, 8),
    matchingCount: matching.length,
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
    if (useMockData()) {
      return paginateDiscoveryPlayers(filterAndSortPlayers(mockDiscoverablePlayers, discoveryQuery), cursor, pageSize);
    }
    const db = getFirestoreDb();
    if (!db) throw new Error('Discovery database is unavailable.');
    const ready = await getDoc(doc(db, 'discoverySearchState', 'current'));
    if (ready.get('version') !== 1 || ready.get('ready') !== true) throw new Error('Search index is updating. Please retry later.');
    const index = discoveryIndexQuery(discoveryQuery);
    return readIndexedDiscoveryPage(discoveryQuery, cursor, pageSize, async (after) => {
      const snapshot = await getDocs(query(collection(db, 'discoverablePlayers'),
        ...(index.token ? [where('_search.tokens', 'array-contains', index.token)] : []),
        orderBy(`_search.order.${index.sort}`), orderBy(documentId()),
        ...(after ? [startAfter(after.order, after.id)] : []), limit(SEARCH_BATCH_SIZE)));
      return snapshot.docs.map((entry) => ({ id: entry.id, order: String(entry.get(`_search.order.${index.sort}`)),
        player: parseDiscoverablePlayer({ ...entry.data(), id: entry.id }) }));
    }, (player) => filterAndSortPlayers([player], discoveryQuery).length === 1);
  }

  public async fetchPlayerById(playerId: string): Promise<DiscoverablePlayer | null> {
    if (useMockData()) {
      return getMockPlayerById(playerId) ?? null;
    }

    const db = getFirestoreDb();
    if (!db) {
      throw new Error('Discovery database is unavailable.');
    }

    const docSnap = await getDoc(doc(db, 'discoverablePlayers', playerId));
    if (!docSnap.exists()) {
      return null;
    }
    return parseDiscoverablePlayer({ ...docSnap.data(), id: docSnap.id });
  }

  public async fetchPlayersByIds(playerIds: string[]): Promise<DiscoverablePlayer[]> {
    const uniqueIds = [...new Set(playerIds)];
    const results = await Promise.all(uniqueIds.map((id) => this.fetchPlayerById(id)));
    return results.filter((player): player is DiscoverablePlayer => player !== null);
  }

  public async fetchAllDiscoverablePlayers(limitCount = 100): Promise<DiscoverablePlayer[]> {
    if (useMockData()) return mockDiscoverablePlayers.slice(0, limitCount);
    const db = getFirestoreDb();
    if (!db) {
      throw new Error('Discovery database is unavailable.');
    }

    const snapshot = await getDocs(
      query(collection(db, 'discoverablePlayers'), orderBy('updatedAt', 'desc'), limit(limitCount)),
    );
    return snapshot.docs
      .map((docSnap) => parseDiscoverablePlayer({ ...docSnap.data(), id: docSnap.id }))
      .filter((player): player is DiscoverablePlayer => player !== null);
  }

  public async fetchDashboard(): Promise<ScoutDashboardData> {
    const players = await this.fetchAllDiscoverablePlayers(50);
    if (players.length === 0) {
      return emptyDashboard();
    }
    return buildDashboard(players);
  }

  public async recordProfileView(playerId: string): Promise<void> {
    const callable = (await import('@/firebase/callableFunctions')).createCallableFunction<{
      playerId: string;
    }>('recordDiscoverableView');
    if (!callable) {
      return;
    }
    try {
      await callable({ playerId });
    } catch {
      // Non-critical analytics.
    }
  }
}
