import { doc, getDoc, onSnapshot, runTransaction, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFirebaseAuth, getFirestoreDb, getFirebaseStorage } from '@/config/firebase';
import { MatchRepository } from '@/features/player-statistics/repositories/MatchRepository';
import { type PlayerProfile, type PlayerProfileStat } from '@/features/player-profile/types';
import {
  parsePlayerMatchStatistics,
  ProfileModel,
} from '@/features/player-profile/models/ProfileModel';
import {
  createMatchStatistics,
  serializeMatchStatistics,
} from '@/features/player-statistics/models/MatchLogModel';
import { mapMatchesToProfileStats } from '@/features/player-statistics/utils/profileStatsMapper';
import { syncDiscoverablePlayer } from '@/features/scout-discovery/services/discoverablePlayerSyncService';
import { MediaRepository } from '@/features/media-library/repositories/MediaRepository';
import { parseHighlightVideoLibrary } from '@/features/highlight-videos/models/HighlightVideoModel';
import { appendSystemJourneyEvents } from '@/features/career-timeline/services/careerTimelineService';
import { serializeFootballJourney } from '@/features/football-journey/models/JourneyModel';
import {
  type MatchLogPayload,
  type MatchReflection,
  type PlayerMatchStatistics,
} from '@/features/player-statistics/types';

export class PlayerProfileRepository {
  private static instance: PlayerProfileRepository | null = null;

  private constructor() {}

  public static getInstance(): PlayerProfileRepository {
    if (!this.instance) {
      this.instance = new PlayerProfileRepository();
    }
    return this.instance;
  }

  public async fetchProfile(userId: string): Promise<PlayerProfile | null> {
    const db = getFirestoreDb();
    if (!db) {
      throw new Error('Firestore is not initialized.');
    }

    try {
      const docRef = doc(db, 'profiles', userId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        void this.migrateLegacyMatches(userId);
        void this.migrateLegacyMedia(userId);
        return ProfileModel.fromFirestore(userId, docSnap.data());
      }
      return null;
    } catch (error) {
      console.error('Error fetching player profile:', error);
      throw error;
    }
  }

  public subscribeToProfile(
    userId: string,
    callback: (profile: PlayerProfile | null) => void,
    onError?: (error: Error) => void
  ): () => void {
    const db = getFirestoreDb();
    if (!db) {
      if (onError) {
        onError(new Error('Firestore is not initialized.'));
      }
      return () => undefined;
    }

    const docRef = doc(db, 'profiles', userId);

    return onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          try {
            const profile = ProfileModel.fromFirestore(userId, docSnap.data());
            callback(profile);
          } catch (err) {
            console.error('Error mapping profile data:', err);
            callback(null);
          }
        } else {
          callback(null);
        }
      },
      (error) => {
        console.error('Error listening to profile updates:', error);
        if (onError) {
          onError(error);
        }
      }
    );
  }

  public async updateProfile(userId: string, data: Partial<PlayerProfile>): Promise<void> {
    const db = getFirestoreDb();
    if (!db) {
      throw new Error('Firestore is not initialized.');
    }

    try {
      const docRef = doc(db, 'profiles', userId);
      const updateData = ProfileModel.toFirestore(data);
      await setDoc(docRef, updateData, { merge: true });

      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        const profile = ProfileModel.fromFirestore(userId, snapshot.data());
        await syncDiscoverablePlayer(profile);
      }
    } catch (error) {
      console.error('Error updating player profile:', error);
      throw error;
    }
  }

  public async appendMatch(
    userId: string,
    payload: MatchLogPayload,
  ): Promise<PlayerMatchStatistics> {
    const db = getFirestoreDb();
    if (!db) {
      throw new Error('Firestore is not initialized.');
    }

    const docRef = doc(db, 'profiles', userId);
    const match = createMatchStatistics(payload, `match-${Date.now()}`);

    try {
      await this.migrateLegacyMatches(userId);
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(docRef);
        const currentData = snapshot.exists() ? snapshot.data() : {};
        const currentProfile = ProfileModel.fromFirestore(userId, currentData);
        const currentMatches = parsePlayerMatchStatistics(currentData.statisticsMatches);
        const nextMatches = [...currentMatches, match];
        const nextJourney = appendSystemJourneyEvents(currentProfile.footballJourney, {
          type: 'match_logged',
          match,
        });

        transaction.set(
          docRef,
          {
            statisticsMatches: nextMatches.map(serializeMatchStatistics),
            stats: this.createProfileStats(nextMatches),
            footballJourney: serializeFootballJourney(nextJourney),
          },
          { merge: true },
        );
        // Canonical per-match document (evidence source) written atomically with the array.
        MatchRepository.getInstance().setInTransaction(transaction, db, userId, match);
      });

      const refreshed = await getDoc(docRef);
      if (refreshed.exists()) {
        const profile = ProfileModel.fromFirestore(userId, refreshed.data());
        await syncDiscoverablePlayer(profile);
      }

      return match;
    } catch (error) {
      console.error('Error appending player match:', error);
      throw error;
    }
  }

  /**
   * Saves (or clears, with null) the player's own reflection for one match. Updates the
   * profile match array and the canonical match document atomically, mirroring appendMatch.
   * Reflections never feed discovery or public projections.
   */
  public async updateMatchReflection(
    userId: string,
    matchId: string,
    reflection: MatchReflection | null,
  ): Promise<void> {
    const db = getFirestoreDb();
    if (!db) {
      throw new Error('Firestore is not initialized.');
    }

    const docRef = doc(db, 'profiles', userId);
    try {
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(docRef);
        if (!snapshot.exists()) {
          throw new Error('Profile not found.');
        }
        const currentMatches = parsePlayerMatchStatistics(snapshot.data().statisticsMatches);
        if (!currentMatches.some((match) => match.id === matchId)) {
          throw new Error('Match not found.');
        }
        const nextMatches = currentMatches.map((match) =>
          match.id === matchId ? { ...match, reflection } : match,
        );
        transaction.set(
          docRef,
          { statisticsMatches: nextMatches.map(serializeMatchStatistics) },
          { merge: true },
        );
        const updated = nextMatches.find((match) => match.id === matchId);
        if (updated) {
          MatchRepository.getInstance().setInTransaction(transaction, db, userId, updated);
        }
      });
    } catch (error) {
      console.error('Error updating match reflection:', error);
      throw error;
    }
  }

  public async uploadImage(userId: string, fileUri: string, type: 'avatar' | 'cover'): Promise<string> {
    const storage = getFirebaseStorage();
    if (!storage) {
      throw new Error('Firebase Storage is not initialized.');
    }

    try {
      const response = await fetch(fileUri);
      const blob = await response.blob();

      const fileExtension = 'jpg';
      const storageRef = ref(storage, `profiles/${userId}/${type}_${Date.now()}.${fileExtension}`);

      await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });

      const downloadUrl = await getDownloadURL(storageRef);
      return downloadUrl;
    } catch (error) {
      console.error('Error uploading image to storage:', error);
      throw error;
    }
  }

  private createProfileStats(matches: PlayerMatchStatistics[]): PlayerProfileStat[] {
    return mapMatchesToProfileStats(matches);
  }

  /**
   * Lazily copies legacy `statisticsMatches` into `players/{uid}/matches`. Only the signed-in
   * owner can write there, so this is a no-op for other viewers. Failures are logged and
   * swallowed: the array remains the fallback source until the next attempt.
   */
  private async migrateLegacyMatches(userId: string): Promise<void> {
    const db = getFirestoreDb();
    if (!db || getFirebaseAuth()?.currentUser?.uid !== userId) {
      return;
    }
    try {
      const snapshot = await getDoc(doc(db, 'profiles', userId));
      if (!snapshot.exists()) {
        return;
      }
      const legacy = parsePlayerMatchStatistics(snapshot.data().statisticsMatches);
      await MatchRepository.getInstance().ensureMigrated(userId, legacy);
    } catch (error) {
      if (__DEV__) {
        console.warn('Match log migration deferred:', error);
      }
    }
  }

  private async migrateLegacyMedia(userId: string): Promise<void> {
    const db = getFirestoreDb();
    if (!db || getFirebaseAuth()?.currentUser?.uid !== userId) {
      return;
    }
    try {
      const snapshot = await getDoc(doc(db, 'profiles', userId));
      if (!snapshot.exists()) {
        return;
      }
      const library = parseHighlightVideoLibrary(snapshot.data().highlightVideos);
      await MediaRepository.getInstance().ensureMigrated(userId, library.videos);
    } catch (error) {
      if (__DEV__) {
        console.warn('Media library migration deferred:', error);
      }
    }
  }
}
