import { LEGAL_DOCUMENTS } from '@/features/legal/content.generated';
import {
  REQUIRED_CONSENTS,
  type ConsentType,
  type LegalDocument,
  type LegalDocumentId,
} from '@/features/legal/types';

export type ConsentEntry = {
  status: 'granted' | 'withdrawn';
  documentId: string;
  version: string;
  locale: string;
  at: string;
};

export type ConsentSummary = Partial<Record<ConsentType, ConsentEntry>>;

const CONSENT_TYPES: readonly ConsentType[] = [
  'terms_of_service',
  'privacy_policy',
  'community_guidelines',
  'ai_analysis',
  'media_upload',
];

export function getLegalDocument(id: LegalDocumentId): LegalDocument {
  const document = LEGAL_DOCUMENTS.find((item) => item.id === id);
  if (!document) throw new Error(`Unknown legal document ${id}`);
  return document;
}

export function majorVersion(version: string): number {
  const major = Number.parseInt(version.split('.')[0] ?? '', 10);
  return Number.isFinite(major) ? major : 0;
}

export function parseConsentSummary(data: Record<string, unknown> | undefined): ConsentSummary {
  const raw = data?.consents;
  if (!raw || typeof raw !== 'object') return {};
  const summary: ConsentSummary = {};
  for (const type of CONSENT_TYPES) {
    const entry = (raw as Record<string, unknown>)[type];
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (
      (record.status === 'granted' || record.status === 'withdrawn') &&
      typeof record.version === 'string' &&
      typeof record.at === 'string'
    ) {
      summary[type] = {
        status: record.status,
        documentId: typeof record.documentId === 'string' ? record.documentId : '',
        version: record.version,
        locale: typeof record.locale === 'string' ? record.locale : 'en',
        at: record.at,
      };
    }
  }
  return summary;
}

/** Required documents not yet accepted at their current major version. */
export function pendingRequiredConsents(summary: ConsentSummary): LegalDocument[] {
  return REQUIRED_CONSENTS.filter(({ type, documentId }) => {
    const entry = summary[type];
    return (
      !entry ||
      entry.status !== 'granted' ||
      majorVersion(entry.version) !== majorVersion(getLegalDocument(documentId).version)
    );
  }).map(({ documentId }) => getLegalDocument(documentId));
}

/** True when the user accepted an earlier major version, so the gate asks for re-acceptance. */
export function isReacceptance(summary: ConsentSummary): boolean {
  return REQUIRED_CONSENTS.some(({ type }) => summary[type]?.status === 'granted');
}

export function isConsentGranted(summary: ConsentSummary, type: ConsentType): boolean {
  return summary[type]?.status === 'granted';
}
