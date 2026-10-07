import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createCallableOptions } from './callableOptions';
import { notifyEvidenceFulfilled } from './notificationProducers';
import { loadSafetyPolicy } from './safety/userSafety';
import { notifyGuardianOfScoutContact } from './safety/youthConsent';

const KINDS = ['match_footage', 'highlight', 'gps', 'statistics', 'coach_note'] as const;

function isRecruiterRole(role: unknown): boolean {
  return role === 'scout' || role === 'coach' || role === 'club' || role === 'admin';
}

export const requestEvidence = onCall(createCallableOptions(), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  if (!isRecruiterRole(request.auth?.token.role)) {
    throw new HttpsError('permission-denied', 'Recruiter role required.');
  }
  const playerId = typeof request.data?.playerId === 'string' ? request.data.playerId : '';
  const message = typeof request.data?.message === 'string' ? request.data.message.slice(0, 500) : '';
  const kinds = Array.isArray(request.data?.kinds)
    ? request.data.kinds.filter((item: unknown): item is (typeof KINDS)[number] =>
        typeof item === 'string' && (KINDS as readonly string[]).includes(item),
      )
    : [];
  if (!playerId || playerId === uid) {
    throw new HttpsError('invalid-argument', 'A different player id is required.');
  }
  if (kinds.length === 0) {
    throw new HttpsError('invalid-argument', 'Select at least one evidence kind.');
  }
  const listing = await getFirestore().collection('discoverablePlayers').doc(playerId).get();
  if (!listing.exists) {
    throw new HttpsError('not-found', 'This player is not discoverable.');
  }
  const db = getFirestore();
  const policy = await loadSafetyPolicy(playerId, db);
  if (!policy.canReceiveScoutContact) {
    throw new HttpsError('failed-precondition', 'This player cannot receive scout requests.');
  }
  const blocked = await db
    .collection('blockedUsers')
    .where('blockerId', '==', playerId)
    .where('blockedUserId', '==', uid)
    .limit(1)
    .get();
  if (!blocked.empty) {
    // Do not reveal the block; the request is simply not delivered.
    return { id: null, status: 'pending' };
  }
  const now = new Date().toISOString();
  const ref = db.collection('evidenceRequests').doc();
  const batch = db.batch();
  batch.set(ref, {
    scoutId: uid,
    playerId,
    kinds,
    message,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });
  // Server-authored, fixed copy: the scout's free-text message never reaches the lock screen.
  batch.set(db.collection('activities').doc(`evidence-request-${ref.id}`), {
    recipientId: playerId,
    recipientRole: 'player',
    type: 'evidence_requested',
    category: 'scouting',
    title: 'Evidence requested',
    body: 'A scout asked for more evidence. Open your requests in ScoutX to respond.',
    actorId: 'system',
    actorName: 'ScoutX',
    actorRole: 'system',
    reference: { entityType: 'evidence_request', entityId: ref.id, label: 'Evidence request' },
    read: false,
    createdAt: now,
  });
  await batch.commit();
  if (policy.isMinor) {
    await notifyGuardianOfScoutContact(db, playerId);
  }
  return { id: ref.id, status: 'pending' };
});

export const ATTACHMENT_KINDS = ['match', 'media', 'analysis', 'gps'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];
export type Attachment = { kind: AttachmentKind; id: string };

const MAX_ATTACHMENTS = 10;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function parseAttachments(value: unknown): Attachment[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ATTACHMENTS) {
    return null;
  }
  const out: Attachment[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
    const kind = row?.kind;
    const id = row?.id;
    if (
      typeof kind !== 'string' ||
      !(ATTACHMENT_KINDS as readonly string[]).includes(kind) ||
      typeof id !== 'string' ||
      !ID_PATTERN.test(id)
    ) {
      return null;
    }
    const key = `${kind}:${id}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ kind: kind as AttachmentKind, id });
    }
  }
  return out;
}

async function ownsAttachment(uid: string, attachment: Attachment): Promise<boolean> {
  const db = getFirestore();
  switch (attachment.kind) {
    case 'match': {
      const sub = await db.collection('players').doc(uid).collection('matches').doc(attachment.id).get();
      if (sub.exists) return true;
      const profile = await db.collection('profiles').doc(uid).get();
      const matches = profile.get('statisticsMatches');
      return (
        Array.isArray(matches) &&
        matches.some((match: unknown) => {
          const row = match && typeof match === 'object' ? (match as Record<string, unknown>) : null;
          return row?.id === attachment.id;
        })
      );
    }
    case 'media': {
      const media = await db.collection('players').doc(uid).collection('media').doc(attachment.id).get();
      return media.exists && media.get('uploadState') !== 'failed';
    }
    case 'analysis': {
      const job = await db.collection('matchAnalysisJobs').doc(attachment.id).get();
      return job.exists && job.get('playerId') === uid && job.get('status') === 'complete';
    }
    case 'gps': {
      const session = await db.collection('gpsSessions').doc(attachment.id).get();
      return session.exists && session.get('playerId') === uid;
    }
  }
}

/**
 * Player answers a scout's evidence request with items they own. Ownership of every attachment
 * is checked server-side; the scout is notified with fixed copy.
 */
export const fulfillEvidenceRequest = onCall(createCallableOptions(), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const requestId = typeof request.data?.requestId === 'string' ? request.data.requestId : '';
  if (!ID_PATTERN.test(requestId)) {
    throw new HttpsError('invalid-argument', 'A request id is required.');
  }
  const attachments = parseAttachments(request.data?.attachments);
  if (!attachments) {
    throw new HttpsError('invalid-argument', `Attach between 1 and ${MAX_ATTACHMENTS} items.`);
  }
  const note = typeof request.data?.note === 'string' ? request.data.note.slice(0, 500) : '';

  const db = getFirestore();
  const ref = db.collection('evidenceRequests').doc(requestId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.get('playerId') !== uid) {
    throw new HttpsError('not-found', 'Request not found.');
  }
  if (snapshot.get('status') !== 'pending') {
    throw new HttpsError('failed-precondition', 'This request is no longer open.');
  }
  for (const attachment of attachments) {
    if (!(await ownsAttachment(uid, attachment))) {
      throw new HttpsError('permission-denied', 'You can only attach your own items.');
    }
  }

  const now = new Date().toISOString();
  await ref.update({
    status: 'fulfilled',
    response: { attachments, note, fulfilledAt: now },
    updatedAt: now,
  });
  const scoutId = snapshot.get('scoutId');
  if (typeof scoutId === 'string') {
    await notifyEvidenceFulfilled(db, scoutId, uid, requestId);
  }
  return { id: requestId, status: 'fulfilled' as const };
});
