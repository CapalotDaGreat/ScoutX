import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { createCallableOptions } from '../callableOptions';
import { assertStaff, writeAuditLog } from '../moderation/staff';
import { PRIVACY_REQUEST_DEADLINE_DAYS, addDays } from './retention';

export const PRIVACY_REQUEST_TYPES = ['access', 'correction', 'deletion', 'portability', 'objection', 'withdrawal'] as const;
export type PrivacyRequestType = (typeof PRIVACY_REQUEST_TYPES)[number];

export const PRIVACY_REQUEST_STATUSES = ['received', 'in_progress', 'completed', 'rejected'] as const;
export type PrivacyRequestStatus = (typeof PRIVACY_REQUEST_STATUSES)[number];

export const MAX_OPEN_PRIVACY_REQUESTS = 5;
export const MAX_DETAILS_LENGTH = 2000;

export function isPrivacyRequestType(value: unknown): value is PrivacyRequestType {
  return typeof value === 'string' && (PRIVACY_REQUEST_TYPES as readonly string[]).includes(value);
}

/** Free text from the user: trimmed, control characters removed, length-capped. */
export function cleanDetails(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, MAX_DETAILS_LENGTH);
}

/** Things the app already does on its own, offered alongside the request so nobody has to wait. */
export function selfServiceFor(type: PrivacyRequestType): string | null {
  if (type === 'access' || type === 'portability') return 'data_export';
  if (type === 'deletion') return 'account_deletion';
  if (type === 'withdrawal') return 'privacy_center_consents';
  if (type === 'correction') return 'edit_profile';
  return null;
}

export const submitPrivacyRequest = onCall(createCallableOptions(), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const data = (request.data ?? {}) as { type?: unknown; details?: unknown };
  if (!isPrivacyRequestType(data.type)) throw new HttpsError('invalid-argument', 'Unknown request type.');
  const details = cleanDetails(data.details);
  if ((data.type === 'correction' || data.type === 'objection') && details.length < 5) {
    throw new HttpsError('invalid-argument', 'Please tell us what this request is about.', { reason: 'details_required' });
  }

  const db = getFirestore();
  const open = await db
    .collection('privacyRequests')
    .where('uid', '==', uid)
    .where('status', 'in', ['received', 'in_progress'])
    .get();
  if (open.size >= MAX_OPEN_PRIVACY_REQUESTS) {
    throw new HttpsError('resource-exhausted', 'You already have several open requests.', { reason: 'too_many_open' });
  }

  const now = new Date();
  const ref = db.collection('privacyRequests').doc();
  await ref.set({
    id: ref.id,
    uid,
    type: data.type,
    status: 'received' satisfies PrivacyRequestStatus,
    details,
    selfService: selfServiceFor(data.type),
    createdAt: now.toISOString(),
    deadlineAt: addDays(now, PRIVACY_REQUEST_DEADLINE_DAYS),
    updatedAt: now.toISOString(),
    closedAt: null,
    resolution: null,
  });
  return { requestId: ref.id, deadlineAt: addDays(now, PRIVACY_REQUEST_DEADLINE_DAYS), selfService: selfServiceFor(data.type) };
});

/** Staff move a request forward; every change is audit-logged. */
export const updatePrivacyRequest = onCall(createCallableOptions(), async (request) => {
  const staff = assertStaff(request, 'admin', { recentAuth: true });
  const data = (request.data ?? {}) as { requestId?: unknown; status?: unknown; resolution?: unknown };
  const status = data.status;
  if (typeof data.requestId !== 'string' || !data.requestId) throw new HttpsError('invalid-argument', 'requestId is required.');
  if (status !== 'in_progress' && status !== 'completed' && status !== 'rejected') {
    throw new HttpsError('invalid-argument', 'Unknown status.');
  }
  const resolution = cleanDetails(data.resolution);
  if ((status === 'completed' || status === 'rejected') && resolution.length < 5) {
    throw new HttpsError('invalid-argument', 'A resolution note of at least 5 characters is required.');
  }
  const db = getFirestore();
  const ref = db.collection('privacyRequests').doc(data.requestId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Request not found.');
  const previous = String(snap.get('status'));
  if (previous === 'completed' || previous === 'rejected') throw new HttpsError('failed-precondition', 'This request is closed.');
  const now = new Date().toISOString();
  await ref.update({
    status,
    resolution: resolution || null,
    handledBy: staff.uid,
    updatedAt: now,
    ...(status === 'completed' || status === 'rejected' ? { closedAt: now } : {}),
  });
  await writeAuditLog(db, {
    actorId: staff.uid,
    actorRole: staff.role,
    action: `privacy_request_${status}`,
    targetType: 'privacy_request',
    targetId: data.requestId,
    previousState: previous,
    newState: status,
    reason: resolution || `Marked ${status}.`,
  });
  return { requestId: data.requestId, status };
});
