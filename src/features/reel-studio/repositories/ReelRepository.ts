import { collection, doc, getDocs, limit, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { getFirestoreDb, isFirebaseConfiguredForProject } from '@/config/firebase';
import {
  type ReelExportErrorCode,
  type ReelExportJob,
  type ReelExportStatus,
  type ReelManifest,
} from '@/features/reel-studio/types';
import { buildReelQualityNotes } from '@/features/reel-studio/services/reelQuality';

const EXPORT_STATUSES: readonly ReelExportStatus[] = ['queued', 'rendering', 'ready', 'failed'];
const EXPORT_ERRORS: readonly ReelExportErrorCode[] = [
  'no_segments',
  'too_long',
  'missing_source',
  'invalid_clip',
  'unsupported_codec',
  'timeout',
  'render_failed',
];

export function parseReelExport(id: string, data: Record<string, unknown>): ReelExportJob | null {
  const status = EXPORT_STATUSES.find((value) => value === data.status);
  if (!status || typeof data.ownerId !== 'string' || typeof data.reelId !== 'string') return null;
  return {
    id,
    ownerId: data.ownerId,
    reelId: data.reelId,
    reelVersion: typeof data.reelVersion === 'number' ? data.reelVersion : 0,
    status,
    errorCode: EXPORT_ERRORS.find((value) => value === data.errorCode) ?? null,
    storagePath: typeof data.storagePath === 'string' ? data.storagePath : null,
    durationSec: typeof data.durationSec === 'number' ? data.durationSec : null,
    sizeBytes: typeof data.sizeBytes === 'number' ? data.sizeBytes : null,
    hasCaptions: data.hasCaptions === true,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
  };
}

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

  /** Latest render job for a reel; exports are written by the server only. */
  public subscribeToLatestExport(
    ownerId: string,
    reelId: string,
    onNext: (job: ReelExportJob | null) => void,
  ): () => void {
    const db = isFirebaseConfiguredForProject() ? getFirestoreDb() : null;
    if (!db) {
      onNext(null);
      return () => undefined;
    }
    return onSnapshot(
      query(collection(db, 'reelExports'), where('ownerId', '==', ownerId), where('reelId', '==', reelId), limit(20)),
      (snapshot) => {
        const jobs = snapshot.docs
          .map((item) => parseReelExport(item.id, item.data()))
          .filter((job): job is ReelExportJob => job !== null)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        onNext(jobs[0] ?? null);
      },
      () => onNext(null),
    );
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
