import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import { type ClubProfile, type ClubProfileDraft } from '@/features/club-profiles/types';

const COLLECTION = 'clubProfiles';

function slugifyClubName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export class ClubProfileRepository {
  private static instance: ClubProfileRepository | null = null;

  private constructor() {}

  public static getInstance(): ClubProfileRepository {
    if (!this.instance) {
      this.instance = new ClubProfileRepository();
    }
    return this.instance;
  }

  public async fetchByClubName(clubName: string): Promise<ClubProfile | null> {
    const db = getFirestoreDb();
    if (!db || !clubName.trim()) {
      return null;
    }

    const clubId = slugifyClubName(clubName);
    const snapshot = await getDoc(doc(db, COLLECTION, clubId));
    if (!snapshot.exists()) {
      return null;
    }

    const data = snapshot.data();
    return {
      id: clubId,
      name: typeof data.name === 'string' ? data.name : clubName,
      league: typeof data.league === 'string' ? data.league : '',
      country: typeof data.country === 'string' ? data.country : '',
      logoUrl: typeof data.logoUrl === 'string' ? data.logoUrl : '',
      website: typeof data.website === 'string' ? data.website : '',
      discoverablePlayerCount:
        typeof data.discoverablePlayerCount === 'number' ? data.discoverablePlayerCount : 0,
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
    };
  }

  public async upsertClubProfile(ownerId: string, draft: ClubProfileDraft): Promise<ClubProfile> {
    const db = getFirestoreDb();
    const clubId = slugifyClubName(draft.name);
    const now = new Date().toISOString();
    const profile: ClubProfile = {
      id: clubId,
      name: draft.name,
      league: draft.league,
      country: draft.country,
      logoUrl: draft.logoUrl ?? '',
      website: draft.website ?? '',
      discoverablePlayerCount: 0,
      updatedAt: now,
    };

    if (!db) {
      return profile;
    }

    await setDoc(
      doc(db, COLLECTION, clubId),
      {
        ...profile,
        ownerId,
      },
      { merge: true },
    );

    return profile;
  }
}
