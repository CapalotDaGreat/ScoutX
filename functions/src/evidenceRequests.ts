import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createCallableOptions } from './callableOptions';

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
  const now = new Date().toISOString();
  const ref = getFirestore().collection('evidenceRequests').doc();
  await ref.set({
    scoutId: uid,
    playerId,
    kinds,
    message,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });
  return { id: ref.id, status: 'pending' };
});
