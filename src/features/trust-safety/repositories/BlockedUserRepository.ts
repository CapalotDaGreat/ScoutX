import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import { BLOCKED_USERS_COLLECTION } from '@/features/trust-safety/constants';
import {
  loadLocalBlockedUsers,
  removeLocalBlockedUser,
  saveLocalBlockedUser,
} from '@/features/trust-safety/services/blockStorage';
import { type BlockedUser } from '@/features/trust-safety/types';

function parseBlockedUser(data: Record<string, unknown>, _id: string): BlockedUser | null {
  if (typeof data.blockerId !== 'string' || typeof data.blockedUserId !== 'string') {
    return null;
  }

  if (data.active === false) {
    return null;
  }

  return {
    blockerId: data.blockerId,
    blockedUserId: data.blockedUserId,
    blockedUserName: typeof data.blockedUserName === 'string' ? data.blockedUserName : 'User',
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
    active: true,
  };
}

export class BlockedUserRepository {
  private static instance: BlockedUserRepository | null = null;

  private constructor() {}

  public static getInstance(): BlockedUserRepository {
    if (!this.instance) {
      this.instance = new BlockedUserRepository();
    }
    return this.instance;
  }

  public async fetchBlockedUsers(blockerId: string): Promise<BlockedUser[]> {
    const db = getFirestoreDb();

    if (!db) {
      return loadLocalBlockedUsers(blockerId);
    }

      const blockedQuery = query(
        collection(db, BLOCKED_USERS_COLLECTION),
        where('blockerId', '==', blockerId),
        where('active', '==', true),
      );
      const snapshot = await getDocs(blockedQuery);
      return snapshot.docs
        .map((document) => parseBlockedUser(document.data(), document.id))
        .filter((entry): entry is BlockedUser => entry !== null);
  }

  public async blockUser(
    blockerId: string,
    blockedUserId: string,
    blockedUserName: string,
  ): Promise<BlockedUser> {
    const entry: BlockedUser = {
      blockerId,
      blockedUserId,
      blockedUserName,
      createdAt: new Date().toISOString(),
      active: true,
    };

    const db = getFirestoreDb();
    const docId = `${blockerId}_${blockedUserId}`;

    if (db) {
        await setDoc(doc(db, BLOCKED_USERS_COLLECTION, docId), entry);
        return entry;
    }

    await saveLocalBlockedUser(blockerId, entry);
    return entry;
  }

  public async unblockUser(blockerId: string, blockedUserId: string): Promise<void> {
    const db = getFirestoreDb();
    const docId = `${blockerId}_${blockedUserId}`;

    if (db) {
        await setDoc(doc(db, BLOCKED_USERS_COLLECTION, docId), { active: false }, { merge: true });
        return;
    }

    await removeLocalBlockedUser(blockerId, blockedUserId);
  }
}
