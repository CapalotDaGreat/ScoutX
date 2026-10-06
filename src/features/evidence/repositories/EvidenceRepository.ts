import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import { parseEvidenceItem, serializeEvidenceItem } from '@/features/evidence/models/EvidenceItemModel';
import { type EvidenceItem } from '@/features/evidence/types';

/**
 * Canonical store for evidence items: `players/{uid}/evidenceItems/{id}`.
 * Reads are owner-only on the client; scouts receive evidence through server projections.
 */
export class EvidenceRepository {
  private static instance: EvidenceRepository | null = null;

  private constructor() {}

  public static getInstance(): EvidenceRepository {
    if (!this.instance) {
      this.instance = new EvidenceRepository();
    }
    return this.instance;
  }

  public async listForOwner(ownerId: string, limitCount = 100): Promise<EvidenceItem[]> {
    const db = getFirestoreDb();
    if (!db) {
      return [];
    }
    const snapshot = await getDocs(
      query(
        collection(db, 'players', ownerId, 'evidenceItems'),
        orderBy('createdAt', 'desc'),
        limit(limitCount),
      ),
    );
    return snapshot.docs
      .map((docSnap) => parseEvidenceItem({ id: docSnap.id, ...docSnap.data() }))
      .filter((item): item is EvidenceItem => item !== null);
  }

  public async upsert(item: EvidenceItem): Promise<void> {
    const db = getFirestoreDb();
    if (!db) {
      throw new Error('Firestore is not configured.');
    }
    await setDoc(
      doc(db, 'players', item.ownerId, 'evidenceItems', item.id),
      serializeEvidenceItem(item),
      { merge: true },
    );
  }

  public async remove(ownerId: string, evidenceId: string): Promise<void> {
    const db = getFirestoreDb();
    if (!db) {
      return;
    }
    await deleteDoc(doc(db, 'players', ownerId, 'evidenceItems', evidenceId));
  }
}
