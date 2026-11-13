import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { pitchSpotForPosition } from '../../src/components/football/positionPitch.ts';

describe('position pitch marker', () => {
  it('places common codes in the right third and flank', () => {
    const gk = pitchSpotForPosition('GK')!;
    const st = pitchSpotForPosition('st')!;
    const lw = pitchSpotForPosition('LW')!;
    const rb = pitchSpotForPosition('RB')!;
    assert.ok(gk.y < 0.15 && st.y > 0.8);
    assert.ok(lw.x < 0.3 && rb.x > 0.7);
    assert.deepEqual(pitchSpotForPosition(' CM '), { x: 0.5, y: 0.5 });
  });

  it('understands a few written names', () => {
    assert.deepEqual(pitchSpotForPosition('Goalkeeper'), pitchSpotForPosition('GK'));
    assert.deepEqual(pitchSpotForPosition('Centre back'), pitchSpotForPosition('CB'));
    assert.deepEqual(pitchSpotForPosition('Stürmer'), pitchSpotForPosition('ST'));
  });

  it('draws nothing for unknown, empty or free text: unknown is not a default position', () => {
    for (const value of [null, undefined, '', '   ', 'Utility', 'CM/CAM', '10']) {
      assert.equal(pitchSpotForPosition(value), null);
    }
  });

  it('keeps every marker inside the pitch', () => {
    for (const code of ['GK', 'CB', 'LCB', 'RCB', 'LB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'LM', 'RM', 'CAM', 'LW', 'RW', 'SS', 'CF', 'ST']) {
      const spot = pitchSpotForPosition(code)!;
      assert.ok(spot.x > 0.05 && spot.x < 0.95 && spot.y > 0.03 && spot.y < 0.97, code);
    }
  });
});
