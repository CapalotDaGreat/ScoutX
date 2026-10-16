import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rateLimitDocId, type RateLimitWindow } from '../../functions/src/security/rateLimit.ts';

describe('callable rate limit helpers', () => {
  it('buckets hour and day keys without colliding across users or actions', () => {
    const now = new Date('2026-10-16T14:30:00.000Z');
    const hour: RateLimitWindow = 'hour';
    const day: RateLimitWindow = 'day';
    assert.equal(rateLimitDocId('uidA', 'discovery_search', hour, now), 'uidA_discovery_search_2026-10-16T14');
    assert.equal(rateLimitDocId('uidA', 'discovery_search', day, now), 'uidA_discovery_search_2026-10-16');
    assert.notEqual(
      rateLimitDocId('uidA', 'discovery_search', hour, now),
      rateLimitDocId('uidB', 'discovery_search', hour, now),
    );
    assert.notEqual(
      rateLimitDocId('uidA', 'discovery_search', hour, now),
      rateLimitDocId('uidA', 'media_playback', hour, now),
    );
  });
});
