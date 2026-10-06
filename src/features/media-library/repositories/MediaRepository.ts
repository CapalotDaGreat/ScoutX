import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { getFirestoreDb, isFirebaseConfiguredForProject } from '@/config/firebase';
import { highlightVideoToMediaItem } from '@/features/media-library/services/mediaMigration';
import { type HighlightVideo } from '@/features/highlight-videos/types';
import { type MediaItem } from '@/features/media-library/types';

export class MediaRepository {
  private static instance: MediaRepository | null = null;
  private readonly migratedOwners = new Set<string>();

  public static getInstance(): MediaRepository {
    if (!this.instance) {
      this.instance = new MediaRepository();
    }
    return this.instance;
  }

  public async listMedia(userId: string): Promise<MediaItem[]> {
    if (!isFirebaseConfiguredForProject()) {
      return [];
    }
    const db = getFirestoreDb();
    if (!db) {
      return [];
    }
    const snapshot = await getDocs(query(collection(db, 'players', userId, 'media'), limit(200)));
    return snapshot.docs
      .map((item) => item.data() as MediaItem)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  public async upsertMedia(userId: string, item: MediaItem): Promise<void> {
    if (!isFirebaseConfiguredForProject()) {
      return;
    }
    const db = getFirestoreDb();
    if (!db) {
      throw new Error('Firestore is not initialized.');
    }
    await setDoc(doc(db, 'players', userId, 'media', item.id), item);
  }

  public async ensureMigrated(userId: string, legacyVideos: readonly HighlightVideo[]): Promise<number> {
    if (this.migratedOwners.has(userId) || legacyVideos.length === 0) {
      return 0;
    }
    const db = getFirestoreDb();
    if (!db) {
      return 0;
    }
    const existing = await getDocs(collection(db, 'players', userId, 'media'));
    const existingIds = new Set(existing.docs.map((item) => item.id));
    const missing = legacyVideos.filter((video) => video.id && !existingIds.has(video.id));
    if (missing.length > 0) {
      const batch = writeBatch(db);
      for (const video of missing) {
        batch.set(doc(db, 'players', userId, 'media', video.id), highlightVideoToMediaItem(video, userId));
      }
      await batch.commit();
    }
    this.migratedOwners.add(userId);
    return missing.length;
  }
}
