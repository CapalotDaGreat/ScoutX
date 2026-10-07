"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GUARDIAN_REVOKE_TTL_MS = exports.GUARDIAN_LINK_TTL_MS = void 0;
exports.createGuardianToken = createGuardianToken;
exports.verifyGuardianToken = verifyGuardianToken;
exports.hashToken = hashToken;
exports.hashGuardianEmail = hashGuardianEmail;
exports.maskEmail = maskEmail;
exports.isPlausibleEmail = isPlausibleEmail;
const node_crypto_1 = require("node:crypto");
exports.GUARDIAN_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
exports.GUARDIAN_REVOKE_TTL_MS = 400 * 24 * 60 * 60 * 1000;
function base64url(input) {
    return Buffer.from(input).toString('base64url');
}
function sign(secret, body) {
    return (0, node_crypto_1.createHmac)('sha256', secret).update(body).digest('base64url');
}
function createGuardianToken(secret, payload) {
    const body = base64url(JSON.stringify({ ...payload, nonce: (0, node_crypto_1.randomBytes)(16).toString('base64url') }));
    return `${body}.${sign(secret, body)}`;
}
/** Returns the payload only for an untampered, unexpired token of the expected purpose. */
function verifyGuardianToken(secret, token, purposes, now = Date.now()) {
    if (typeof token !== 'string' || token.length > 1024)
        return null;
    const [body, signature, extra] = token.split('.');
    if (!body || !signature || extra !== undefined)
        return null;
    const expected = Buffer.from(sign(secret, body));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !(0, node_crypto_1.timingSafeEqual)(expected, given))
        return null;
    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        if (typeof payload.ref !== 'string' ||
            typeof payload.exp !== 'number' ||
            typeof payload.nonce !== 'string' ||
            !purposes.includes(payload.purpose) ||
            payload.exp <= now) {
            return null;
        }
        return payload;
    }
    catch {
        return null;
    }
}
/** Only this hash is stored, so a database read never yields a usable link. */
function hashToken(token) {
    return (0, node_crypto_1.createHash)('sha256').update(token).digest('hex');
}
function hashGuardianEmail(secret, email) {
    return (0, node_crypto_1.createHmac)('sha256', secret).update(`guardian-email:${email.trim().toLowerCase()}`).digest('hex');
}
function maskEmail(email) {
    const [local, domain] = email.trim().split('@');
    if (!local || !domain)
        return '***';
    return `${local[0]}***@${domain}`;
}
function isPlausibleEmail(value) {
    return (typeof value === 'string' &&
        value.length <= 254 &&
        /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i.test(value.trim()));
}
//# sourceMappingURL=guardianToken.js.map