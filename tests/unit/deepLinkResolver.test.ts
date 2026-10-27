import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractLinkPath,
  isValidPushPath,
  resolveDeepLinkPath,
  resolutionToPath,
  type DeepLinkSession,
} from '../../src/navigation/deepLinkResolver.ts';
import {
  isMeaningfulPassportImprovement,
  pushPathFor,
  summaryChanges,
  trialUpdateRecipient,
} from '../../functions/src/notificationPolicy.ts';

const player: DeepLinkSession = { authenticated: true, role: 'player' };
const scout: DeepLinkSession = { authenticated: true, role: 'scout' };
const guest: DeepLinkSession = { authenticated: true, role: 'guest' };
const signedOut: DeepLinkSession = { authenticated: false, role: null };

describe('deep link resolver', () => {
  test('signed-out users are sent to sign in and the link is kept for resume', () => {
    const result = resolveDeepLinkPath('trial/abc123', signedOut);
    assert.deepEqual(result, { kind: 'requires_auth', resumePath: 'trial/abc123' });
    assert.equal(resolutionToPath(result), 'login');
  });

  test('trial links route per role', () => {
    assert.deepEqual(resolveDeepLinkPath('trial/t1', player), { kind: 'route', path: 'player/trials?trialId=t1' });
    assert.deepEqual(resolveDeepLinkPath('trial/t1', scout), { kind: 'route', path: 'scout/trials?trialId=t1' });
    assert.deepEqual(resolveDeepLinkPath('trial/t1', guest), { kind: 'unavailable', reason: 'wrong_role' });
  });

  test('requests, reels and match reports are player-only', () => {
    assert.equal(resolutionToPath(resolveDeepLinkPath('request/r1', player)), 'player/requests?requestId=r1');
    assert.equal(resolutionToPath(resolveDeepLinkPath('request/r1', scout)), 'link/unavailable?reason=wrong_role');
    assert.equal(resolutionToPath(resolveDeepLinkPath('reel/reel_1', player)), 'player/media?reelId=reel_1');
    assert.equal(resolutionToPath(resolveDeepLinkPath('match/job1', player)), 'match/job1');
    assert.equal(resolutionToPath(resolveDeepLinkPath('match/job1', scout)), 'link/unavailable?reason=wrong_role');
    assert.equal(resolutionToPath(resolveDeepLinkPath('match/job1/moments', player)), 'match/job1?section=moments');
    assert.equal(resolutionToPath(resolveDeepLinkPath('match/job1/review', player)), 'match/job1?section=review');
    assert.equal(resolutionToPath(resolveDeepLinkPath('match/job1/admin', player)), 'link/unavailable?reason=invalid');
    assert.equal(isValidPushPath('match/job1/moments'), true);
  });

  test('evidence links open the player for every role', () => {
    assert.equal(resolutionToPath(resolveDeepLinkPath('evidence/p1/e1', scout)), 'scout/player/p1?evidenceId=e1');
    assert.equal(resolutionToPath(resolveDeepLinkPath('evidence/p1/e1', player)), 'player/detail/p1?evidenceId=e1');
    assert.equal(resolutionToPath(resolveDeepLinkPath('evidence/p1/e1', guest)), 'guest/player/p1');
  });

  test('malformed ids are invalid even when signed out', () => {
    assert.deepEqual(resolveDeepLinkPath('trial/../../x', signedOut), { kind: 'unavailable', reason: 'invalid' });
    assert.deepEqual(resolveDeepLinkPath('trial', player), { kind: 'unavailable', reason: 'invalid' });
    assert.deepEqual(resolveDeepLinkPath('evidence/p1', scout), { kind: 'unavailable', reason: 'invalid' });
    assert.deepEqual(resolveDeepLinkPath('reel/a%20b', player), { kind: 'unavailable', reason: 'invalid' });
  });

  test('ungated routes pass through untouched', () => {
    assert.deepEqual(resolveDeepLinkPath('player/some-slug', signedOut), { kind: 'passthrough', path: 'player/some-slug' });
    assert.deepEqual(resolveDeepLinkPath('auth/action', signedOut), { kind: 'passthrough', path: 'auth/action' });
  });

  test('paths are extracted from scheme and universal-link URLs', () => {
    const prefixes = ['pitchproof://', 'https://pitchproof.online'];
    assert.equal(extractLinkPath('pitchproof://trial/abc?x=1', prefixes), 'trial/abc');
    assert.equal(extractLinkPath('https://pitchproof.online/request/r9/', prefixes), 'request/r9');
    assert.equal(extractLinkPath('exp://192.168.1.2:8081/--/trial/z', ['exp://192.168.1.2:8081/--/']), 'trial/z');
  });

  test('push paths only accept plain app paths', () => {
    assert.equal(isValidPushPath('match/job1'), true);
    assert.equal(isValidPushPath('https://evil.example'), false);
    assert.equal(isValidPushPath('player//home'), false);
    assert.equal(isValidPushPath('javascript:alert(1)'), false);
  });
});

describe('push routing and producer policy', () => {
  test('every producer type maps to a gated or tab route', () => {
    const ref = { entityType: 'x', entityId: 'id1' };
    assert.equal(pushPathFor('analysis_completed', ref, 'player'), 'match/id1');
    assert.equal(pushPathFor('analysis_failed', ref, 'player'), 'match/id1');
    assert.equal(pushPathFor('trial_update', ref, 'scout'), 'trial/id1');
    assert.equal(pushPathFor('evidence_requested', ref, 'player'), 'request/id1');
    assert.equal(pushPathFor('evidence_fulfilled', ref, 'scout'), 'scout/player/id1');
    assert.equal(pushPathFor('watchlist_change', ref, 'scout'), 'scout');
    assert.equal(pushPathFor('development_reminder', ref, 'player'), 'player/performance');
    assert.equal(pushPathFor('unknown', null, 'scout'), 'scout');
    for (const type of ['analysis_completed', 'trial_update', 'evidence_requested', 'evidence_fulfilled']) {
      assert.equal(isValidPushPath(pushPathFor(type, ref, 'player')), true, type);
    }
  });

  test('trial updates notify the side that did not act', () => {
    assert.equal(trialUpdateRecipient('pending', 'accepted'), 'scout');
    assert.equal(trialUpdateRecipient('pending', 'declined'), 'scout');
    assert.equal(trialUpdateRecipient('accepted', 'rescheduled'), 'player');
    assert.equal(trialUpdateRecipient('accepted', 'cancelled'), 'player');
    assert.equal(trialUpdateRecipient('accepted', 'accepted'), null);
    assert.equal(trialUpdateRecipient('accepted', 'pending'), null);
  });

  test('passport improvement needs a newly solid coverage dimension', () => {
    const limited = { coverage: [{ id: 'technical', state: 'limited' }] };
    const moderate = { coverage: [{ id: 'technical', state: 'moderate' }] };
    const strong = { coverage: [{ id: 'technical', state: 'strong' }] };
    assert.equal(isMeaningfulPassportImprovement(limited, moderate), true);
    assert.equal(isMeaningfulPassportImprovement(moderate, strong), false);
    assert.equal(isMeaningfulPassportImprovement(undefined, limited), false);
    assert.equal(isMeaningfulPassportImprovement(moderate, limited), false);
  });

  test('passport improvement fires on match or video milestones, not every edit', () => {
    assert.equal(isMeaningfulPassportImprovement({ matchCount: 0 }, { matchCount: 1 }), true);
    assert.equal(isMeaningfulPassportImprovement({ matchCount: 3 }, { matchCount: 4 }), false);
    assert.equal(isMeaningfulPassportImprovement({ matchCount: 4 }, { matchCount: 5 }), true);
    assert.equal(isMeaningfulPassportImprovement({ videoCount: 2 }, { videoCount: 3 }), true);
    assert.equal(isMeaningfulPassportImprovement({ matchCount: 5 }, { matchCount: 4 }), false);
  });

  test('watchlist changes report what a player added', () => {
    assert.deepEqual(summaryChanges({ matchCount: 2, videoCount: 1 }, { matchCount: 3, videoCount: 2 }), ['match', 'video']);
    assert.deepEqual(summaryChanges({ matchCount: 2 }, { matchCount: 2 }), []);
    assert.deepEqual(summaryChanges(null, { videoCount: 1 }), ['video']);
  });
});
