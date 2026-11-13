import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { displayTitle } from '../../src/utils/displayTitle.ts';

describe('displayTitle', () => {
  it('removes a stored leading emoji from system timeline titles', () => {
    assert.equal(displayTitle('⚽ First Match Logged'), 'First Match Logged');
    assert.equal(displayTitle('🛂 Football Passport Live'), 'Football Passport Live');
    assert.equal(displayTitle('💪 Portfolio Strength 80+'), 'Portfolio Strength 80+');
  });

  it('leaves ordinary and user-written titles alone', () => {
    assert.equal(displayTitle('Joined FC Example U17'), 'Joined FC Example U17');
    assert.equal(displayTitle('10 Matches Logged'), '10 Matches Logged');
    assert.equal(displayTitle('Cup final ⚽ winner'), 'Cup final ⚽ winner');
    assert.equal(displayTitle(''), '');
  });
});
