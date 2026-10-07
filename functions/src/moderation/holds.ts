import { randomUUID } from 'node:crypto';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { holdKey, type HoldState, type ReportTargetType } from './model';

/** Holds on any of these keys take the whole public profile offline. */
export function accountHoldKeys(uid: string): string[] {
  return [holdKey('user', uid), holdKey('passport', uid), holdKey('scout', uid)];
}

export async function isAccountHeld(uid: string, db: Firestore = getFirestore()): Promise<boolean> {
  const snaps = await db.getAll(...accountHoldKeys(uid).map((key) => db.collection('moderationHolds').doc(key)));
  return snaps.some((snap) => snap.exists);
}

export async function isTargetHeld(
  targetType: ReportTargetType,
  targetId: string,
  db: Firestore = getFirestore(),
): Promise<boolean> {
  return (await db.collection('moderationHolds').doc(holdKey(targetType, targetId)).get()).exists;
}

/** A stored download token keeps working until rotated; rotation revokes copied public links. */
async function rotateDownloadToken(path: unknown): Promise<void> {
  if (typeof path !== 'string' || !path) return;
  try {
    await getStorage().bucket().file(path).setMetadata({ metadata: { firebaseStorageDownloadTokens: randomUUID() } });
  } catch (error) {
    logger.warn('Moderation: could not rotate download token', {
      message: error instanceof Error ? error.message : 'unknown',
    });
  }
}

type HoldInput = {
  targetType: ReportTargetType;
  targetId: string;
  ownerId: string;
  state: HoldState;
  caseId: string;
};

/** Hides a target from public projections and playback, remembering what to restore. */
export async function applyHold(input: HoldInput, db: Firestore = getFirestore()): Promise<void> {
  const now = new Date().toISOString();
  await db.collection('moderationHolds').doc(holdKey(input.targetType, input.targetId)).set({
    ...input,
    createdAt: now,
  });

  if (input.targetType === 'media') {
    const ref = db.collection('players').doc(input.ownerId).collection('media').doc(input.targetId);
    const snap = await ref.get();
    if (snap.exists) {
      const data = snap.data() ?? {};
      const alreadyHeld = typeof data.visibilityBeforeHold === 'string';
      await ref.update({
        moderationState: input.state === 'removed' ? 'removed' : 'restricted',
        rightsState: input.state === 'removed' ? 'removed' : 'restricted',
        visibility: 'private',
        ...(alreadyHeld
          ? {}
          : { visibilityBeforeHold: data.visibility ?? 'private', rightsBeforeHold: data.rightsState ?? 'unconfirmed' }),
        updatedAt: now,
      });
      await Promise.all([rotateDownloadToken(data.storagePath), rotateDownloadToken(data.thumbnailPath)]);
    }
  }
  if (input.targetType === 'reel') {
    await db.collection('reels').doc(input.targetId).set({ moderationState: input.state, updatedAt: now }, { merge: true });
  }
}

/** Lifts a hold after a dismissal or a successful appeal. */
export async function clearHold(
  targetType: ReportTargetType,
  targetId: string,
  ownerId: string,
  db: Firestore = getFirestore(),
): Promise<boolean> {
  const ref = db.collection('moderationHolds').doc(holdKey(targetType, targetId));
  const existed = (await ref.get()).exists;
  await ref.delete();

  if (targetType === 'media') {
    const mediaRef = db.collection('players').doc(ownerId).collection('media').doc(targetId);
    const snap = await mediaRef.get();
    if (snap.exists) {
      const data = snap.data() ?? {};
      await mediaRef.update({
        moderationState: 'none',
        rightsState: typeof data.rightsBeforeHold === 'string' ? data.rightsBeforeHold : 'unconfirmed',
        visibility: typeof data.visibilityBeforeHold === 'string' ? data.visibilityBeforeHold : 'private',
        visibilityBeforeHold: null,
        rightsBeforeHold: null,
        updatedAt: new Date().toISOString(),
      });
    }
  }
  if (targetType === 'reel') {
    await db.collection('reels').doc(targetId).set({ moderationState: 'none' }, { merge: true });
  }
  return existed;
}
