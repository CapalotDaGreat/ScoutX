"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAuthenticatedAccount = exports.accountDeletionDeps = exports.persistAppleAuthorizationCode = exports.accountDeletionSecrets = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const firebase_functions_1 = require("firebase-functions");
const callableOptions_1 = require("./callableOptions");
const deletion_1 = require("./dataRights/deletion");
const appleTokenService_1 = require("./appleTokenService");
const appleTeamIdSecret = (0, params_1.defineSecret)('APPLE_TEAM_ID');
const appleKeyIdSecret = (0, params_1.defineSecret)('APPLE_KEY_ID');
const applePrivateKeySecret = (0, params_1.defineSecret)('APPLE_PRIVATE_KEY');
/** Functions that may delete an account declare these so Sign in with Apple tokens get revoked. */
exports.accountDeletionSecrets = [appleTeamIdSecret, appleKeyIdSecret, applePrivateKeySecret];
const AUTH_PROVIDER_TOKENS_COLLECTION = 'authProviderTokens';
function requireAuthUid(uid) {
    if (!uid) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication is required.');
    }
    return uid;
}
function readSecretValue(readValue) {
    try {
        const value = readValue()?.trim();
        return value || undefined;
    }
    catch {
        return undefined;
    }
}
function loadAppleAuthSecrets() {
    const teamId = readSecretValue(() => appleTeamIdSecret.value()) ?? process.env.APPLE_TEAM_ID?.trim();
    const keyId = readSecretValue(() => appleKeyIdSecret.value()) ?? process.env.APPLE_KEY_ID?.trim();
    const privateKey = readSecretValue(() => applePrivateKeySecret.value()) ?? process.env.APPLE_PRIVATE_KEY?.trim();
    const clientId = process.env.APPLE_CLIENT_ID?.trim() || 'com.scoutx.app';
    if (!teamId || !keyId || !privateKey) {
        return null;
    }
    return { teamId, keyId, privateKey, clientId };
}
async function revokeStoredAppleTokens(uid) {
    const secrets = loadAppleAuthSecrets();
    const tokenRef = (0, firestore_1.getFirestore)().collection(AUTH_PROVIDER_TOKENS_COLLECTION).doc(uid);
    const snap = await tokenRef.get();
    if (!snap.exists) {
        return;
    }
    const data = snap.data();
    if (!secrets) {
        firebase_functions_1.logger.warn('Apple secrets missing; skipping token revoke for App Store compliance path.', {
            uid,
        });
        await tokenRef.delete().catch(() => undefined);
        return;
    }
    try {
        if (data.appleRefreshToken) {
            await (0, appleTokenService_1.revokeAppleToken)(data.appleRefreshToken, 'refresh_token', secrets);
        }
        else if (data.appleAccessToken) {
            await (0, appleTokenService_1.revokeAppleToken)(data.appleAccessToken, 'access_token', secrets);
        }
    }
    catch (error) {
        firebase_functions_1.logger.error('Failed to revoke Apple token', {
            uid,
            message: error instanceof Error ? error.message : 'unknown',
        });
    }
    finally {
        await tokenRef.delete().catch(() => undefined);
    }
}
/**
 * Exchanges a short-lived Apple authorization code for a refresh token and stores it
 * server-side for App Store Guideline 5.1.1(v) account-deletion revocation.
 */
exports.persistAppleAuthorizationCode = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)({
    secrets: [appleTeamIdSecret, appleKeyIdSecret, applePrivateKeySecret],
}), async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    const data = request.data;
    const authorizationCode = data.authorizationCode?.trim();
    if (!authorizationCode) {
        throw new https_1.HttpsError('invalid-argument', 'authorizationCode is required.');
    }
    const secrets = loadAppleAuthSecrets();
    if (!secrets) {
        firebase_functions_1.logger.warn('Apple secrets not configured; authorization code not persisted.', { uid });
        return { stored: false, reason: 'secrets-missing' };
    }
    const tokens = await (0, appleTokenService_1.exchangeAppleAuthorizationCode)(authorizationCode, secrets);
    if (!tokens.refreshToken && !tokens.accessToken) {
        throw new https_1.HttpsError('internal', 'Apple did not return tokens for the authorization code.');
    }
    await (0, firestore_1.getFirestore)()
        .collection(AUTH_PROVIDER_TOKENS_COLLECTION)
        .doc(uid)
        .set({
        providerId: 'apple.com',
        ...(tokens.refreshToken ? { appleRefreshToken: tokens.refreshToken } : {}),
        ...(tokens.accessToken ? { appleAccessToken: tokens.accessToken } : {}),
        appleUserId: data.appleUserId?.trim() || null,
        updatedAt: new Date().toISOString(),
    }, { merge: true });
    return { stored: true };
});
/** Account deletion with every step the app shows: revoke, cancel, delete, verify, complete. */
exports.accountDeletionDeps = {
    revokeProviderTokens: revokeStoredAppleTokens,
    revokeSessions: async (uid) => {
        await (0, auth_1.getAuth)().revokeRefreshTokens(uid).catch((error) => {
            if (error.code !== 'auth/user-not-found')
                throw error;
        });
    },
    deleteAuthUser: async (uid) => {
        await (0, auth_1.getAuth)().deleteUser(uid).catch((error) => {
            if (error.code !== 'auth/user-not-found')
                throw error;
        });
    },
};
/**
 * Deletes the authenticated user's account after revoking Apple tokens when applicable.
 * Resumable: calling again continues an interrupted deletion.
 */
exports.deleteAuthenticatedAccount = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)({
    secrets: [appleTeamIdSecret, appleKeyIdSecret, applePrivateKeySecret],
    timeoutSeconds: 540,
}), async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    const db = (0, firestore_1.getFirestore)();
    await (0, deletion_1.assertDeletionAuthorized)(db, uid, request.auth?.token);
    const outcome = await (0, deletion_1.runAccountDeletion)(db, uid, exports.accountDeletionDeps);
    if (outcome.status === 'failed') {
        throw new https_1.HttpsError('aborted', "We couldn't complete account deletion. Please try again.", {
            reason: 'deletion_incomplete',
            step: outcome.step,
        });
    }
    return { deleted: true };
});
//# sourceMappingURL=appleAuth.js.map