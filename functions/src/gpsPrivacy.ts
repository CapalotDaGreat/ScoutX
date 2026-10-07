import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { createCallableOptions } from './callableOptions';

/** Fields written by builds that stored location; none may remain on a session document. */
export const LEGACY_GPS_FIELDS = ['pointsStorageKey', 'heatmap.bounds'] as const;

/**
 * Removes location data written before GPS processing moved fully on-device: every
 * `gpsSessions/{uid}/...` object (raw point tracks) and coordinate fields on the caller's
 * session documents. Idempotent; safe to call repeatedly.
 */
export const purgeLegacyGpsLocation = onCall(createCallableOptions(), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const db = getFirestore();
  const sessions = await db.collection('gpsSessions').where('playerId', '==', uid).get();
  let documentsCleaned = 0;
  let batch = db.batch();
  let pending = 0;
  for (const session of sessions.docs) {
    const data = session.data();
    const heatmap = data.heatmap as Record<string, unknown> | undefined;
    if (!('pointsStorageKey' in data) && !(heatmap && 'bounds' in heatmap)) {
      continue;
    }
    batch.update(session.ref, {
      pointsStorageKey: FieldValue.delete(),
      'heatmap.bounds': FieldValue.delete(),
    });
    documentsCleaned += 1;
    pending += 1;
    if (pending === 400) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending > 0) {
    await batch.commit();
  }

  let filesDeleted = 0;
  try {
    const [files] = await getStorage().bucket().getFiles({ prefix: `gpsSessions/${uid}/` });
    await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));
    filesDeleted = files.length;
  } catch (error) {
    logger.error('Legacy GPS file purge failed', { uid, error: String(error) });
    throw new HttpsError('internal', 'Could not remove stored GPS files. Try again later.');
  }

  logger.info('Legacy GPS location purged', { uid, documentsCleaned, filesDeleted });
  return { documentsCleaned, filesDeleted };
});
