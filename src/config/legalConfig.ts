// Pure data (no React Native imports): app.config.ts reads it for the production release gate.

export const LEGAL_CONTACT_REQUIRED = 'LEGAL_CONTACT_REQUIRED';
export const PRIVACY_CONTACT_REQUIRED = 'PRIVACY_CONTACT_REQUIRED';
export const SECURITY_CONTACT_REQUIRED = 'SECURITY_CONTACT_REQUIRED';
export const LEGAL_REVIEW_REQUIRED = 'LEGAL_REVIEW_REQUIRED';
/** Matches any unfilled contact placeholder in rendered text. */
export const CONTACT_PLACEHOLDER_PATTERN = /\b(LEGAL|PRIVACY|SECURITY)_CONTACT_REQUIRED\b/;

export type LegalConfig = {
  entity: {
    name: string;
    street: string;
    postalCode: string;
    city: string;
    country: string;
    /** Commercial register / UID numbers are only filled in from official records. */
    registerNumber: string | null;
    vatNumber: string | null;
  };
  contacts: {
    privacyEmail: string | null;
    securityEmail: string | null;
    legalEmail: string | null;
    supportEmail: string | null;
  };
  /** Data protection officer; null until one is actually appointed. */
  dpo: string | null;
  /** GDPR Art. 27 representative; null until one is actually appointed. */
  euRepresentative: string | null;
  governingLaw: string;
  jurisdiction: string | null;
  minimumAge: number;
  guardianConsentUntilAge: number;
  supervisoryAuthority: string;
};

export const LEGAL_CONFIG: LegalConfig = {
  entity: {
    name: 'CML Electronics',
    street: 'Höglerstrasse 55',
    postalCode: '8600',
    city: 'Dübendorf',
    country: 'Switzerland',
    registerNumber: null,
    vatNumber: null,
  },
  contacts: {
    privacyEmail: 'support@pitchproof.online',
    securityEmail: 'support@pitchproof.online',
    legalEmail: 'support@pitchproof.online',
    supportEmail: 'support@pitchproof.online',
  },
  dpo: null,
  euRepresentative: null,
  governingLaw: 'Swiss law',
  jurisdiction: 'Dübendorf, Switzerland',
  minimumAge: 13,
  guardianConsentUntilAge: 18,
  supervisoryAuthority: 'Federal Data Protection and Information Commissioner (FDPIC), Switzerland',
};

/** Contacts a production build must not ship without. */
export const REQUIRED_LEGAL_CONTACTS = ['privacyEmail', 'securityEmail', 'supportEmail'] as const;

export function missingRequiredLegalContacts(config: LegalConfig = LEGAL_CONFIG): string[] {
  return REQUIRED_LEGAL_CONTACTS.filter((key) => !config.contacts[key]);
}

export function displayLegalValue(value: string | null, placeholder: string = LEGAL_CONTACT_REQUIRED): string {
  return value && value.trim() ? value : placeholder;
}

export function entityAddress(config: LegalConfig = LEGAL_CONFIG): string {
  const { street, postalCode, city, country } = config.entity;
  return `${street}, ${postalCode} ${city}, ${country}`;
}

/** Substitutes {{token}} placeholders in bundled legal text with the current config. */
export function resolveLegalTokens(text: string, config: LegalConfig = LEGAL_CONFIG): string {
  const tokens: Record<string, string> = {
    entityName: config.entity.name,
    entityAddress: entityAddress(config),
    privacyEmail: displayLegalValue(config.contacts.privacyEmail, PRIVACY_CONTACT_REQUIRED),
    securityEmail: displayLegalValue(config.contacts.securityEmail, SECURITY_CONTACT_REQUIRED),
    legalEmail: displayLegalValue(config.contacts.legalEmail),
    supportEmail: displayLegalValue(config.contacts.supportEmail),
    dpo: config.dpo ?? 'none appointed',
    euRepresentative: config.euRepresentative ?? 'none appointed',
    governingLaw: config.governingLaw,
    jurisdiction: config.jurisdiction ?? LEGAL_REVIEW_REQUIRED,
    minimumAge: String(config.minimumAge),
    guardianConsentUntilAge: String(config.guardianConsentUntilAge),
    supervisoryAuthority: config.supervisoryAuthority,
  };
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => tokens[key] ?? match);
}
