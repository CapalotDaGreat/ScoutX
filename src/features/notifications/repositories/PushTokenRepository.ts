import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';

const COLLECTION = 'pushTokens';

export class PushTokenRepository {
  private static instance: PushTokenRepository | null = null;

  private constructor() {}

  public static getInstance(): PushTokenRepository {
    if (!this.instance) {
      this.instance = new PushTokenRepository();
    }
    return this.instance;
  }

  public async saveToken(userId: string, token: string): Promise<void> {
    const db = getFirestoreDb();
    if (!db) {
      return;
    }

    await setDoc(
      doc(db, COLLECTION, userId),
      {
        token,
        userId,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  }

  public async hasRegisteredToken(userId: string): Promise<boolean> {
    const db = getFirestoreDb();
    if (!db) {
      return false;
    }

    const snapshot = await getDoc(doc(db, COLLECTION, userId));
    if (!snapshot.exists()) {
      return false;
    }

    const token = snapshot.data()?.token;
    return typeof token === 'string' && token.length > 0;
  }

  public async clearToken(userId: string): Promise<void> {
    const db = getFirestoreDb();
    if (!db) {
      return;
    }

    await setDoc(
      doc(db, COLLECTION, userId),
      {
        token: null,
        userId,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  }
}
