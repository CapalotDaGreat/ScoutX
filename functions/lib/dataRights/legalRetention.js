"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEGAL_RETENTION_COLLECTION = void 0;
exports.subjectHash = subjectHash;
exports.retainLegalRecords = retainLegalRecords;
exports.writeDeletionReceipt = writeDeletionReceipt;
const node_crypto_1 = require("node:crypto");
const retention_1 = require("./retention");
/**
 * Records that must outlive an account (consent proof, moderation decisions, deletion receipt)
 * move here in minimised form: no name, email, content or free text, and the account is
 * referenced only by a one-way hash of its uid.
 */
exports.LEGAL_RETENTION_COLLECTION = 'legalRetention';
function subjectHash(uid) {
    return (0, node_crypto_1.createHash)('sha256').update(`scoutx-subject:${uid}`).digest('hex');
}
function minimalConsents(raw) {
    if (!raw || typeof raw !== 'object')
        return {};
    const out = {};
    for (const [type, value] of Object.entries(raw)) {
        if (!value || typeof value !== 'object')
            continue;
        out[type] = {
            status: typeof value.status === 'string' ? value.status : 'unknown',
            version: typeof value.version === 'string' ? value.version : null,
            at: typeof value.at === 'string' ? value.at : null,
        };
    }
    return out;
}
/** Copies what is needed to prove consent was given (type, version, time) before deletion. */
async function retainLegalRecords(db, uid, now = new Date()) {
    const hash = subjectHash(uid);
    const batch = db.batch();
    const col = db.collection(exports.LEGAL_RETENTION_COLLECTION);
    const [consent, safety, youth, cases, requests] = await Promise.all([
        db.collection('consentRecords').doc(uid).get(),
        db.collection('userSafety').doc(uid).get(),
        db.collection('youthConsents').where('uid', '==', uid).limit(20).get(),
        db.collection('moderationCases').where('targetOwnerId', '==', uid).limit(150).get(),
        db.collection('privacyRequests').where('uid', '==', uid).limit(100).get(),
    ]);
    if (consent.exists || !youth.empty) {
        batch.set(col.doc(`${hash}_consent`), {
            kind: 'consent_proof',
            subjectHash: hash,
            consents: minimalConsents(consent.get('consents')),
            ageBand: typeof safety.get('ageBand') === 'string' ? safety.get('ageBand') : null,
            guardianConsents: youth.docs.map((doc) => ({
                status: String(doc.get('status') ?? 'unknown'),
                scopes: Array.isArray(doc.get('scopes')) ? doc.get('scopes').filter((s) => typeof s === 'string') : [],
                grantedAt: typeof doc.get('grantedAt') === 'string' ? doc.get('grantedAt') : null,
                revokedAt: typeof doc.get('revokedAt') === 'string' ? doc.get('revokedAt') : null,
            })),
            retainedAt: now.toISOString(),
            deleteAfter: (0, retention_1.addDays)(now, retention_1.RETENTION.consentProofDays),
        });
    }
    for (const doc of cases.docs) {
        batch.set(col.doc(`${hash}_case_${doc.id}`), {
            kind: 'moderation_decision',
            subjectHash: hash,
            caseId: doc.id,
            targetType: String(doc.get('targetType') ?? 'unknown'),
            reasons: Array.isArray(doc.get('reasons')) ? doc.get('reasons') : [],
            decision: doc.get('decision') ?? null,
            decidedAt: doc.get('decidedAt') ?? null,
            retainedAt: now.toISOString(),
            deleteAfter: (0, retention_1.addDays)(now, retention_1.RETENTION.moderationDecisionDays),
        });
        // The open case keeps working for moderators but no longer names the account.
        batch.update(doc.ref, { targetOwnerId: null, targetOwnerHash: hash, targetContext: null, ownerDeletedAt: now.toISOString() });
    }
    for (const doc of requests.docs) {
        batch.set(col.doc(`${hash}_request_${doc.id}`), {
            kind: 'privacy_request',
            subjectHash: hash,
            type: String(doc.get('type') ?? 'unknown'),
            status: String(doc.get('status') ?? 'unknown'),
            createdAt: doc.get('createdAt') ?? null,
            closedAt: doc.get('closedAt') ?? null,
            retainedAt: now.toISOString(),
            deleteAfter: (0, retention_1.addDays)(now, retention_1.RETENTION.privacyRequestDays),
        });
    }
    await batch.commit();
}
async function writeDeletionReceipt(db, uid, receipt) {
    const hash = subjectHash(uid);
    await db.collection(exports.LEGAL_RETENTION_COLLECTION).doc(`${hash}_deletion`).set({
        kind: 'deletion_receipt',
        subjectHash: hash,
        requestedAt: receipt.requestedAt,
        completedAt: receipt.completedAt,
        remaining: receipt.remaining,
        deleteAfter: (0, retention_1.addDays)(new Date(receipt.completedAt), retention_1.RETENTION.deletionReceiptDays),
    });
}
//# sourceMappingURL=legalRetention.js.map