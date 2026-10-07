import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { projectDiscoverablePlayer } from '../discoveryProjection';
import { projectPassport } from '../publicPassport';

/** Re-runs the public projections after a moderation hold or media visibility change. */
export async function reprojectOwner(ownerId: string, db: Firestore = getFirestore()): Promise<void> {
  const profile = await db.collection('profiles').doc(ownerId).get();
  await projectPassport(ownerId, profile.exists ? profile.data() : undefined);
  await projectDiscoverablePlayer(ownerId);
}

const PUBLIC_FIELDS = ['visibility', 'rightsState', 'moderationState'] as const;

/** Passport videos come from media marked for the Passport, so changes there re-project it. */
export const onMediaWrittenReproject = onDocumentWritten('players/{uid}/media/{mediaId}', async (event) => {
  const before = event.data?.before.data() ?? {};
  const after = event.data?.after.data() ?? {};
  if (PUBLIC_FIELDS.every((field) => before[field] === after[field])) return;
  try {
    await reprojectOwner(event.params.uid);
  } catch (error) {
    logger.error('Media reprojection failed', { message: error instanceof Error ? error.message : 'unknown' });
    throw error;
  }
});
