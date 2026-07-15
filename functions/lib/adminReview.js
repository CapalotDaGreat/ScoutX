"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.archiveContentReport = exports.resolveVerificationRequest = exports.listAdminReviewQueue = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const firestore_1 = require("firebase-admin/firestore");
const firebase_functions_1 = require("firebase-functions");
const callableOptions_1 = require("./callableOptions");
const adminUserIdsSecret = (0, params_1.defineSecret)('ADMIN_USER_IDS');
function parseAdminUserIds(raw) {
    if (!raw?.trim()) {
        return new Set();
    }
    return new Set(raw.split(',').map((item) => item.trim()).filter(Boolean));
}
function assertAdmin(uid, adminIds) {
    if (!uid || !adminIds.has(uid)) {
        throw new https_1.HttpsError('permission-denied', 'Admin access required.');
    }
}
exports.listAdminReviewQueue = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)({ secrets: [adminUserIdsSecret] }), async (request) => {
    assertAdmin(request.auth?.uid, parseAdminUserIds(adminUserIdsSecret.value()));
    const db = (0, firestore_1.getFirestore)();
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
});
exports.resolveVerificationRequest = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)({ secrets: [adminUserIdsSecret] }), async (request) => {
    assertAdmin(request.auth?.uid, parseAdminUserIds(adminUserIdsSecret.value()));
    const data = request.data;
    if (!data.requestId || (data.status !== 'approved' && data.status !== 'rejected')) {
        throw new https_1.HttpsError('invalid-argument', 'requestId and status are required.');
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
        reviewerNote: data.reviewerNote ?? null,
        reviewedBy: request.auth?.uid,
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
            updatedAt: now,
        }, { merge: true });
    }
    firebase_functions_1.logger.info('Verification request resolved', {
        requestId: data.requestId,
        status: data.status,
        reviewer: request.auth?.uid,
    });
    return { success: true };
});
exports.archiveContentReport = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)({ secrets: [adminUserIdsSecret] }), async (request) => {
    assertAdmin(request.auth?.uid, parseAdminUserIds(adminUserIdsSecret.value()));
    const data = request.data;
    if (!data.reportId) {
        throw new https_1.HttpsError('invalid-argument', 'reportId is required.');
    }
    const db = (0, firestore_1.getFirestore)();
    await db.collection('contentReports').doc(data.reportId).set({
        reviewed: true,
        reviewerNote: data.reviewerNote ?? null,
        reviewedBy: request.auth?.uid,
        reviewedAt: new Date().toISOString(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { success: true };
});
//# sourceMappingURL=adminReview.js.map