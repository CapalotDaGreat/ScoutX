import { deleteUser } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  type Firestore,
} from 'firebase/firestore';
import { getFirebaseAuth, getFirestoreDb } from '@/config/firebase';
import { mapAccountDeletionError } from '@/features/auth/services/authErrorMapping';
import { deleteAuthenticatedAccountViaCloud } from '@/features/auth/services/appleTokenPersistenceService';
import { AuthError } from '@/features/auth/types';
import { signOutFromFirebase } from '@/features/auth/services/authService';

const UID_KEYED_COLLECTIONS = [
  'users',
  'profiles',
  'pushTokens',
  'discoverablePlayers',
  'recruitmentWorkspaces',
] as const;

/** Collections the security rules let the owner delete, keyed by the owner field. */
const OWNED_QUERIES: ReadonlyArray<readonly [collectionName: string, field: string]> = [
  ['gpsSessions', 'playerId'],
  ['matchAnalysisJobs', 'playerId'],
  ['careerReplays', 'playerId'],
  ['activities', 'recipientId'],
  ['trialNotifications', 'recipientId'],
  ['trialInvitations', 'scoutId'],
  ['scoutingReports', 'scoutId'],
  ['trustRecommendations', 'authorId'],
  ['blockedUsers', 'blockerId'],
  ['portfolioSlugs', 'playerId'],
];

async function deleteOwnedQuery(
  db: Firestore,
  collectionName: string,
  field: string,
  userId: string,
): Promise<void> {
  const snapshot = await getDocs(query(collection(db, collectionName), where(field, '==', userId)));
  await Promise.allSettled(snapshot.docs.map((document) => deleteDoc(document.ref)));
}

/**
 * Best-effort fallback when the deletion Cloud Function is unreachable. Server-side
 * deletion remains the complete path (it also removes Storage files and shared records).
 */
async function deleteOwnedDocumentsLocally(userId: string): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    return;
  }

  await Promise.allSettled(
    OWNED_QUERIES.map(([collectionName, field]) =>
      deleteOwnedQuery(db, collectionName, field, userId),
    ),
  );
  await Promise.allSettled(
    UID_KEYED_COLLECTIONS.map((collectionName) => deleteDoc(doc(db, collectionName, userId))),
  );
}

/**
 * Deletes the current account.
 * Prefer Cloud Function path so Apple tokens are revoked (App Store Guideline 5.1.1(v)).
 */
export async function deleteCurrentAccount(userId: string): Promise<void> {
  const auth = getFirebaseAuth();

  if (!auth?.currentUser || auth.currentUser.uid !== userId) {
    throw new AuthError('You must be signed in to delete your account.', 'invalid-credentials');
  }

  const deletedViaCloud = await deleteAuthenticatedAccountViaCloud();
  if (deletedViaCloud) {
    try {
      await signOutFromFirebase();
    } catch {
      // Auth user may already be deleted by the Cloud Function.
    }
    return;
  }

  await deleteOwnedDocumentsLocally(userId);

  try {
    await deleteUser(auth.currentUser);
  } catch (error) {
    throw mapAccountDeletionError(error);
  }

  await signOutFromFirebase();
}
