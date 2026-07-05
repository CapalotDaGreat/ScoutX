import { doc, getDoc, type DocumentSnapshot, type Firestore } from 'firebase/firestore';

/**
 * Resolves a stored document id into a snapshot for Firestore `startAfter` pagination.
 */
export async function resolveQueryCursor(
  db: Firestore,
  collectionPath: string,
  cursorId: string | null,
): Promise<DocumentSnapshot | null> {
  if (!cursorId) {
    return null;
  }

  const snapshot = await getDoc(doc(db, collectionPath, cursorId));
  return snapshot.exists() ? snapshot : null;
}
