import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { createCallableOptions } from '../callableOptions';
import { assertCallableRateLimit } from '../security/rateLimit';
import { decodeTrackingStorage, TRACKING_STORAGE_ENCODING } from './trackingStorage';
import { MATCH_COLLECTION } from './frameAnalysis';
import { TRACKING_COLLECTION } from './trackingV3';

const SLOTS = ['current', 'discovery'] as const;
/** Firestore updateTime, seconds plus zero-padded nanoseconds. Not a millisecond field. */
const UPDATE_TOKEN = /^\d{1,16}\.\d{9}$/;
export type TrackingReadSlot = (typeof SLOTS)[number];
export type TrackingReaderRequest = {
  jobId: string;
  documents: TrackingReadSlot[];
  since: { current?: string; discovery?: string };
};

export function trackingUpdateToken(time: { seconds?: unknown; nanoseconds?: unknown } | null | undefined): string | null {
  if (!time || !Number.isSafeInteger(time.seconds) || (time.seconds as number) < 0
    || !Number.isSafeInteger(time.nanoseconds) || (time.nanoseconds as number) < 0 || (time.nanoseconds as number) > 999_999_999) return null;
  return `${time.seconds}.${String(time.nanoseconds).padStart(9, '0')}`;
}

function invalid(): never {
  throw new HttpsError('invalid-argument', 'Invalid tracking read request.');
}

export function trackingReaderRequest(input: unknown): TrackingReaderRequest {
  const d = input as Record<string, unknown> | null;
  if (!d || typeof d !== 'object' || Array.isArray(d) || Object.keys(d).some((key) => !['jobId', 'readerEncoding', 'documents', 'since'].includes(key))
    || typeof d.jobId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(d.jobId)) invalid();
  if (d.readerEncoding !== TRACKING_STORAGE_ENCODING) {
    throw new HttpsError('failed-precondition', 'A compatible tracking reader is required.', { reason: 'tracking_reader_upgrade_required' });
  }
  const requested = d.documents === undefined ? [...SLOTS] : d.documents;
  if (!Array.isArray(requested) || requested.length < 1 || requested.length > SLOTS.length || new Set(requested).size !== requested.length
    || requested.some((slot) => !SLOTS.includes(slot as TrackingReadSlot))) invalid();
  const documents = SLOTS.filter((slot) => requested.includes(slot));
  const since: TrackingReaderRequest['since'] = {};
  if (d.since !== undefined) {
    if (!d.since || typeof d.since !== 'object' || Array.isArray(d.since)) invalid();
    const source = d.since as Record<string, unknown>;
    if (Object.keys(source).some((key) => key !== 'current' && key !== 'discovery')) invalid();
    for (const slot of SLOTS) {
      if (source[slot] === undefined) continue;
      if (!documents.includes(slot) || typeof source[slot] !== 'string' || !UPDATE_TOKEN.test(source[slot])) invalid();
      since[slot] = source[slot];
    }
  }
  return { jobId: d.jobId, documents, since };
}

/**
 * Owner-checked snapshot of the requested tracking documents.
 * Read-only so a poll does not lock the documents the worker writes.
 * A matching Firestore updateTime returns no document body.
 */
export async function readCompatibleTracking(db: Firestore, uid: string | undefined, input: unknown) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { jobId, documents, since } = trackingReaderRequest(input);
  return db.runTransaction(async (tx) => {
    const job = db.collection(MATCH_COLLECTION).doc(jobId);
    const owner = await tx.get(job);
    if (!owner.exists || owner.get('playerId') !== uid) throw new HttpsError('permission-denied', 'Analysis unavailable.');
    const out: { readerEncoding: typeof TRACKING_STORAGE_ENCODING; current?: Record<string, unknown> | null;
      discovery?: Record<string, unknown> | null; updateTime?: { current?: string; discovery?: string };
      unchanged?: { current?: true; discovery?: true } } = { readerEncoding: TRACKING_STORAGE_ENCODING };
    const unchanged: { current?: true; discovery?: true } = {};
    const updateTime: { current?: string; discovery?: string } = {};
    for (const slot of documents) {
      const snap = await tx.get(job.collection(TRACKING_COLLECTION).doc(slot));
      if (!snap.exists) { out[slot] = null; continue; }
      const token = trackingUpdateToken(snap.updateTime);
      if (token && since[slot] === token) { unchanged[slot] = true; continue; }
      try {
        out[slot] = decodeTrackingStorage(snap.data());
      } catch {
        throw new HttpsError('failed-precondition', 'Tracking storage cannot be read.', { reason: 'tracking_storage_invalid' });
      }
      if (token) updateTime[slot] = token;
    }
    if (unchanged.current || unchanged.discovery) out.unchanged = unchanged;
    if (updateTime.current || updateTime.discovery) out.updateTime = updateTime;
    return out;
  }, { readOnly: true });
}

export const readTrackingStorageV1 = onCall(createCallableOptions({ timeoutSeconds: 30, maxInstances: 5 }), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  trackingReaderRequest(request.data);
  await assertCallableRateLimit(uid, { action: 'tracking_reader_v1', max: 1200, window: 'hour' });
  return readCompatibleTracking(getFirestore(), uid, request.data);
});
