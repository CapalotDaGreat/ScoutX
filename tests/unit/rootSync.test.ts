import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { keepsLinkedScreen } from '../../src/navigation/rootSync.ts';

describe('root navigator sync keeps a linked screen only while the session settles', () => {
  const base = { rootRoute: 'PlayerApp', linkedRoute: 'PlayerApp', needsRole: false };

  it('keeps it on the first sync', () => {
    assert.equal(keepsLinkedScreen({ ...base, previousKey: null }), true);
  });

  it('keeps it when the same app only now learns the account id', () => {
    // Regression: this used to reset and re-open the linked screen after the user had pressed Back.
    assert.equal(keepsLinkedScreen({ ...base, previousKey: 'PlayerApp:' }), true);
  });

  it('resets when another account signs in to the same app', () => {
    assert.equal(keepsLinkedScreen({ ...base, previousKey: 'PlayerApp:alice' }), false);
  });

  it('resets when the session belongs to a different app than the link opened', () => {
    assert.equal(keepsLinkedScreen({ ...base, previousKey: null, linkedRoute: 'GuestApp' }), false);
    assert.equal(keepsLinkedScreen({ ...base, previousKey: 'GuestApp:' }), false);
  });

  it('never keeps a screen while a role still has to be chosen', () => {
    assert.equal(keepsLinkedScreen({ ...base, previousKey: null, needsRole: true }), false);
  });
});
