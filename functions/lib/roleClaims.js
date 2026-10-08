"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.confirmRole = void 0;
const https_1 = require("firebase-functions/v2/https");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const firebase_functions_1 = require("firebase-functions");
const callableOptions_1 = require("./callableOptions");
const userSafety_1 = require("./safety/userSafety");
const SELF_SERVICE_ROLES = ['player', 'scout', 'coach'];
/** Roles that require a real (non-anonymous) sign-in before they can be claimed. */
const NON_ANONYMOUS_ROLES = ['scout', 'coach'];
function isSelfServiceRole(value) {
    return typeof value === 'string' && SELF_SERVICE_ROLES.includes(value);
}
/**
 * Confirms the caller's role and mirrors it into a custom auth claim so Firestore and
 * Storage rules can trust `request.auth.token.role` instead of a client-written document.
 *
 * - The role is chosen once. A second call with a different role is rejected once the
 *   users document is marked `roleConfirmed`.
 * - Scout and coach roles require a non-anonymous sign-in.
 * - `club` / `admin` are never self-assignable.
 */
exports.confirmRole = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError('unauthenticated', 'Sign in required to confirm a role.');
    }
    const requested = request.data?.role;
    if (!isSelfServiceRole(requested)) {
        throw new https_1.HttpsError('invalid-argument', 'Role must be one of player, scout or coach.');
    }
    const signInProvider = request.auth?.token.firebase?.sign_in_provider;
    if (NON_ANONYMOUS_ROLES.includes(requested) && signInProvider === 'anonymous') {
        throw new https_1.HttpsError('failed-precondition', 'Create an account before choosing the scout or coach role.');
    }
    const db = (0, firestore_1.getFirestore)();
    if (requested !== 'player' && !(await (0, userSafety_1.loadSafetyPolicy)(uid, db)).canChooseNonPlayerRole) {
        throw new https_1.HttpsError('failed-precondition', 'Accounts for children under 13 can only use the player role.', {
            reason: 'child_player_only',
        });
    }
    const userRef = db.collection('users').doc(uid);
    const now = new Date().toISOString();
    await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(userRef);
        const existing = (snapshot.data() ?? {});
        if (existing.roleConfirmed === true && existing.role && existing.role !== requested) {
            throw new https_1.HttpsError('failed-precondition', 'Your role has already been confirmed and cannot be changed from the app.');
        }
        transaction.set(userRef, {
            uid,
            role: requested,
            roleConfirmed: true,
            isAnonymous: signInProvider === 'anonymous',
            roleClaimSyncedAt: now,
            updatedAt: now,
            ...(snapshot.exists ? {} : { createdAt: now }),
        }, { merge: true });
    });
    const auth = (0, auth_1.getAuth)();
    const userRecord = await auth.getUser(uid);
    const currentClaims = userRecord.customClaims ?? {};
    if (currentClaims.role !== requested) {
        await auth.setCustomUserClaims(uid, { ...currentClaims, role: requested });
    }
    firebase_functions_1.logger.info('Role confirmed', { uid, role: requested });
    return { role: requested, claimUpdated: currentClaims.role !== requested };
});
//# sourceMappingURL=roleClaims.js.map