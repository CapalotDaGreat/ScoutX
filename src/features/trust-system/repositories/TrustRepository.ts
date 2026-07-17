import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  query,
  setDoc,
  where,
  orderBy,
} from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import {
  documentRef,
  subscribeToDocument,
  subscribeToQuery,
} from '@/firebase/firestoreSubscriptions';
import {
  TRUST_PROFILES_COLLECTION,
  TRUST_RECOMMENDATIONS_COLLECTION,
} from '@/features/trust-system/constants';
import {
  buildRecommendationFromDraft,
  createDefaultTrustProfile,
  parseTrustProfile,
  parseTrustRecommendation,
  serializeTrustRecommendation,
  sortRecommendations,
} from '@/features/trust-system/models/TrustModel';
import {
  deleteLocalTrustRecommendation,
  loadLocalTrustProfile,
  loadLocalTrustRecommendations,
  saveLocalTrustRecommendation,
} from '@/features/trust-system/services/trustStorage';
import {
  getMockTrustProfile,
  getMockTrustRecommendations,
} from '@/features/trust-system/services/mockTrustData';
import { useMockData } from '@/config/appMode';
import {
  type TrustProfile,
  type TrustRecommendation,
  type TrustRecommendationDraft,
} from '@/features/trust-system/types';
import { ActivityRecorder } from '@/features/activity-feed/services/activityRecorder';

export class TrustRepository {
  private static instance: TrustRepository | null = null;

  private constructor() {}

  public static getInstance(): TrustRepository {
    if (!this.instance) {
      this.instance = new TrustRepository();
    }
    return this.instance;
  }

  public subscribeToTrustProfile(
    playerId: string,
    callback: (profile: TrustProfile) => void,
    onError?: (error: Error) => void,
  ): () => void {
    const db = getFirestoreDb();

    if (!db) {
      void this.resolveTrustProfile(playerId).then(callback);
      return () => undefined;
    }

    const docRef = documentRef(db, TRUST_PROFILES_COLLECTION, playerId);

    return subscribeToDocument({
      docRef,
      parse: (data, id) => parseTrustProfile(data, id) ?? createDefaultTrustProfile(id),
      onData: callback,
      onFallback: () => {
        void this.resolveTrustProfile(playerId).then(callback);
      },
      onError,
    });
  }

  public subscribeToPlayerRecommendations(
    playerId: string,
    callback: (recommendations: TrustRecommendation[]) => void,
    onError?: (error: Error) => void,
  ): () => void {
    const db = getFirestoreDb();

    if (!db) {
      void this.resolveRecommendations(playerId).then(callback);
      return () => undefined;
    }

    const recommendationsQuery = query(
      collection(db, TRUST_RECOMMENDATIONS_COLLECTION),
      where('playerId', '==', playerId),
      orderBy('updatedAt', 'desc'),
    );

    return subscribeToQuery({
      firestoreQuery: recommendationsQuery,
      parse: (data, id) => parseTrustRecommendation(data, id),
      onData: (recommendations) => callback(sortRecommendations(recommendations)),
      onFallback: () => {
        void this.resolveRecommendations(playerId).then(callback);
      },
      onEmptyFallback: () => {
        void this.resolveRecommendations(playerId).then(callback);
      },
      onError,
    });
  }

  public async saveRecommendation(
    playerId: string,
    playerName: string,
    authorId: string,
    authorName: string,
    authorAvatarUrl: string,
    draft: TrustRecommendationDraft,
    existing?: TrustRecommendation,
  ): Promise<TrustRecommendation> {
    const recommendation = buildRecommendationFromDraft(
      playerId,
      authorId,
      authorName,
      authorAvatarUrl,
      draft,
      existing,
    );

    const recordActivity = () => {
      if (existing) {
        return;
      }
      ActivityRecorder.getInstance().recordRecommendationReceived({
        playerId,
        playerName,
        authorId,
        authorName,
        recommendationId: recommendation.id,
        headline: recommendation.headline,
      });
    };

    const db = getFirestoreDb();

    if (db) {
      try {
        await setDoc(
          doc(db, TRUST_RECOMMENDATIONS_COLLECTION, recommendation.id),
          serializeTrustRecommendation(recommendation),
        );
        recordActivity();
        return recommendation;
      } catch {
        await saveLocalTrustRecommendation(recommendation);
        recordActivity();
        return recommendation;
      }
    }

    await saveLocalTrustRecommendation(recommendation);
    recordActivity();
    return recommendation;
  }

  public async deleteRecommendation(
    playerId: string,
    recommendationId: string,
  ): Promise<void> {
    const db = getFirestoreDb();

    if (db) {
      try {
        await deleteDoc(doc(db, TRUST_RECOMMENDATIONS_COLLECTION, recommendationId));
        return;
      } catch {
        await deleteLocalTrustRecommendation(playerId, recommendationId);
        return;
      }
    }

    await deleteLocalTrustRecommendation(playerId, recommendationId);
  }

  public async fetchTrustProfile(playerId: string): Promise<TrustProfile> {
    const db = getFirestoreDb();

    if (!db) {
      return this.resolveTrustProfile(playerId);
    }

    try {
      const snapshot = await getDoc(doc(db, TRUST_PROFILES_COLLECTION, playerId));
      if (snapshot.exists()) {
        const parsed = parseTrustProfile(snapshot.data(), playerId);
        if (parsed) {
          return parsed;
        }
      }
    } catch {
      // fall through to local/mock
    }

    return this.resolveTrustProfile(playerId);
  }

  private async resolveTrustProfile(playerId: string): Promise<TrustProfile> {
    const local = await loadLocalTrustProfile(playerId);
    if (local) {
      return local;
    }

    const mock = useMockData() ? getMockTrustProfile(playerId) : null;
    if (mock) {
      return mock;
    }

    return createDefaultTrustProfile(playerId);
  }

  private async resolveRecommendations(playerId: string): Promise<TrustRecommendation[]> {
    const local = await loadLocalTrustRecommendations(playerId);
    if (local.length > 0) {
      return local;
    }

    return useMockData() ? getMockTrustRecommendations(playerId) : [];
  }
}
