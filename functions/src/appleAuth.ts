import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { createCallableOptions } from './callableOptions';
import { deleteAllUserData } from './accountDeletion';
import {
  exchangeAppleAuthorizationCode,
  type AppleAuthSecrets,
  revokeAppleToken,
} from './appleTokenService';

const appleTeamIdSecret = defineSecret('APPLE_TEAM_ID');
const appleKeyIdSecret = defineSecret('APPLE_KEY_ID');
const applePrivateKeySecret = defineSecret('APPLE_PRIVATE_KEY');

const AUTH_PROVIDER_TOKENS_COLLECTION = 'authProviderTokens';

type PersistAppleAuthorizationCodeRequest = {
  authorizationCode?: string;
  appleUserId?: string;
};

type StoredAppleProviderTokens = {
  appleRefreshToken?: string;
  appleAccessToken?: string;
  appleUserId?: string;
  updatedAt?: string;
};

function requireAuthUid(uid: string | undefined): string {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }
  return uid;
}

function readSecretValue(readValue: () => string): string | undefined {
  try {
    const value = readValue()?.trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

function loadAppleAuthSecrets(): AppleAuthSecrets | null {
  const teamId =
    readSecretValue(() => appleTeamIdSecret.value()) ?? process.env.APPLE_TEAM_ID?.trim();
  const keyId =
    readSecretValue(() => appleKeyIdSecret.value()) ?? process.env.APPLE_KEY_ID?.trim();
  const privateKey =
    readSecretValue(() => applePrivateKeySecret.value()) ?? process.env.APPLE_PRIVATE_KEY?.trim();
  const clientId = process.env.APPLE_CLIENT_ID?.trim() || 'com.scoutx.app';

  if (!teamId || !keyId || !privateKey) {
    return null;
  }

  return { teamId, keyId, privateKey, clientId };
}

async function revokeStoredAppleTokens(uid: string): Promise<void> {
  const secrets = loadAppleAuthSecrets();
  const tokenRef = getFirestore().collection(AUTH_PROVIDER_TOKENS_COLLECTION).doc(uid);
  const snap = await tokenRef.get();
  if (!snap.exists) {
    return;
  }

  const data = snap.data() as StoredAppleProviderTokens;
  if (!secrets) {
    logger.warn('Apple secrets missing; skipping token revoke for App Store compliance path.', {
      uid,
    });
    await tokenRef.delete().catch(() => undefined);
    return;
  }

  try {
    if (data.appleRefreshToken) {
      await revokeAppleToken(data.appleRefreshToken, 'refresh_token', secrets);
    } else if (data.appleAccessToken) {
      await revokeAppleToken(data.appleAccessToken, 'access_token', secrets);
    }
  } catch (error) {
    logger.error('Failed to revoke Apple token', {
      uid,
      message: error instanceof Error ? error.message : 'unknown',
    });
  } finally {
    await tokenRef.delete().catch(() => undefined);
  }
}

/**
 * Exchanges a short-lived Apple authorization code for a refresh token and stores it
 * server-side for App Store Guideline 5.1.1(v) account-deletion revocation.
 */
export const persistAppleAuthorizationCode = onCall(
  createCallableOptions({
    secrets: [appleTeamIdSecret, appleKeyIdSecret, applePrivateKeySecret],
  }),
  async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    const data = request.data as PersistAppleAuthorizationCodeRequest;
    const authorizationCode = data.authorizationCode?.trim();

    if (!authorizationCode) {
      throw new HttpsError('invalid-argument', 'authorizationCode is required.');
    }

    const secrets = loadAppleAuthSecrets();
    if (!secrets) {
      logger.warn('Apple secrets not configured; authorization code not persisted.', { uid });
      return { stored: false, reason: 'secrets-missing' as const };
    }

    const tokens = await exchangeAppleAuthorizationCode(authorizationCode, secrets);
    if (!tokens.refreshToken && !tokens.accessToken) {
      throw new HttpsError('internal', 'Apple did not return tokens for the authorization code.');
    }

    await getFirestore()
      .collection(AUTH_PROVIDER_TOKENS_COLLECTION)
      .doc(uid)
      .set(
        {
          providerId: 'apple.com',
          ...(tokens.refreshToken ? { appleRefreshToken: tokens.refreshToken } : {}),
          ...(tokens.accessToken ? { appleAccessToken: tokens.accessToken } : {}),
          appleUserId: data.appleUserId?.trim() || null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );

    return { stored: true as const };
  },
);

/**
 * Deletes the authenticated user's account after revoking Apple tokens when applicable.
 */
export const deleteAuthenticatedAccount = onCall(
  createCallableOptions({
    secrets: [appleTeamIdSecret, appleKeyIdSecret, applePrivateKeySecret],
  }),
  async (request) => {
    const uid = requireAuthUid(request.auth?.uid);

    await revokeStoredAppleTokens(uid);
    const { failures } = await deleteAllUserData(uid);
    if (failures.length > 0) {
      logger.warn('Account deletion completed with partial data cleanup failures', {
        uid,
        failures,
      });
    }

    try {
      await getAuth().deleteUser(uid);
    } catch (error) {
      logger.error('Failed to delete Firebase Auth user', {
        uid,
        message: error instanceof Error ? error.message : 'unknown',
      });
      throw new HttpsError('internal', 'Unable to delete authentication account.');
    }

    return { deleted: true as const };
  },
);
