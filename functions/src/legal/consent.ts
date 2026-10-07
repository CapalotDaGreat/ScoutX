import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { createCallableOptions } from '../callableOptions';
import { LEGAL_VERSIONS } from './legalVersions.generated';

/** Consent type to the document whose version is recorded with it. */
export const CONSENT_DOCUMENTS = {
  terms_of_service: 'terms-of-service',
  privacy_policy: 'privacy-policy',
  community_guidelines: 'community-guidelines',
  ai_analysis: 'ai-use-policy',
  media_upload: 'video-recording-policy',
} as const;

export type ConsentType = keyof typeof CONSENT_DOCUMENTS;

/** Required consents can only be withdrawn by deleting the account. */
export const REQUIRED_CONSENT_TYPES: readonly ConsentType[] = [
  'terms_of_service',
  'privacy_policy',
  'community_guidelines',
];

const LOCALES = ['en', 'de', 'fr', 'es', 'it', 'nl', 'pt'];
const SOURCES = ['signup', 'reacceptance', 'privacy_center', 'upload', 'analysis'];

export function isConsentType(value: unknown): value is ConsentType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CONSENT_DOCUMENTS, value);
}

export type ConsentSummaryEntry = {
  status: 'granted' | 'withdrawn';
  documentId: string;
  version: string;
  locale: string;
  at: string;
};

export function majorVersion(version: string): number {
  const major = Number.parseInt(version.split('.')[0] ?? '', 10);
  return Number.isFinite(major) ? major : 0;
}

/** Granted at the current major version of its document. */
export function isConsentCurrent(entry: ConsentSummaryEntry | undefined, type: ConsentType): boolean {
  if (!entry || entry.status !== 'granted') return false;
  const current = LEGAL_VERSIONS[CONSENT_DOCUMENTS[type]];
  return current !== undefined && majorVersion(entry.version) === majorVersion(current);
}

export async function hasCurrentConsent(uid: string, type: ConsentType, db: Firestore = getFirestore()): Promise<boolean> {
  const snapshot = await db.collection('consentRecords').doc(uid).get();
  const consents = snapshot.get('consents') as Record<string, ConsentSummaryEntry> | undefined;
  return isConsentCurrent(consents?.[type], type);
}

/**
 * Appends to consentRecords/{uid}/items and updates the summary on consentRecords/{uid}.
 * Versions come from the bundled documents, never from the client.
 */
export const recordConsent = onCall(createCallableOptions(), async (request) => {
  const uid = request.auth?.uid;
  if (!uid || request.auth?.token.firebase?.sign_in_provider === 'anonymous') {
    throw new HttpsError('unauthenticated', 'Sign in with an account first.');
  }
  const rawItems: unknown = request.data?.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 8) {
    throw new HttpsError('invalid-argument', 'Provide between 1 and 8 consent decisions.');
  }
  const locale = typeof request.data?.locale === 'string' && LOCALES.includes(request.data.locale) ? request.data.locale : 'en';
  const source = typeof request.data?.source === 'string' && SOURCES.includes(request.data.source) ? request.data.source : 'privacy_center';

  const items = rawItems.map((raw: unknown): {
    type: ConsentType;
    decision: ConsentSummaryEntry['status'];
    documentId: string;
    version: string;
  } => {
    const item = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    if (!isConsentType(item.type)) throw new HttpsError('invalid-argument', 'Unknown consent type.');
    const decision = item.decision;
    if (decision !== 'granted' && decision !== 'withdrawn') {
      throw new HttpsError('invalid-argument', 'Decision must be granted or withdrawn.');
    }
    if (decision === 'withdrawn' && REQUIRED_CONSENT_TYPES.includes(item.type)) {
      throw new HttpsError('failed-precondition', 'Required terms can only be withdrawn by deleting the account.');
    }
    const documentId = CONSENT_DOCUMENTS[item.type];
    return { type: item.type, decision, documentId, version: LEGAL_VERSIONS[documentId] ?? '0.0.0' };
  });

  const db = getFirestore();
  const now = new Date().toISOString();
  const summaryRef = db.collection('consentRecords').doc(uid);
  const batch = db.batch();
  const summary: Record<string, ConsentSummaryEntry> = {};
  for (const item of items) {
    batch.create(summaryRef.collection('items').doc(), {
      type: item.type,
      decision: item.decision,
      documentId: item.documentId,
      version: item.version,
      locale,
      source,
      at: now,
      createdAt: FieldValue.serverTimestamp(),
    });
    summary[item.type] = { status: item.decision, documentId: item.documentId, version: item.version, locale, at: now };
  }
  batch.set(summaryRef, { uid, consents: summary, updatedAt: now }, { merge: true });
  await batch.commit();
  return { recorded: items.length, at: now };
});
