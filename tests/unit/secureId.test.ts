import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSecureId, secureRandomBase36 } from '../../src/utils/secureId.ts';

describe('secureId', () => {
  it('returns the requested length of base36 characters', () => {
    const value = secureRandomBase36(16);
    assert.equal(value.length, 16);
    assert.match(value, /^[a-z0-9]+$/);
  });

  it('creates distinct ids and strips unsafe prefix characters', () => {
    const first = createSecureId('match', 9);
    const second = createSecureId('match', 9);
    assert.notEqual(first, second);
    assert.match(first, /^match_[a-z0-9]+_[a-z0-9]{9}$/);
    assert.match(createSecureId('../evil id!', 8, '-'), /^evilid-[a-z0-9]+-[a-z0-9]{8}$/);
  });
});
