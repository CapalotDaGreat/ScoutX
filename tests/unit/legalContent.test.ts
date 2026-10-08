import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { LEGAL_DOCUMENT_ORDER, renderLegalModule, renderServerVersions } from '../../scripts/build-legal.mjs';
import {
  LEGAL_CONFIG,
  CONTACT_PLACEHOLDER_PATTERN,
  LEGAL_CONTACT_REQUIRED,
  PRIVACY_CONTACT_REQUIRED,
  SECURITY_CONTACT_REQUIRED,
  missingRequiredLegalContacts,
  resolveLegalTokens,
} from '../../src/config/legalConfig.ts';
import type { LegalConfig } from '../../src/config/legalConfig.ts';
import { LEGAL_DOCUMENTS } from '../../src/features/legal/content.generated.ts';
import {
  isReacceptance,
  parseConsentSummary,
  pendingRequiredConsents,
} from '../../src/features/legal/consentModel.ts';
import type { ConsentSummary } from '../../src/features/legal/consentModel.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

describe('bundled legal documents', () => {
  it('generated modules are in sync with legal/documents', () => {
    assert.equal(read('../../src/features/legal/content.generated.ts'), renderLegalModule());
    assert.equal(read('../../functions/src/legal/legalVersions.generated.ts'), renderServerVersions());
  });

  it('ships all 14 documents with review metadata', () => {
    assert.equal(LEGAL_DOCUMENTS.length, 14);
    assert.deepEqual(
      LEGAL_DOCUMENTS.map((doc) => doc.id),
      LEGAL_DOCUMENT_ORDER,
    );
    for (const doc of LEGAL_DOCUMENTS) {
      assert.equal(doc.canonicalLanguage, 'en', doc.id);
      assert.match(doc.effectiveDate, /^\d{4}-\d{2}-\d{2}$/, `${doc.id} needs a reviewed effective date`);
      assert.equal(doc.status, 'final', doc.id);
      assert.doesNotMatch(JSON.stringify(doc), /LEGAL_REVIEW_REQUIRED/, `${doc.id} still has an open review note`);
      assert.ok(doc.summary.length > 0 && doc.sections.length > 0, doc.id);
    }
  });

  it('never hard-codes contact details; contacts come from LEGAL_CONFIG tokens', () => {
    const text = JSON.stringify(LEGAL_DOCUMENTS);
    assert.doesNotMatch(text, /[\w.+-]+@[\w-]+\.[a-z]{2,}/i, 'email address in legal text');
    assert.doesNotMatch(text, /\+\d{2}[\d ]{6,}/, 'phone number in legal text');
    assert.doesNotMatch(text, /virus[- ]scanned|malware[- ]free/i, 'unsupported scanning claim');
  });

  it('does not claim the data is used for training or that location is stored', () => {
    const aiPolicy = JSON.stringify(LEGAL_DOCUMENTS.find((doc) => doc.id === 'ai-use-policy'));
    assert.match(aiPolicy, /never used to train/);
    const privacy = JSON.stringify(LEGAL_DOCUMENTS.find((doc) => doc.id === 'privacy-policy'));
    assert.match(privacy, /never written to your device storage, our servers/);
  });
});

describe('legal config', () => {
  const noContacts: LegalConfig = {
    ...LEGAL_CONFIG,
    contacts: { privacyEmail: null, securityEmail: null, legalEmail: null, supportEmail: null },
  };

  it('renders each missing contact with its own placeholder and keeps the real entity', () => {
    const text = resolveLegalTokens('{{entityName}}, {{entityAddress}} - {{privacyEmail}} / {{securityEmail}} / {{supportEmail}}', noContacts);
    assert.equal(
      text,
      `CML Electronics, Höglerstrasse 55, 8600 Dübendorf, Switzerland - ${PRIVACY_CONTACT_REQUIRED} / ${SECURITY_CONTACT_REQUIRED} / ${LEGAL_CONTACT_REQUIRED}`,
    );
    assert.match(text, CONTACT_PLACEHOLDER_PATTERN);
  });

  it('publishes the configured contacts and jurisdiction', () => {
    const text = resolveLegalTokens('{{privacyEmail}} {{securityEmail}} {{legalEmail}} {{supportEmail}} {{jurisdiction}}');
    assert.doesNotMatch(text, CONTACT_PLACEHOLDER_PATTERN);
    assert.doesNotMatch(text, /LEGAL_REVIEW_REQUIRED/);
    assert.match(text, /support@pitchproof\.online/);
  });

  it('reports the contacts a production build is missing', () => {
    assert.deepEqual(missingRequiredLegalContacts(noContacts), ['privacyEmail', 'securityEmail', 'supportEmail']);
    assert.deepEqual(missingRequiredLegalContacts(), []);
  });

  it('wires the release gate into app.config.ts', () => {
    const appConfig = read('../../app.config.ts');
    assert.match(appConfig, /missingRequiredLegalContacts\(\)/);
    assert.match(appConfig, /ALLOW_LEGAL_PLACEHOLDERS/);
  });
});

describe('consent model', () => {
  const granted = (version: string) => ({ status: 'granted', version, at: '2026-10-01T00:00:00.000Z' });

  it('requires all three documents for a new account', () => {
    const summary = parseConsentSummary(undefined);
    assert.equal(pendingRequiredConsents(summary).length, 3);
    assert.equal(isReacceptance(summary), false);
  });

  it('accepts minor version differences but asks again after a major bump', () => {
    const summary: ConsentSummary = parseConsentSummary({
      consents: {
        terms_of_service: granted('1.4.0'),
        privacy_policy: granted('0.9.0'),
        community_guidelines: granted('1.0.0'),
      },
    });
    assert.deepEqual(
      pendingRequiredConsents(summary).map((doc) => doc.id),
      ['privacy-policy'],
    );
    assert.equal(isReacceptance(summary), true);
  });

  it('ignores malformed entries', () => {
    const summary = parseConsentSummary({ consents: { terms_of_service: { status: 'yes' }, unknown: granted('1.0.0') } });
    assert.deepEqual(summary, {});
  });
});
