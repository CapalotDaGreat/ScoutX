import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { LEGAL_DOCUMENT_ORDER, renderLegalModule, renderServerVersions, renderSite, richText } from '../../scripts/build-legal.mjs';
import {
  LEGAL_CONFIG,
  CONTACT_PLACEHOLDER_PATTERN,
  LEGAL_CONTACT_REQUIRED,
  LEGAL_REVIEW_REQUIRED,
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
      assert.ok(['final', 'draft'].includes(doc.status), doc.id);
      if (doc.status === 'draft') {
        assert.equal(doc.effectiveDate, LEGAL_REVIEW_REQUIRED, `${doc.id} must not claim legal approval`);
      } else {
        assert.match(doc.effectiveDate, /^\d{4}-\d{2}-\d{2}$/, `${doc.id} needs a publication date`);
      }
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

  it('covers billing, processing limits, qualified rights and processor-held records', () => {
    const text = (id: string) => JSON.stringify(LEGAL_DOCUMENTS.find((doc) => doc.id === id));
    assert.match(text('subscription-terms'), /does not cancel an Apple subscription/);
    assert.match(text('subscription-terms'), /Restore purchases/);
    assert.match(text('subscription-terms'), /mandatory.*consumer rights/);
    assert.match(text('privacy-policy'), /Processing outside your country/);
    assert.match(text('privacy-policy'), /United States/);
    assert.match(text('privacy-policy'), /not blanket consent/);
    assert.match(text('data-subject-rights'), /one calendar month/);
    assert.match(text('data-subject-rights'), /restriction of processing/);
    assert.match(text('data-retention-policy'), /does not automatically delete RevenueCat/);
    assert.match(text('ai-use-policy'), /not an independent audit/);
    assert.match(text('guardian-consent-notice'), /Withdrawal links have a longer lifetime/);
  });
});

describe('generated legal website', () => {
  it('renders safe email and HTTPS links once without nested anchors', () => {
    const found = new Set<string>();
    assert.equal(
      richText('Email help+privacy@example.com or https://example.com/?a=1&b=2. <script>bad</script>', found),
      'Email <a href="mailto:help+privacy@example.com">help+privacy@example.com</a> or <a href="https://example.com/?a=1&amp;b=2">https://example.com/?a=1&amp;b=2</a>. &lt;script&gt;bad&lt;/script&gt;',
    );
    assert.equal(found.size, 0);
    assert.match(richText('LEGAL_REVIEW_REQUIRED', found), /pending legal review/);
    assert.ok(found.has('LEGAL_REVIEW_REQUIRED'));
  });

  it('keeps every generated public page in sync and labels unapproved revisions', async () => {
    const files: Array<{ label: string; content: string }> = await renderSite();
    assert.equal(files.length, 21);
    for (const file of files) {
      assert.equal(read(`../../${file.label}`), file.content, file.label);
      assert.match(file.content, /href="\/account-deletion\/"/, file.label);
      assert.match(file.content, /href="\/legal-notice\/"/, file.label);
      assert.doesNotMatch(file.content, /<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<a\b/, file.label);
    }
    const privacy = files.find((file) => file.label === 'public/privacy/index.html')?.content ?? '';
    assert.match(privacy, /Draft under legal review/);
    assert.match(privacy, /Effective date pending legal review/);
    const notice = files.find((file) => file.label === 'public/legal-notice/index.html')?.content ?? '';
    assert.match(notice, /CML Electronics/);
    assert.doesNotMatch(notice, /Commercial register \/ UID:/);
    const deletion = files.find((file) => file.label === 'public/account-deletion/index.html')?.content ?? '';
    assert.match(deletion, /does not cancel an Apple subscription/);
    assert.match(deletion, /If you cannot use the app/);
  });

  it('warns about continuing Apple billing in every supported deletion confirmation', () => {
    for (const locale of ['en', 'de', 'fr', 'es', 'it', 'nl', 'pt']) {
      const settings: { deleteAccountMessage: string } = JSON.parse(read(`../../src/i18n/locales/${locale}/settings.json`));
      assert.match(settings.deleteAccountMessage, /Apple/, locale);
      assert.ok(settings.deleteAccountMessage.length > 200, locale);
    }
  });

  it('keeps the direct guardian form consistent with the AI disclosure', () => {
    const form = read('../../public/guardian/index.html');
    assert.match(form, /selected frames and match context can be sent through OpenRouter/i);
    assert.match(form, /privacy-approved processing is enabled/);
    assert.match(form, /href="\/legal\/ai-use-policy\/"/);
    assert.doesNotMatch(form, /nothing is sold/);
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
    assert.match(appConfig, /productionBuildProblems\(/);
    assert.doesNotMatch(appConfig, /ALLOW_LEGAL_PLACEHOLDERS/);
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
