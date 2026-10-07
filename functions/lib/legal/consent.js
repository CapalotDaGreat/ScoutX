"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordConsent = exports.REQUIRED_CONSENT_TYPES = exports.CONSENT_DOCUMENTS = void 0;
exports.isConsentType = isConsentType;
exports.majorVersion = majorVersion;
exports.isConsentCurrent = isConsentCurrent;
exports.hasCurrentConsent = hasCurrentConsent;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const callableOptions_1 = require("../callableOptions");
const legalVersions_generated_1 = require("./legalVersions.generated");
/** Consent type to the document whose version is recorded with it. */
exports.CONSENT_DOCUMENTS = {
    terms_of_service: 'terms-of-service',
    privacy_policy: 'privacy-policy',
    community_guidelines: 'community-guidelines',
    ai_analysis: 'ai-use-policy',
    media_upload: 'video-recording-policy',
};
/** Required consents can only be withdrawn by deleting the account. */
exports.REQUIRED_CONSENT_TYPES = [
    'terms_of_service',
    'privacy_policy',
    'community_guidelines',
];
const LOCALES = ['en', 'de', 'fr', 'es', 'it', 'nl', 'pt'];
const SOURCES = ['signup', 'reacceptance', 'privacy_center', 'upload', 'analysis'];
function isConsentType(value) {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(exports.CONSENT_DOCUMENTS, value);
}
function majorVersion(version) {
    const major = Number.parseInt(version.split('.')[0] ?? '', 10);
    return Number.isFinite(major) ? major : 0;
}
/** Granted at the current major version of its document. */
function isConsentCurrent(entry, type) {
    if (!entry || entry.status !== 'granted')
        return false;
    const current = legalVersions_generated_1.LEGAL_VERSIONS[exports.CONSENT_DOCUMENTS[type]];
    return current !== undefined && majorVersion(entry.version) === majorVersion(current);
}
async function hasCurrentConsent(uid, type, db = (0, firestore_1.getFirestore)()) {
    const snapshot = await db.collection('consentRecords').doc(uid).get();
    const consents = snapshot.get('consents');
    return isConsentCurrent(consents?.[type], type);
}
/**
 * Appends to consentRecords/{uid}/items and updates the summary on consentRecords/{uid}.
 * Versions come from the bundled documents, never from the client.
 */
exports.recordConsent = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = request.auth?.uid;
    if (!uid || request.auth?.token.firebase?.sign_in_provider === 'anonymous') {
        throw new https_1.HttpsError('unauthenticated', 'Sign in with an account first.');
    }
    const rawItems = request.data?.items;
    if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 8) {
        throw new https_1.HttpsError('invalid-argument', 'Provide between 1 and 8 consent decisions.');
    }
    const locale = typeof request.data?.locale === 'string' && LOCALES.includes(request.data.locale) ? request.data.locale : 'en';
    const source = typeof request.data?.source === 'string' && SOURCES.includes(request.data.source) ? request.data.source : 'privacy_center';
    const items = rawItems.map((raw) => {
        const item = raw && typeof raw === 'object' ? raw : {};
        if (!isConsentType(item.type))
            throw new https_1.HttpsError('invalid-argument', 'Unknown consent type.');
        const decision = item.decision;
        if (decision !== 'granted' && decision !== 'withdrawn') {
            throw new https_1.HttpsError('invalid-argument', 'Decision must be granted or withdrawn.');
        }
        if (decision === 'withdrawn' && exports.REQUIRED_CONSENT_TYPES.includes(item.type)) {
            throw new https_1.HttpsError('failed-precondition', 'Required terms can only be withdrawn by deleting the account.');
        }
        const documentId = exports.CONSENT_DOCUMENTS[item.type];
        return { type: item.type, decision, documentId, version: legalVersions_generated_1.LEGAL_VERSIONS[documentId] ?? '0.0.0' };
    });
    const db = (0, firestore_1.getFirestore)();
    const now = new Date().toISOString();
    const summaryRef = db.collection('consentRecords').doc(uid);
    const batch = db.batch();
    const summary = {};
    for (const item of items) {
        batch.create(summaryRef.collection('items').doc(), {
            type: item.type,
            decision: item.decision,
            documentId: item.documentId,
            version: item.version,
            locale,
            source,
            at: now,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        summary[item.type] = { status: item.decision, documentId: item.documentId, version: item.version, locale, at: now };
    }
    batch.set(summaryRef, { uid, consents: summary, updatedAt: now }, { merge: true });
    await batch.commit();
    return { recorded: items.length, at: now };
});
//# sourceMappingURL=consent.js.map