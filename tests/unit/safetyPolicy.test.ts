import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { canChangeAgeBand, getUserSafetyPolicy } from '../../src/features/youth-safety/policy.ts';
import type { SafetyState } from '../../src/features/youth-safety/policy.ts';
import { getUserSafetyPolicy as serverPolicy } from '../../functions/src/safety/policy.ts';
import {
  createGuardianToken,
  hashToken,
  isPlausibleEmail,
  maskEmail,
  verifyGuardianToken,
} from '../../functions/src/safety/guardianToken.ts';

const NOW = new Date('2026-10-07T12:00:00.000Z');

function state(patch: Partial<SafetyState>): SafetyState {
  return { ageBand: '13-17', guardianStatus: 'required', scopes: [], consentExpiresAt: null, ...patch };
}

describe('youth safety policy', () => {
  it('client and server copies are identical', () => {
    const client = readFileSync(new URL('../../src/features/youth-safety/policy.ts', import.meta.url), 'utf8');
    const server = readFileSync(new URL('../../functions/src/safety/policy.ts', import.meta.url), 'utf8');
    assert.equal(client.replace(/\r\n/g, '\n'), server.replace(/\r\n/g, '\n'));
  });

  it('requires an age band before anything is active', () => {
    const policy = getUserSafetyPolicy(null, NOW);
    assert.equal(policy.needsAgeBand, true);
    assert.equal(policy.youthFunctionalityActive, false);
    assert.equal(policy.canUsePublicPassport, false);
  });

  it('blocks under-13 accounts', () => {
    const policy = getUserSafetyPolicy(state({ ageBand: 'under13' }), NOW);
    assert.equal(policy.blocked, true);
    assert.equal(policy.canRecordMovement, false);
  });

  it('gives adults full independent access', () => {
    const policy = getUserSafetyPolicy(state({ ageBand: '18plus', guardianStatus: 'not_required' }), NOW);
    assert.equal(policy.isMinor, false);
    assert.equal(policy.canBeDiscovered, true);
    assert.equal(policy.canReceiveScoutContact, true);
    assert.equal(policy.trialsNeedGuardianApproval, false);
    assert.equal(policy.canSeePromotions, true);
    assert.equal(policy.ageGroupLabel, null);
  });

  it('keeps minors private until a guardian approves', () => {
    const policy = getUserSafetyPolicy(state({ guardianStatus: 'pending', scopes: ['discovery'] }), NOW);
    assert.equal(policy.awaitingGuardian, true);
    assert.equal(policy.youthFunctionalityActive, false);
    assert.equal(policy.canBeDiscovered, false);
    assert.equal(policy.canRecordMovement, true);
    assert.equal(policy.genericLockScreenOnly, true);
  });

  it('grants only the scopes a guardian approved', () => {
    const policy = getUserSafetyPolicy(
      state({ guardianStatus: 'approved', scopes: ['public_passport'], consentExpiresAt: '2027-10-07T00:00:00.000Z' }),
      NOW,
    );
    assert.equal(policy.youthFunctionalityActive, true);
    assert.equal(policy.canUsePublicPassport, true);
    assert.equal(policy.canBeDiscovered, false);
    assert.equal(policy.canReceiveScoutContact, false);
    assert.equal(policy.trialsNeedGuardianApproval, true);
    assert.equal(policy.canSeePromotions, false);
    assert.equal(policy.ageGroupLabel, 'youth');
  });

  it('treats expired consent as not approved', () => {
    const policy = getUserSafetyPolicy(
      state({ guardianStatus: 'approved', scopes: ['discovery'], consentExpiresAt: '2026-10-01T00:00:00.000Z' }),
      NOW,
    );
    assert.equal(policy.awaitingGuardian, true);
    assert.equal(policy.canBeDiscovered, false);
  });

  it('server copy produces identical decisions', () => {
    const samples: Array<SafetyState | null> = [
      null,
      state({ ageBand: 'under13' }),
      state({ ageBand: '18plus', guardianStatus: 'not_required' }),
      state({ guardianStatus: 'approved', scopes: ['scout_contact', 'ai_analysis'], consentExpiresAt: '2027-01-01T00:00:00.000Z' }),
      state({ guardianStatus: 'revoked', scopes: ['discovery'] }),
    ];
    for (const sample of samples) {
      assert.deepEqual(serverPolicy(sample, NOW), getUserSafetyPolicy(sample, NOW));
    }
  });

  it('only allows changing to a stricter age band', () => {
    assert.equal(canChangeAgeBand(null, '18plus'), true);
    assert.equal(canChangeAgeBand('18plus', '13-17'), true);
    assert.equal(canChangeAgeBand('13-17', '18plus'), false);
  });
});

describe('guardian link token', () => {
  const secret = 'unit-test-secret';
  const exp = NOW.getTime() + 60_000;

  it('verifies an untampered token of the expected purpose', () => {
    const token = createGuardianToken(secret, { ref: 'consent-1', purpose: 'consent', exp });
    const payload = verifyGuardianToken(secret, token, ['consent'], NOW.getTime());
    assert.equal(payload?.ref, 'consent-1');
  });

  it('rejects wrong secret, purpose, expiry and tampering', () => {
    const token = createGuardianToken(secret, { ref: 'consent-1', purpose: 'consent', exp });
    assert.equal(verifyGuardianToken('other', token, ['consent'], NOW.getTime()), null);
    assert.equal(verifyGuardianToken(secret, token, ['trial'], NOW.getTime()), null);
    assert.equal(verifyGuardianToken(secret, token, ['consent'], exp + 1), null);
    const [body, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ref: 'consent-2', purpose: 'consent', exp, nonce: 'x' })).toString('base64url');
    assert.equal(verifyGuardianToken(secret, `${forged}.${signature}`, ['consent'], NOW.getTime()), null);
    assert.equal(verifyGuardianToken(secret, `${body}.${signature}.extra`, ['consent'], NOW.getTime()), null);
    assert.equal(verifyGuardianToken(secret, 42, ['consent'], NOW.getTime()), null);
  });

  it('stores only a hash and masks emails', () => {
    const token = createGuardianToken(secret, { ref: 'r', purpose: 'revoke', exp });
    assert.notEqual(hashToken(token), token);
    assert.equal(hashToken(token).length, 64);
    assert.equal(maskEmail('parent@example.com'), 'p***@example.com');
    assert.equal(isPlausibleEmail('parent@example.com'), true);
    assert.equal(isPlausibleEmail('not-an-email'), false);
  });
});
