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
        CALLABLE_ALLOWED_ORIGINS: 'https://scoutx.app, http://insecure.example, *, https://admin.scoutx.app:8443',
      }),
      ['https://scoutx.app', 'https://admin.scoutx.app:8443'],
    );
  });
});
