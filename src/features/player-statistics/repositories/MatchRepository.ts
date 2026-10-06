import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  writeBatch,
  type Firestore,
  type Transaction,
} from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import { parsePlayerMatchStatistics } from '@/features/player-profile/models/ProfileModel';
import { serializeMatchStatistics } from '@/features/player-statistics/models/MatchLogModel';
import { type PlayerMatchStatistics } from '@/features/player-statistics/types';

/**
 * Canonical per-match storage: `players/{uid}/matches/{matchId}`.
 *
 * Historically match logs lived only in the `statisticsMatches` array on the profile
 * document. That array is still maintained (it feeds the profile stats and the public
 * passport projection), but every match is now also written as its own document so it can
 * be referenced as evidence, queried and paginated. `ensureMigrated` copies legacy array
 * entries into the subcollection once; it is idempotent and only ever adds documents.
 */
export class MatchRepository {
  private static instance: MatchRepository | null = null;

  /** Owners whose legacy matches were confirmed migrated in this session. */
  private readonly migratedOwners = new Set<string>();

  private constructor() {}

  public static getInstance(): MatchRepository {
    if (!this.instance) {
      this.instance = new MatchRepository();
    }
    return this.instance;
  }

  public static collectionPath(userId: string): string {
    return `players/${userId}/matches`;
  }

  public async listMatches(userId: string, max = 500): Promise<PlayerMatchStatistics[]> {
    const db = this.requireDb();
    const snapshot = await getDocs(
      query(collection(db, 'players', userId, 'matches'), orderBy('date', 'desc'), limit(max)),
    );
    return parsePlayerMatchStatistics(snapshot.docs.map((item) => item.data()));
  }

  /** Writes a match document as part of an existing transaction. */
  public setInTransaction(
    transaction: Transaction,
    db: Firestore,
    userId: string,
    match: PlayerMatchStatistics,
  ): void {
    transaction.set(doc(db, 'players', userId, 'matches', match.id), serializeMatchStatistics(match));
  }

  /**
   * Copies legacy `statisticsMatches` entries into the subcollection when they are missing.
   * Safe to call repeatedly; returns the number of documents written.
   */
  public async ensureMigrated(
    userId: string,
    legacyMatches: readonly PlayerMatchStatistics[],
  ): Promise<number> {
    if (this.migratedOwners.has(userId) || legacyMatches.length === 0) {
      return 0;
    }
    const db = this.requireDb();
    const existing = await getDocs(collection(db, 'players', userId, 'matches'));
    const existingIds = new Set(existing.docs.map((item) => item.id));
    const missing = legacyMatches.filter((match) => match.id && !existingIds.has(match.id));

    if (missing.length > 0) {
      // Firestore batches are capped at 500 writes.
      for (let index = 0; index < missing.length; index += 450) {
        const batch = writeBatch(db);
        for (const match of missing.slice(index, index + 450)) {
          batch.set(doc(db, 'players', userId, 'matches', match.id), serializeMatchStatistics(match));
        }
        await batch.commit();
      }
    }

    this.migratedOwners.add(userId);
    return missing.length;
  }

  private requireDb(): Firestore {
    const db = getFirestoreDb();
    if (!db) {
      throw new Error('Firestore is not initialized.');
    }
    return db;
  }
}
