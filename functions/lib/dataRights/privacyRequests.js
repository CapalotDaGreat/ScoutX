"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePrivacyRequest = exports.submitPrivacyRequest = exports.MAX_DETAILS_LENGTH = exports.MAX_OPEN_PRIVACY_REQUESTS = exports.PRIVACY_REQUEST_STATUSES = exports.PRIVACY_REQUEST_TYPES = void 0;
exports.isPrivacyRequestType = isPrivacyRequestType;
exports.cleanDetails = cleanDetails;
exports.selfServiceFor = selfServiceFor;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const callableOptions_1 = require("../callableOptions");
const staff_1 = require("../moderation/staff");
const retention_1 = require("./retention");
exports.PRIVACY_REQUEST_TYPES = ['access', 'correction', 'deletion', 'portability', 'objection', 'withdrawal'];
exports.PRIVACY_REQUEST_STATUSES = ['received', 'in_progress', 'completed', 'rejected'];
exports.MAX_OPEN_PRIVACY_REQUESTS = 5;
exports.MAX_DETAILS_LENGTH = 2000;
function isPrivacyRequestType(value) {
    return typeof value === 'string' && exports.PRIVACY_REQUEST_TYPES.includes(value);
}
/** Free text from the user: trimmed, control characters removed, length-capped. */
function cleanDetails(value) {
    if (typeof value !== 'string')
        return '';
    return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, exports.MAX_DETAILS_LENGTH);
}
/** Things the app already does on its own, offered alongside the request so nobody has to wait. */
function selfServiceFor(type) {
    if (type === 'access' || type === 'portability')
        return 'data_export';
    if (type === 'deletion')
        return 'account_deletion';
    if (type === 'withdrawal')
        return 'privacy_center_consents';
    if (type === 'correction')
        return 'edit_profile';
    return null;
}
exports.submitPrivacyRequest = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    const data = (request.data ?? {});
    if (!isPrivacyRequestType(data.type))
        throw new https_1.HttpsError('invalid-argument', 'Unknown request type.');
    const details = cleanDetails(data.details);
    if ((data.type === 'correction' || data.type === 'objection') && details.length < 5) {
        throw new https_1.HttpsError('invalid-argument', 'Please tell us what this request is about.', { reason: 'details_required' });
    }
    const db = (0, firestore_1.getFirestore)();
    const open = await db
        .collection('privacyRequests')
        .where('uid', '==', uid)
        .where('status', 'in', ['received', 'in_progress'])
        .get();
    if (open.size >= exports.MAX_OPEN_PRIVACY_REQUESTS) {
        throw new https_1.HttpsError('resource-exhausted', 'You already have several open requests.', { reason: 'too_many_open' });
    }
    const now = new Date();
    const ref = db.collection('privacyRequests').doc();
    await ref.set({
        id: ref.id,
        uid,
        type: data.type,
        status: 'received',
        details,
        selfService: selfServiceFor(data.type),
        createdAt: now.toISOString(),
        deadlineAt: (0, retention_1.addDays)(now, retention_1.PRIVACY_REQUEST_DEADLINE_DAYS),
        updatedAt: now.toISOString(),
        closedAt: null,
        resolution: null,
    });
    return { requestId: ref.id, deadlineAt: (0, retention_1.addDays)(now, retention_1.PRIVACY_REQUEST_DEADLINE_DAYS), selfService: selfServiceFor(data.type) };
});
/** Staff move a request forward; every change is audit-logged. */
exports.updatePrivacyRequest = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const staff = (0, staff_1.assertStaff)(request, 'admin', { recentAuth: true });
    const data = (request.data ?? {});
    const status = data.status;
    if (typeof data.requestId !== 'string' || !data.requestId)
        throw new https_1.HttpsError('invalid-argument', 'requestId is required.');
    if (status !== 'in_progress' && status !== 'completed' && status !== 'rejected') {
        throw new https_1.HttpsError('invalid-argument', 'Unknown status.');
    }
    const resolution = cleanDetails(data.resolution);
    if ((status === 'completed' || status === 'rejected') && resolution.length < 5) {
        throw new https_1.HttpsError('invalid-argument', 'A resolution note of at least 5 characters is required.');
    }
    const db = (0, firestore_1.getFirestore)();
    const ref = db.collection('privacyRequests').doc(data.requestId);
    const snap = await ref.get();
    if (!snap.exists)
        throw new https_1.HttpsError('not-found', 'Request not found.');
    const previous = String(snap.get('status'));
    if (previous === 'completed' || previous === 'rejected')
        throw new https_1.HttpsError('failed-precondition', 'This request is closed.');
    const now = new Date().toISOString();
    await ref.update({
        status,
        resolution: resolution || null,
        handledBy: staff.uid,
        updatedAt: now,
        ...(status === 'completed' || status === 'rejected' ? { closedAt: now } : {}),
    });
    await (0, staff_1.writeAuditLog)(db, {
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
//# sourceMappingURL=privacyRequests.js.map