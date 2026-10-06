import { collection, doc, setDoc } from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import { type MediaGrant } from '@/features/media-library/types';

export async function shareMediaWithScout(input: {
  ownerId: string;
  granteeId: string;
  mediaId?: string;
  reelId?: string;
  expiresAt: string;
}): Promise<MediaGrant> {
  const db = getFirestoreDb();
  if (!db) {
    throw new Error('Firestore is not initialized.');
  }
  if (!input.granteeId.trim() || input.granteeId === input.ownerId) {
    throw new Error('Pick a scout to share with.');
  }
  const id = `grant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const grant: MediaGrant = {
    id,
    ownerId: input.ownerId,
    mediaId: input.mediaId,
    reelId: input.reelId,
    granteeId: input.granteeId.trim(),
    expiresAt: input.expiresAt,
    createdAt: new Date().toISOString(),
  };
  await setDoc(doc(collection(db, 'mediaGrants'), id), grant);
  return grant;
}
