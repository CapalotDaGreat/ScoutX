"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readAppleAuthSecretsFromEnv = readAppleAuthSecretsFromEnv;
exports.createAppleClientSecret = createAppleClientSecret;
exports.exchangeAppleAuthorizationCode = exchangeAppleAuthorizationCode;
exports.revokeAppleToken = revokeAppleToken;
const jose_1 = require("jose");
const firebase_functions_1 = require("firebase-functions");
const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const APPLE_AUD = 'https://appleid.apple.com';
function normalizePrivateKey(raw) {
    const trimmed = raw.trim();
    if (trimmed.includes('BEGIN PRIVATE KEY')) {
        return trimmed.replace(/\\n/g, '\n');
    }
    return `-----BEGIN PRIVATE KEY-----\n${trimmed.replace(/\s+/g, '\n')}\n-----END PRIVATE KEY-----`;
}
function readAppleAuthSecretsFromEnv() {
    const teamId = process.env.APPLE_TEAM_ID?.trim();
    const keyId = process.env.APPLE_KEY_ID?.trim();
    const privateKey = process.env.APPLE_PRIVATE_KEY?.trim();
    const clientId = process.env.APPLE_CLIENT_ID?.trim() || 'com.scoutx.app';
    if (!teamId || !keyId || !privateKey) {
        return null;
    }
    return { teamId, keyId, privateKey, clientId };
}
async function createAppleClientSecret(secrets) {
    const key = await (0, jose_1.importPKCS8)(normalizePrivateKey(secrets.privateKey), 'ES256');
    const now = Math.floor(Date.now() / 1000);
    return new jose_1.SignJWT({})
        .setProtectedHeader({ alg: 'ES256', kid: secrets.keyId })
        .setIssuer(secrets.teamId)
        .setIssuedAt(now)
        .setExpirationTime(now + 60 * 60 * 24 * 180)
        .setAudience(APPLE_AUD)
        .setSubject(secrets.clientId)
        .sign(key);
}
async function postAppleForm(url, body) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(body).toString(),
    });
    const text = await response.text();
    let parsed = {};
    try {
        parsed = JSON.parse(text);
    }
    catch {
        parsed = { raw: text };
    }
    if (!response.ok) {
        firebase_functions_1.logger.warn('Apple auth HTTP error', {
            url,
            status: response.status,
            error: parsed.error ?? null,
        });
        throw new Error(typeof parsed.error === 'string'
            ? `Apple auth error: ${parsed.error}`
            : `Apple auth HTTP ${response.status}`);
    }
    return parsed;
}
async function exchangeAppleAuthorizationCode(authorizationCode, secrets) {
    const clientSecret = await createAppleClientSecret(secrets);
    const payload = await postAppleForm(APPLE_TOKEN_URL, {
        client_id: secrets.clientId,
        client_secret: clientSecret,
        code: authorizationCode,
        grant_type: 'authorization_code',
    });
    return {
        refreshToken: typeof payload.refresh_token === 'string' ? payload.refresh_token : null,
        accessToken: typeof payload.access_token === 'string' ? payload.access_token : null,
        idToken: typeof payload.id_token === 'string' ? payload.id_token : null,
    };
}
async function revokeAppleToken(token, tokenTypeHint, secrets) {
    const clientSecret = await createAppleClientSecret(secrets);
    await postAppleForm(APPLE_REVOKE_URL, {
        client_id: secrets.clientId,
        client_secret: clientSecret,
        token,
        token_type_hint: tokenTypeHint,
    });
}
//# sourceMappingURL=appleTokenService.js.map