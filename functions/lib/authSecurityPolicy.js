"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUTH_SECURITY_POLICY = void 0;
/**
 * Cloud Functions must never accept, log, persist, or return plaintext passwords.
 * Credential operations belong exclusively to Firebase Authentication on the client.
 *
 * See ../../SECURITY.md for the full ScoutX authentication security policy.
 */
exports.AUTH_SECURITY_POLICY = {
    passwordsHandledBy: 'firebase-authentication-only',
    forbiddenRequestFields: ['password', 'passwordHash', 'passwordSalt', 'credentials', 'secret'],
};
//# sourceMappingURL=authSecurityPolicy.js.map