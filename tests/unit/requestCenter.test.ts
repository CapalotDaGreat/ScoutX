import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attachmentKindsFor,
  buildRequestCenter,
  mapEvidenceRequest,
  mapTrialInvitation,
  mapVerificationRequest,
  requestsNeedingAttention,
} from '../../src/features/request-center/services/requestCenterService.ts';

const now = new Date('2026-10-07T12:00:00.000Z');

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    scoutId: 's1',
    playerId: 'p1',
    kinds: ['highlight'],
    message: 'Show me your pressing',
    status: 'pending',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('request center', () => {
  test('open evidence requests can be fulfilled until they expire', () => {
    const open = mapEvidenceRequest(evidence(), now);
    assert.equal(open.status, 'pending');
    assert.equal(open.nextAction, 'fulfill');
    assert.equal(open.expiresAt, '2026-10-31T00:00:00.000Z');

    const stale = mapEvidenceRequest(evidence({ createdAt: '2026-08-01T00:00:00.000Z' }), now);
    assert.equal(stale.status, 'expired');
    assert.equal(stale.nextAction, 'none');
  });

  test('fulfilled requests carry the validated response only', () => {
    const done = mapEvidenceRequest(
      evidence({
        status: 'fulfilled',
        response: {
          attachments: [{ kind: 'media', id: 'm1' }, { kind: 'bogus', id: 'x' }, { kind: 'gps' }],
          note: 'Second half',
          fulfilledAt: '2026-10-02T00:00:00.000Z',
        },
      }),
      now,
    );
    assert.equal(done.status, 'completed');
    assert.deepEqual(done.response, {
      attachments: [{ kind: 'media', id: 'm1' }],
      note: 'Second half',
      at: '2026-10-02T00:00:00.000Z',
    });
  });

  test('trial statuses map to request statuses using the scheduled date', () => {
    const base = { id: 't1', club: 'FC Test', notes: '', createdAt: '2026-09-01T00:00:00.000Z' };
    assert.equal(mapTrialInvitation({ ...base, status: 'pending', scheduledDate: '2026-11-01' }, now).nextAction, 'respond');
    assert.equal(mapTrialInvitation({ ...base, status: 'pending', scheduledDate: '2026-09-01' }, now).status, 'expired');
    assert.equal(mapTrialInvitation({ ...base, status: 'accepted', scheduledDate: '2026-11-01' }, now).status, 'accepted');
    assert.equal(mapTrialInvitation({ ...base, status: 'accepted', scheduledDate: '2026-09-01' }, now).status, 'in_progress');
    assert.equal(mapTrialInvitation({ ...base, status: 'cancelled', scheduledDate: '2026-11-01' }, now).status, 'declined');
  });

  test('verification requests are waiting on a reviewer, not the player', () => {
    const pending = mapVerificationRequest({ id: 'v1', status: 'pending', evidence: 'club letter', createdAt: '2026-10-01' });
    assert.equal(pending.status, 'in_progress');
    assert.equal(pending.nextAction, 'wait');
    assert.equal(mapVerificationRequest({ id: 'v2', status: 'approved', evidence: '', createdAt: '' }).status, 'completed');
  });

  test('the list puts actionable items first and attention sorts by expiry', () => {
    const list = buildRequestCenter(
      {
        evidenceRequests: [
          evidence({ id: 'old', status: 'fulfilled' }),
          evidence({ id: 'late', createdAt: '2026-10-05T00:00:00.000Z' }),
          evidence({ id: 'soon', createdAt: '2026-09-20T00:00:00.000Z' }),
        ],
        trials: [],
        verifications: [],
      },
      now,
    );
    assert.deepEqual(list.map((item) => item.entityId), ['late', 'soon', 'old']);
    assert.deepEqual(requestsNeedingAttention(list).map((item) => item.entityId), ['soon', 'late']);
  });

  test('requested kinds restrict what can be attached', () => {
    assert.deepEqual(attachmentKindsFor(['gps']), ['gps']);
    assert.deepEqual(attachmentKindsFor(['match_footage']).sort(), ['analysis', 'media']);
    assert.deepEqual(attachmentKindsFor([]).sort(), ['analysis', 'gps', 'match', 'media']);
  });
});
