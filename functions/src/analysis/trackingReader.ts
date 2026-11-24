import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { createCallableOptions } from '../callableOptions';
import { assertCallableRateLimit } from '../security/rateLimit';
import { decodeTrackingStorage, TRACKING_STORAGE_ENCODING } from './trackingStorage';
import { MATCH_COLLECTION } from './frameAnalysis';
import { TRACKING_COLLECTION } from './trackingV3';

export function trackingReaderRequest(input: unknown): { jobId: string } {
  const d = input as Record<string, unknown> | null;
  if (!d || typeof d !== 'object' || Array.isArray(d) || Object.keys(d).some((k) => !['jobId', 'readerEncoding'].includes(k))
    || typeof d.jobId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(d.jobId)) {
    throw new HttpsError('invalid-argument', 'Invalid tracking read request.');
  }
  if (d.readerEncoding !== TRACKING_STORAGE_ENCODING) {
    throw new HttpsError('failed-precondition', 'A compatible tracking reader is required.', { reason: 'tracking_reader_upgrade_required' });
  }
  return { jobId: d.jobId };
}

/** Explicit protocol opt-in, never an account-wide/device-wide compatibility claim. */
export async function readCompatibleTracking(db: Firestore, uid: string | undefined, input: unknown) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { jobId } = trackingReaderRequest(input);
  return db.runTransaction(async (tx) => {
    const job = db.collection(MATCH_COLLECTION).doc(jobId);
    const owner = await tx.get(job);
    if (!owner.exists || owner.get('playerId') !== uid) throw new HttpsError('permission-denied', 'Analysis unavailable.');
    const [current, discovery] = await Promise.all([
      tx.get(job.collection(TRACKING_COLLECTION).doc('current')),
      tx.get(job.collection(TRACKING_COLLECTION).doc('discovery')),
    ]);
    try {
      return { readerEncoding: TRACKING_STORAGE_ENCODING,
        current: current.exists ? decodeTrackingStorage(current.data()) : null,
        discovery: discovery.exists ? decodeTrackingStorage(discovery.data()) : null };
    } catch {
      throw new HttpsError('failed-precondition', 'Tracking storage cannot be read.', { reason: 'tracking_storage_invalid' });
    }
  });
}

export const readTrackingStorageV1 = onCall(createCallableOptions({ timeoutSeconds: 30, maxInstances: 5 }), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  trackingReaderRequest(request.data);
  await assertCallableRateLimit(uid, { action: 'tracking_reader_v1', max: 1200, window: 'hour' });
  return readCompatibleTracking(getFirestore(), uid, request.data);
});
