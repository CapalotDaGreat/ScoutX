import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { createCallableOptions } from './callableOptions';
import { isTargetHeld } from './moderation/holds';

const PLAYBACK_MS = 15 * 60 * 1000;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function ownedStoragePath(uid: string, storagePath: string): boolean {
  return storagePath.startsWith(`profiles/${uid}/`) && !storagePath.includes('..');
}

type GrantDoc = {
  ownerId?: string;
  mediaId?: string;
  reelId?: string;
  granteeId?: string;
  expiresAt?: string;
};

async function grantedStoragePath(
  uid: string,
  storagePath: string,
  mediaId?: string,
  reelId?: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const snap = await getFirestore()
    .collection('mediaGrants')
    .where('granteeId', '==', uid)
    .limit(40)
    .get();

  for (const docSnap of snap.docs) {
    const grant = docSnap.data() as GrantDoc;
    if (typeof grant.expiresAt === 'string' && grant.expiresAt < now) {
      continue;
    }
    if (!grant.ownerId) {
      continue;
    }
    if (mediaId && grant.mediaId === mediaId) {
      const media = await getFirestore()
        .collection('players')
        .doc(grant.ownerId)
        .collection('media')
        .doc(mediaId)
        .get();
      const data = media.data() as
        | { storagePath?: string; moderationState?: string; rightsState?: string }
        | undefined;
      if (
        data?.storagePath === storagePath &&
        data.rightsState === 'user_confirmed' &&
        (data.moderationState ?? 'none') === 'none' &&
        ownedStoragePath(grant.ownerId, storagePath) &&
        !(await isTargetHeld('media', mediaId))
      ) {
        return true;
      }
    }
    if (reelId && grant.reelId === reelId) {
      const reel = await getFirestore().collection('reels').doc(reelId).get();
      const data = reel.data() as { ownerId?: string; coverMediaId?: string } | undefined;
      if (
        data?.ownerId === grant.ownerId &&
        ownedStoragePath(grant.ownerId, storagePath) &&
        !(await isTargetHeld('reel', reelId))
      ) {
        return true;
      }
    }
  }
  return false;
}

export const getMediaPlaybackUrl = onCall(createCallableOptions(), async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }
  const data = asRecord(request.data);
  const storagePath = typeof data?.storagePath === 'string' ? data.storagePath : '';
  const mediaId = typeof data?.mediaId === 'string' ? data.mediaId : undefined;
  const reelId = typeof data?.reelId === 'string' ? data.reelId : undefined;
  if (!storagePath || storagePath.includes('..')) {
    throw new HttpsError('invalid-argument', 'storagePath is required.');
  }

  const uid = request.auth.uid;
  const allowed =
    ownedStoragePath(uid, storagePath) || (await grantedStoragePath(uid, storagePath, mediaId, reelId));
  if (!allowed) {
    throw new HttpsError('permission-denied', 'You cannot play this media.');
  }

  try {
    const expires = Date.now() + PLAYBACK_MS;
    const [url] = await getStorage().bucket().file(storagePath).getSignedUrl({
      action: 'read',
      expires,
    });
    return { url, expiresAt: new Date(expires).toISOString() };
  } catch {
    throw new HttpsError('internal', 'Could not create a playback URL.');
  }
});

