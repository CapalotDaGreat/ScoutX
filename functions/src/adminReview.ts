import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { createCallableOptions } from './callableOptions';

const adminUserIdsSecret = defineSecret('ADMIN_USER_IDS');

function parseAdminUserIds(raw: string | undefined): Set<string> {
  if (!raw?.trim()) {
    return new Set();
  }
  return new Set(raw.split(',').map((item) => item.trim()).filter(Boolean));
}

function assertAdmin(uid: string | undefined, adminIds: Set<string>): void {
  if (!uid || !adminIds.has(uid)) {
    throw new HttpsError('permission-denied', 'Admin access required.');
  }
}

export const listAdminReviewQueue = onCall(
  createCallableOptions({ secrets: [adminUserIdsSecret] }),
  async (request) => {
    assertAdmin(request.auth?.uid, parseAdminUserIds(adminUserIdsSecret.value()));

    const db = getFirestore();
    const [verificationSnapshot, reportSnapshot] = await Promise.all([
      db.collection('verificationRequests').where('status', '==', 'pending').limit(50).get(),
      db.collection('contentReports').limit(50).get(),
    ]);

    return {
      verificationRequests: verificationSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })),
      contentReports: reportSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      })),
    };
  },
);

export const resolveVerificationRequest = onCall(
  createCallableOptions({ secrets: [adminUserIdsSecret] }),
  async (request) => {
    assertAdmin(request.auth?.uid, parseAdminUserIds(adminUserIdsSecret.value()));

    const data = request.data as {
      requestId?: string;
      status?: 'approved' | 'rejected';
      reviewerNote?: string;
    };

    if (!data.requestId || (data.status !== 'approved' && data.status !== 'rejected')) {
      throw new HttpsError('invalid-argument', 'requestId and status are required.');
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
    };

    const now = new Date().toISOString();
    await requestRef.set(
      {
        status: data.status,
        reviewerNote: data.reviewerNote ?? null,
        reviewedBy: request.auth?.uid,
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
            updatedAt: now,
          },
          { merge: true },
        );
    }

    logger.info('Verification request resolved', {
      requestId: data.requestId,
      status: data.status,
      reviewer: request.auth?.uid,
    });

    return { success: true };
  },
);

export const archiveContentReport = onCall(
  createCallableOptions({ secrets: [adminUserIdsSecret] }),
  async (request) => {
    assertAdmin(request.auth?.uid, parseAdminUserIds(adminUserIdsSecret.value()));

    const data = request.data as { reportId?: string; reviewerNote?: string };
    if (!data.reportId) {
      throw new HttpsError('invalid-argument', 'reportId is required.');
    }

    const db = getFirestore();
    await db.collection('contentReports').doc(data.reportId).set(
      {
        reviewed: true,
        reviewerNote: data.reviewerNote ?? null,
        reviewedBy: request.auth?.uid,
        reviewedAt: new Date().toISOString(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return { success: true };
  },
);
