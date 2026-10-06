import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import {
  parseDevelopmentGoal,
  parseIdentitySnapshot,
  parseTrainingSession,
  serializeDevelopmentGoal,
  serializeIdentitySnapshot,
  serializeTrainingSession,
} from '@/features/development/models/DevelopmentModels';
import {
  type DevelopmentGoal,
  type IdentitySnapshot,
  type TrainingSession,
} from '@/features/development/types';

/**
 * Owner-keyed development data:
 *   players/{uid}/developmentGoals/{goalId}
 *   players/{uid}/trainingSessions/{sessionId}
 *   players/{uid}/identitySnapshots/{snapshotId}
 *
 * All reads/writes are owner-only (enforced by rules). Scouts never read these directly;
 * anything shareable is projected server-side.
 */
export class DevelopmentRepository {
  private static instance: DevelopmentRepository | null = null;

  private constructor() {}

  public static getInstance(): DevelopmentRepository {
    if (!this.instance) {
      this.instance = new DevelopmentRepository();
    }
    return this.instance;
  }

  public newId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  public async listGoals(ownerId: string, max = 100): Promise<DevelopmentGoal[]> {
    const db = this.requireDb();
    const snapshot = await getDocs(
      query(collection(db, 'players', ownerId, 'developmentGoals'), orderBy('updatedAt', 'desc'), limit(max)),
    );
    return snapshot.docs
      .map((item) => parseDevelopmentGoal(item.id, item.data()))
      .filter((goal): goal is DevelopmentGoal => goal !== null);
  }

  public async saveGoal(goal: DevelopmentGoal): Promise<void> {
    const db = this.requireDb();
    await setDoc(doc(db, 'players', goal.ownerId, 'developmentGoals', goal.id), serializeDevelopmentGoal(goal));
  }

  public async deleteGoal(ownerId: string, goalId: string): Promise<void> {
    const db = this.requireDb();
    await deleteDoc(doc(db, 'players', ownerId, 'developmentGoals', goalId));
  }

  public async listTrainingSessions(ownerId: string, max = 100): Promise<TrainingSession[]> {
    const db = this.requireDb();
    const snapshot = await getDocs(
      query(collection(db, 'players', ownerId, 'trainingSessions'), orderBy('date', 'desc'), limit(max)),
    );
    return snapshot.docs
      .map((item) => parseTrainingSession(item.id, item.data()))
      .filter((session): session is TrainingSession => session !== null);
  }

  public async saveTrainingSession(session: TrainingSession): Promise<void> {
    const db = this.requireDb();
    await setDoc(
      doc(db, 'players', session.ownerId, 'trainingSessions', session.id),
      serializeTrainingSession(session),
    );
  }

  public async deleteTrainingSession(ownerId: string, sessionId: string): Promise<void> {
    const db = this.requireDb();
    await deleteDoc(doc(db, 'players', ownerId, 'trainingSessions', sessionId));
  }

  public async listIdentitySnapshots(ownerId: string, max = 50): Promise<IdentitySnapshot[]> {
    const db = this.requireDb();
    const snapshot = await getDocs(
      query(collection(db, 'players', ownerId, 'identitySnapshots'), orderBy('effectiveFrom', 'desc'), limit(max)),
    );
    return snapshot.docs
      .map((item) => parseIdentitySnapshot(item.id, item.data()))
      .filter((item): item is IdentitySnapshot => item !== null);
  }

  public async saveIdentitySnapshot(snapshot: IdentitySnapshot): Promise<void> {
    const db = this.requireDb();
    await setDoc(
      doc(db, 'players', snapshot.ownerId, 'identitySnapshots', snapshot.id),
      serializeIdentitySnapshot(snapshot),
    );
  }

  private requireDb(): Firestore {
    const db = getFirestoreDb();
    if (!db) {
      throw new Error('Firestore is not initialized.');
    }
    return db;
  }
}
