import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { RETENTION, addDays } from './retention';

/**
 * Records that must outlive an account (consent proof, moderation decisions, deletion receipt)
 * move here in minimised form: no name, email, content or free text, and the account is
 * referenced only by a one-way hash of its uid.
 */
export const LEGAL_RETENTION_COLLECTION = 'legalRetention';

export type LegalRetentionKind = 'consent_proof' | 'moderation_decision' | 'deletion_receipt' | 'privacy_request';

export function subjectHash(uid: string): string {
  return createHash('sha256').update(`scoutx-subject:${uid}`).digest('hex');
}

type ConsentEntry = { status?: unknown; version?: unknown; at?: unknown; decision?: unknown };

function minimalConsents(raw: unknown): Record<string, { status: string; version: string | null; at: string | null }> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, { status: string; version: string | null; at: string | null }> = {};
  for (const [type, value] of Object.entries(raw as Record<string, ConsentEntry>)) {
    if (!value || typeof value !== 'object') continue;
    out[type] = {
      status: typeof value.status === 'string' ? value.status : 'unknown',
      version: typeof value.version === 'string' ? value.version : null,
      at: typeof value.at === 'string' ? value.at : null,
    };
  }
  return out;
}

/** Copies what is needed to prove consent was given (type, version, time) before deletion. */
export async function retainLegalRecords(db: Firestore, uid: string, now: Date = new Date()): Promise<void> {
  const hash = subjectHash(uid);
  const batch = db.batch();
  const col = db.collection(LEGAL_RETENTION_COLLECTION);

  const [consent, safety, youth, cases, requests] = await Promise.all([
    db.collection('consentRecords').doc(uid).get(),
    db.collection('userSafety').doc(uid).get(),
    db.collection('youthConsents').where('uid', '==', uid).limit(20).get(),
    db.collection('moderationCases').where('targetOwnerId', '==', uid).limit(150).get(),
    db.collection('privacyRequests').where('uid', '==', uid).limit(100).get(),
  ]);

  if (consent.exists || !youth.empty) {
    batch.set(col.doc(`${hash}_consent`), {
      kind: 'consent_proof' satisfies LegalRetentionKind,
      subjectHash: hash,
      consents: minimalConsents(consent.get('consents')),
      ageBand: typeof safety.get('ageBand') === 'string' ? safety.get('ageBand') : null,
      guardianConsents: youth.docs.map((doc) => ({
        status: String(doc.get('status') ?? 'unknown'),
        scopes: Array.isArray(doc.get('scopes')) ? (doc.get('scopes') as unknown[]).filter((s) => typeof s === 'string') : [],
        grantedAt: typeof doc.get('grantedAt') === 'string' ? doc.get('grantedAt') : null,
        revokedAt: typeof doc.get('revokedAt') === 'string' ? doc.get('revokedAt') : null,
      })),
      retainedAt: now.toISOString(),
      deleteAfter: addDays(now, RETENTION.consentProofDays),
    });
  }

  for (const doc of cases.docs) {
    batch.set(col.doc(`${hash}_case_${doc.id}`), {
      kind: 'moderation_decision' satisfies LegalRetentionKind,
      subjectHash: hash,
      caseId: doc.id,
      targetType: String(doc.get('targetType') ?? 'unknown'),
      reasons: Array.isArray(doc.get('reasons')) ? doc.get('reasons') : [],
      decision: doc.get('decision') ?? null,
      decidedAt: doc.get('decidedAt') ?? null,
      retainedAt: now.toISOString(),
      deleteAfter: addDays(now, RETENTION.moderationDecisionDays),
    });
    // The open case keeps working for moderators but no longer names the account.
    batch.update(doc.ref, { targetOwnerId: null, targetOwnerHash: hash, targetContext: null, ownerDeletedAt: now.toISOString() });
  }

  for (const doc of requests.docs) {
    batch.set(col.doc(`${hash}_request_${doc.id}`), {
      kind: 'privacy_request' satisfies LegalRetentionKind,
      subjectHash: hash,
      type: String(doc.get('type') ?? 'unknown'),
      status: String(doc.get('status') ?? 'unknown'),
      createdAt: doc.get('createdAt') ?? null,
      closedAt: doc.get('closedAt') ?? null,
      retainedAt: now.toISOString(),
      deleteAfter: addDays(now, RETENTION.privacyRequestDays),
    });
  }

  await batch.commit();
}

export async function writeDeletionReceipt(
  db: Firestore,
  uid: string,
  receipt: { requestedAt: string; completedAt: string; remaining: string[] },
): Promise<void> {
  const hash = subjectHash(uid);
  await db.collection(LEGAL_RETENTION_COLLECTION).doc(`${hash}_deletion`).set({
    kind: 'deletion_receipt' satisfies LegalRetentionKind,
    subjectHash: hash,
    requestedAt: receipt.requestedAt,
    completedAt: receipt.completedAt,
    remaining: receipt.remaining,
    deleteAfter: addDays(new Date(receipt.completedAt), RETENTION.deletionReceiptDays),
  });
}
