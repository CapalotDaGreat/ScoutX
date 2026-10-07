export type LegalDocumentId =
  | 'privacy-policy'
  | 'terms-of-service'
  | 'community-guidelines'
  | 'youth-safety-policy'
  | 'guardian-consent-notice'
  | 'video-recording-policy'
  | 'ai-use-policy'
  | 'copyright-policy'
  | 'reporting-takedown-policy'
  | 'data-subject-rights'
  | 'data-retention-policy'
  | 'security-disclosure-policy'
  | 'cookie-tracking-policy'
  | 'subscription-terms';

export type LegalBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] };

export type LegalSection = {
  heading: string;
  blocks: LegalBlock[];
};

export type LegalDocument = {
  id: LegalDocumentId;
  title: string;
  version: string;
  effectiveDate: string;
  status: string;
  canonicalLanguage: string;
  /** Acceptance is recorded at sign-up and again after a major version bump. */
  requiresAcceptance: boolean;
  summary: string[];
  sections: LegalSection[];
};

/** Consent types recorded server-side in consentRecords. */
export type ConsentType = 'terms_of_service' | 'privacy_policy' | 'community_guidelines' | 'ai_analysis' | 'media_upload';

export const REQUIRED_CONSENTS: readonly { type: ConsentType; documentId: LegalDocumentId }[] = [
  { type: 'terms_of_service', documentId: 'terms-of-service' },
  { type: 'privacy_policy', documentId: 'privacy-policy' },
  { type: 'community_guidelines', documentId: 'community-guidelines' },
];
