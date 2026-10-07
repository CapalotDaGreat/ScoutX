"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DAY_MS = exports.PRIVACY_REQUEST_DEADLINE_DAYS = exports.RETENTION = void 0;
exports.addDays = addDays;
exports.olderThan = olderThan;
/**
 * Central retention periods (days). Every scheduled cleanup and every legal-retention record
 * reads from here, and docs/privacy/retention-matrix.md mirrors it.
 *
 * The legal-hold periods are proposals pending legal review (LEGAL_REVIEW_REQUIRED); the
 * operational periods are product decisions.
 */
exports.RETENTION = {
    /** Data export archives and their download links. */
    exportDays: 7,
    /** Rejected, expired or cancelled upload records (bytes are deleted immediately on rejection). */
    failedUploadDays: 7,
    /** Cancelled, expired or failed analysis jobs, with their frames and video. */
    abandonedJobDays: 30,
    /** RevenueCat webhook receipts, kept only to make deliveries idempotent. */
    webhookReceiptDays: 90,
    /** Closed privacy requests (proof that a request was answered). LEGAL_REVIEW_REQUIRED */
    privacyRequestDays: 3 * 365,
    /** Consent proof after account deletion. LEGAL_REVIEW_REQUIRED */
    consentProofDays: 3 * 365,
    /** Moderation decisions about a deleted account. LEGAL_REVIEW_REQUIRED */
    moderationDecisionDays: 2 * 365,
    /** Proof that an account deletion was carried out. LEGAL_REVIEW_REQUIRED */
    deletionReceiptDays: 3 * 365,
};
/** Statutory reply window for access/deletion requests (GDPR Art. 12(3): one month; FADP: 30 days). */
exports.PRIVACY_REQUEST_DEADLINE_DAYS = 30;
exports.DAY_MS = 24 * 60 * 60 * 1000;
function addDays(from, days) {
    return new Date(from.getTime() + days * exports.DAY_MS).toISOString();
}
function olderThan(now, days) {
    return new Date(now.getTime() - days * exports.DAY_MS).toISOString();
}
//# sourceMappingURL=retention.js.map