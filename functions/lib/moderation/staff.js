"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setStaffRole = exports.adminUserIdsSecret = void 0;
exports.parseAdminUserIds = parseAdminUserIds;
exports.staffRoleOf = staffRoleOf;
exports.assertStaff = assertStaff;
exports.writeAuditLog = writeAuditLog;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const callableOptions_1 = require("../callableOptions");
const model_1 = require("./model");
exports.adminUserIdsSecret = (0, params_1.defineSecret)('ADMIN_USER_IDS');
function parseAdminUserIds(raw) {
    if (!raw?.trim())
        return new Set();
    return new Set(raw.split(',').map((item) => item.trim()).filter(Boolean));
}
function staffRoleOf(token) {
    const role = token?.staffRole;
    return role === 'moderator' || role === 'admin' ? role : null;
}
/**
 * Staff access comes from the `staffRole` custom claim. Moderators handle reports; admin-only
 * and destructive operations additionally need `minimum: 'admin'` / `recentAuth`.
 */
function assertStaff(request, minimum, options = {}) {
    const uid = request.auth?.uid;
    const role = staffRoleOf(request.auth?.token);
    if (!uid || !role || (minimum === 'admin' && role !== 'admin')) {
        throw new https_1.HttpsError('permission-denied', 'Staff access required.');
    }
    if (options.recentAuth && !(0, model_1.isRecentAuth)(request.auth?.token.auth_time)) {
        throw new https_1.HttpsError('failed-precondition', 'Sign in again to confirm this action.');
    }
    return { uid, role };
}
/** Append-only; clients can neither read nor write adminAuditLog. */
async function writeAuditLog(db, entry) {
    await db.collection('adminAuditLog').add({
        ...entry,
        previousState: entry.previousState ?? null,
        newState: entry.newState ?? null,
        caseId: entry.caseId ?? null,
        at: new Date().toISOString(),
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
}
/**
 * Grants or revokes a staff role. Only accounts listed in the ADMIN_USER_IDS secret may call
 * it, so staff access always traces back to an operator-controlled allowlist.
 */
exports.setStaffRole = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)({ secrets: [exports.adminUserIdsSecret] }), async (request) => {
    const uid = request.auth?.uid;
    if (!uid || !parseAdminUserIds(exports.adminUserIdsSecret.value()).has(uid)) {
        throw new https_1.HttpsError('permission-denied', 'Operator access required.');
    }
    if (!(0, model_1.isRecentAuth)(request.auth?.token.auth_time)) {
        throw new https_1.HttpsError('failed-precondition', 'Sign in again to confirm this action.');
    }
    const data = (request.data ?? {});
    const targetUid = typeof data.targetUid === 'string' ? data.targetUid : '';
    const staffRole = data.staffRole === 'moderator' || data.staffRole === 'admin' ? data.staffRole : null;
    if (!targetUid || (data.staffRole !== null && staffRole === null)) {
        throw new https_1.HttpsError('invalid-argument', 'targetUid and staffRole (moderator, admin or null) are required.');
    }
    if (!(0, model_1.validReason)(data.reason)) {
        throw new https_1.HttpsError('invalid-argument', 'A reason of at least 5 characters is required.');
    }
    const auth = (0, auth_1.getAuth)();
    const user = await auth.getUser(targetUid);
    const claims = { ...(user.customClaims ?? {}) };
    const previous = staffRoleOf(claims);
    if (staffRole)
        claims.staffRole = staffRole;
    else
        delete claims.staffRole;
    await auth.setCustomUserClaims(targetUid, claims);
    await auth.revokeRefreshTokens(targetUid);
    await writeAuditLog((0, firestore_1.getFirestore)(), {
        actorId: uid,
        actorRole: 'bootstrap',
        action: 'set_staff_role',
        targetType: 'user',
        targetId: targetUid,
        previousState: previous,
        newState: staffRole,
        reason: data.reason,
    });
    return { targetUid, staffRole };
});
//# sourceMappingURL=staff.js.map