import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { createCallableOptions } from './callableOptions';
import { validReason } from './moderation/model';
import { assertStaff, writeAuditLog } from './moderation/staff';

/** Verification queue. Reports are handled as moderation cases via listModerationQueue. */
export const listAdminReviewQueue = onCall(createCallableOptions(), async (request) => {
  assertStaff(request, 'admin');

  const snapshot = await getFirestore()
    .collection('verificationRequests')
    .where('status', '==', 'pending')
    .limit(50)
    .get();

  return {
    verificationRequests: snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    })),
  };
});

export const resolveVerificationRequest = onCall(createCallableOptions(), async (request) => {
  const staff = assertStaff(request, 'admin');

  const data = request.data as {
    requestId?: string;
    status?: 'approved' | 'rejected';
    reviewerNote?: string;
  };

  if (!data.requestId || (data.status !== 'approved' && data.status !== 'rejected')) {
    throw new HttpsError('invalid-argument', 'requestId and status are required.');
  }
  if (!validReason(data.reviewerNote)) {
    throw new HttpsError('invalid-argument', 'A reviewer note of at least 5 characters is required.');
  }

  const db = getFirestore();
  const requestRef = db.collection('verificationRequests').doc(data.requestId);
  const requestSnap = await requestRef.get();
  if (!requestSnap.exists) {
    throw new HttpsError('not-found', 'Verification request not found.');
  }

  const requestData = requestSnap.data() as {
    entityType?: string;
    entityId?: string;
    status?: string;
  };

  const now = new Date().toISOString();
  await requestRef.set(
    {
      status: data.status,
      reviewerNote: data.reviewerNote,
      reviewedBy: staff.uid,
      updatedAt: now,
    },
    { merge: true },
  );

  if (requestData.entityType === 'player' && requestData.entityId) {
    await db
      .collection('verificationStates')
      .doc(`player-${requestData.entityId}`)
      .set(
        {
          entityId: requestData.entityId,
          entityType: 'player',
          level: data.status === 'approved' ? 'verified' : 'basic',
          verifiedAt: data.status === 'approved' ? now : null,
          'dimensions.identity': data.status === 'approved' ? 'verified' : 'basic',
          updatedAt: now,
        },
        { merge: true },
      );
  }

  await writeAuditLog(db, {
    actorId: staff.uid,
    actorRole: staff.role,
    action: `verification_${data.status}`,
    targetType: 'verificationRequest',
    targetId: data.requestId,
    previousState: requestData.status ?? null,
    newState: data.status,
    reason: data.reviewerNote,
  });
  logger.info('Verification request resolved', { requestId: data.requestId, status: data.status });

  return { success: true };
});
