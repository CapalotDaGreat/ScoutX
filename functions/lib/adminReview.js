"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveVerificationRequest = exports.listAdminReviewQueue = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const firebase_functions_1 = require("firebase-functions");
const callableOptions_1 = require("./callableOptions");
const model_1 = require("./moderation/model");
const staff_1 = require("./moderation/staff");
/** Verification queue. Reports are handled as moderation cases via listModerationQueue. */
exports.listAdminReviewQueue = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    (0, staff_1.assertStaff)(request, 'admin');
    const snapshot = await (0, firestore_1.getFirestore)()
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
exports.resolveVerificationRequest = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const staff = (0, staff_1.assertStaff)(request, 'admin');
    const data = request.data;
    if (!data.requestId || (data.status !== 'approved' && data.status !== 'rejected')) {
        throw new https_1.HttpsError('invalid-argument', 'requestId and status are required.');
    }
    if (!(0, model_1.validReason)(data.reviewerNote)) {
        throw new https_1.HttpsError('invalid-argument', 'A reviewer note of at least 5 characters is required.');
    }
    const db = (0, firestore_1.getFirestore)();
    const requestRef = db.collection('verificationRequests').doc(data.requestId);
    const requestSnap = await requestRef.get();
    if (!requestSnap.exists) {
        throw new https_1.HttpsError('not-found', 'Verification request not found.');
    }
    const requestData = requestSnap.data();
    const now = new Date().toISOString();
    await requestRef.set({
        status: data.status,
        reviewerNote: data.reviewerNote,
        reviewedBy: staff.uid,
        updatedAt: now,
    }, { merge: true });
    if (requestData.entityType === 'player' && requestData.entityId) {
        await db
            .collection('verificationStates')
            .doc(`player-${requestData.entityId}`)
            .set({
            entityId: requestData.entityId,
            entityType: 'player',
            level: data.status === 'approved' ? 'verified' : 'basic',
            verifiedAt: data.status === 'approved' ? now : null,
            'dimensions.identity': data.status === 'approved' ? 'verified' : 'basic',
            updatedAt: now,
        }, { merge: true });
    }
    await (0, staff_1.writeAuditLog)(db, {
        actorId: staff.uid,
        actorRole: staff.role,
        action: `verification_${data.status}`,
        targetType: 'verificationRequest',
        targetId: data.requestId,
        previousState: requestData.status ?? null,
        newState: data.status,
        reason: data.reviewerNote,
    });
    firebase_functions_1.logger.info('Verification request resolved', { requestId: data.requestId, status: data.status });
    return { success: true };
});
//# sourceMappingURL=adminReview.js.map