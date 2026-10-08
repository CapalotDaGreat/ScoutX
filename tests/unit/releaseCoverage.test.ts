import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyYouthDisplay } from '../../functions/src/publicPassport.ts';
import { getUserSafetyPolicy } from '../../functions/src/safety/policy.ts';
import { RETENTION } from '../../functions/src/dataRights/retention.ts';
import { UPLOAD_LIMITS } from '../../functions/src/uploads/model.ts';

const minor = getUserSafetyPolicy({ ageBand: '13-17', guardianStatus: 'approved', scopes: ['public_passport'], consentExpiresAt: null });
const adult = getUserSafetyPolicy({ ageBand: '18plus', guardianStatus: 'not_required', scopes: [], consentExpiresAt: null });

describe('public display of minors', () => {
  test('minors appear with first name, last initial and a youth label', () => {
    const shown = applyYouthDisplay({ fullName: 'Lena Maria Muster', club: 'FC Example' }, minor);
    assert.equal(shown.fullName, 'Lena M.');
    assert.equal(shown.ageGroupLabel, 'youth');
    assert.equal(shown.club, 'FC Example');
  });

  test('single names and blanks never leak more than given', () => {
    assert.equal(applyYouthDisplay({ fullName: 'Lena' }, minor).fullName, 'Lena');
    assert.equal(applyYouthDisplay({ fullName: '   ' }, minor).fullName, '');
  });

  test('adults are shown unchanged', () => {
    const passport = { fullName: 'Max Muster' };
    assert.equal(applyYouthDisplay(passport, adult), passport);
  });
});

describe('documentation mirrors the code', () => {
  const matrix = readFileSync(new URL('../../docs/privacy/retention-matrix.md', import.meta.url), 'utf8');

  test('every RETENTION key appears in the retention matrix', () => {
    for (const key of Object.keys(RETENTION)) {
      assert.ok(matrix.includes(`\`${key}\``), `docs/privacy/retention-matrix.md is missing ${key}`);
    }
  });

  test('the retention matrix states the current periods', () => {
    assert.ok(matrix.includes(`${RETENTION.exportDays} days (\`exportDays\`)`));
    assert.ok(matrix.includes(`${RETENTION.failedUploadDays} days (\`failedUploadDays\`)`));
    assert.ok(matrix.includes(`${RETENTION.abandonedJobDays} days (\`abandonedJobDays\`)`));
    assert.ok(matrix.includes(`${RETENTION.webhookReceiptDays} days (\`webhookReceiptDays\`)`));
    assert.ok(matrix.includes(`${UPLOAD_LIMITS.abandonAfterDays} days (\`UPLOAD_LIMITS.abandonAfterDays\`)`));
    for (const key of ['privacyRequestDays', 'consentProofDays', 'deletionReceiptDays', 'moderationDecisionDays'] as const) {
      assert.ok(matrix.includes(`${RETENTION[key] / 365} years (\`${key}\`)`), `${key} period out of date`);
    }
  });
});
