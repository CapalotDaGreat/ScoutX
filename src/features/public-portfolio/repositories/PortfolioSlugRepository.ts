import { doc, getDoc, runTransaction } from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import { slugifyUsername, validateUsername } from '@/features/public-portfolio/services/usernameService';

const SLUGS_COLLECTION = 'portfolioSlugs';

export class PortfolioSlugRepository {
  private static instance: PortfolioSlugRepository | null = null;

  private constructor() {}

  public static getInstance(): PortfolioSlugRepository {
    if (!this.instance) {
      this.instance = new PortfolioSlugRepository();
    }
    return this.instance;
  }

  public async resolvePlayerId(slugOrId: string): Promise<string | null> {
    const db = getFirestoreDb();
    if (!db) {
      return slugOrId;
    }

    const normalized = slugifyUsername(slugOrId);
    const slugSnap = await getDoc(doc(db, SLUGS_COLLECTION, normalized));
    if (slugSnap.exists()) {
      const playerId = slugSnap.data()?.playerId;
      return typeof playerId === 'string' ? playerId : null;
    }

    // Raw ids resolve against the public projection; private profiles are owner-only.
    const passportSnap = await getDoc(doc(db, 'publicPassports', slugOrId)).catch(() => null);
    if (passportSnap?.exists()) {
      return slugOrId;
    }

    return null;
  }

  public async claimUsername(playerId: string, rawUsername: string): Promise<string> {
    const validationError = validateUsername(rawUsername);
    if (validationError) {
      throw new Error(validationError);
    }

    const username = slugifyUsername(rawUsername);
    const db = getFirestoreDb();
    if (!db) {
      return username;
    }

    const slugRef = doc(db, SLUGS_COLLECTION, username);
    const profileRef = doc(db, 'profiles', playerId);

    await runTransaction(db, async (transaction) => {
      const slugSnap = await transaction.get(slugRef);
      if (slugSnap.exists()) {
        const ownerId = slugSnap.data()?.playerId;
        if (ownerId !== playerId) {
          throw new Error('This username is already taken.');
        }
      }

      const profileSnap = await transaction.get(profileRef);
      const previousUsername =
        profileSnap.exists() && typeof profileSnap.data()?.username === 'string'
          ? slugifyUsername(profileSnap.data()?.username as string)
          : null;

      if (previousUsername && previousUsername !== username) {
        transaction.delete(doc(db, SLUGS_COLLECTION, previousUsername));
      }

      transaction.set(
        slugRef,
        { playerId, username, updatedAt: new Date().toISOString() },
        { merge: true },
      );
      transaction.set(profileRef, { username }, { merge: true });
    });

    return username;
  }
}
