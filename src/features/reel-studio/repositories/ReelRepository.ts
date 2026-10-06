import { collection, doc, getDocs, query, setDoc, where, limit } from 'firebase/firestore';
import { getFirestoreDb, isFirebaseConfiguredForProject } from '@/config/firebase';
import { type ReelManifest } from '@/features/reel-studio/types';
import { buildReelQualityNotes } from '@/features/reel-studio/services/reelQuality';

export class ReelRepository {
  private static instance: ReelRepository | null = null;

  public static getInstance(): ReelRepository {
    if (!this.instance) {
      this.instance = new ReelRepository();
    }
    return this.instance;
  }

  public async listReels(ownerId: string): Promise<ReelManifest[]> {
    if (!isFirebaseConfiguredForProject()) {
      return [];
    }
    const db = getFirestoreDb();
    if (!db) {
      return [];
    }
    const snapshot = await getDocs(
      query(collection(db, 'reels'), where('ownerId', '==', ownerId), limit(50)),
    );
    return snapshot.docs
      .map((item) => item.data() as ReelManifest)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  public async saveReel(reel: ReelManifest): Promise<ReelManifest> {
    const db = getFirestoreDb();
    if (!db) {
      throw new Error('Firestore is not initialized.');
    }
    const quality = { notes: buildReelQualityNotes(reel) };
    const next: ReelManifest = {
      ...reel,
      quality,
      updatedAt: new Date().toISOString(),
      version: reel.version + 1,
    };
    await setDoc(doc(db, 'reels', reel.id), next);
    return next;
  }
}
