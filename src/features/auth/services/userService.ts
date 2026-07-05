import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import {
  buildDefaultUserDocument,
  parseUserDocument,
  serializeUserDocument,
  type CreateUserDocumentInput,
  type FirestoreUserDocument,
} from '@/features/auth/models/UserDocumentModel';
import { type AuthRole } from '@/features/auth/types';
import { ProfileModel } from '@/features/player-profile/models/ProfileModel';

function usersCollection(db: Firestore, uid: string) {
  return doc(db, 'users', uid);
}

function profilesCollection(db: Firestore, uid: string) {
  return doc(db, 'profiles', uid);
}

export async function fetchUserDocument(uid: string): Promise<FirestoreUserDocument | null> {
  const db = getFirestoreDb();
  if (!db) {
    return null;
  }

  const snapshot = await getDoc(usersCollection(db, uid));
  if (!snapshot.exists()) {
    return null;
  }

  return parseUserDocument(uid, snapshot.data());
}

export async function ensureUserDocument(input: CreateUserDocumentInput): Promise<FirestoreUserDocument> {
  const db = getFirestoreDb();
  if (!db) {
    return buildDefaultUserDocument(input);
  }

  const existing = await fetchUserDocument(input.uid);
  if (existing) {
    return existing;
  }

  const document = buildDefaultUserDocument(input);
  await setDoc(usersCollection(db, input.uid), serializeUserDocument(document));
  return document;
}

export async function updateUserDocument(
  uid: string,
  updates: Partial<Pick<FirestoreUserDocument, 'name' | 'email' | 'role' | 'isAnonymous'>>,
): Promise<FirestoreUserDocument> {
  const db = getFirestoreDb();
  const now = new Date().toISOString();

  if (!db) {
    return buildDefaultUserDocument({ uid, ...updates });
  }

  const existing = (await fetchUserDocument(uid)) ?? buildDefaultUserDocument({ uid });
  const next: FirestoreUserDocument = {
    ...existing,
    ...updates,
    updatedAt: now,
  };

  await setDoc(usersCollection(db, uid), serializeUserDocument(next), { merge: true });
  return next;
}

export async function createGuestUserDocument(uid: string): Promise<FirestoreUserDocument> {
  const db = getFirestoreDb();

  const document = await ensureUserDocument({
    uid,
    name: 'Guest',
    role: 'guest',
    isAnonymous: true,
  });

  if (db) {
    const profileSnapshot = await getDoc(profilesCollection(db, uid));
    if (!profileSnapshot.exists()) {
      const defaultProfile = ProfileModel.getDefaultProfile(uid, '');
      defaultProfile.fullName = 'Guest Explorer';
      await setDoc(profilesCollection(db, uid), ProfileModel.toFirestore(defaultProfile));
    }
  }

  return document;
}

export async function upgradeUserDocument(
  uid: string,
  fields: { name: string; email: string; role?: AuthRole },
): Promise<FirestoreUserDocument> {
  return updateUserDocument(uid, {
    name: fields.name,
    email: fields.email,
    role: fields.role,
    isAnonymous: false,
  });
}

export async function migrateAnonymousUserData(anonymousUid: string, targetUid: string): Promise<void> {
  if (anonymousUid === targetUid) {
    return;
  }

  const db = getFirestoreDb();
  if (!db) {
    return;
  }

  const [anonymousUserSnap, anonymousProfileSnap, targetProfileSnap] = await Promise.all([
    getDoc(usersCollection(db, anonymousUid)),
    getDoc(profilesCollection(db, anonymousUid)),
    getDoc(profilesCollection(db, targetUid)),
  ]);

  if (anonymousUserSnap.exists()) {
    const anonymousData = anonymousUserSnap.data();
    await setDoc(
      usersCollection(db, targetUid),
      {
        ...anonymousData,
        uid: targetUid,
        isAnonymous: false,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  }

  if (anonymousProfileSnap.exists() && !targetProfileSnap.exists()) {
    await setDoc(profilesCollection(db, targetUid), anonymousProfileSnap.data(), { merge: true });
  }
}
