import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveCallableCors } from '../../functions/src/callableOptions.ts';

describe('resolveCallableCors', () => {
  it('allows no browser origins in production by default', () => {
    assert.equal(resolveCallableCors({}), false);
  });

  it('allows any origin only in the emulator', () => {
    assert.equal(resolveCallableCors({ FUNCTIONS_EMULATOR: 'true' }), true);
  });

  it('accepts only exact https origins from the allowlist', () => {
    assert.deepEqual(
      resolveCallableCors({
        CALLABLE_ALLOWED_ORIGINS: 'https://pitchproof.online, http://insecure.example, *, https://admin.pitchproof.online:8443',
      }),
      ['https://pitchproof.online', 'https://admin.pitchproof.online:8443'],
    );
  });
});
