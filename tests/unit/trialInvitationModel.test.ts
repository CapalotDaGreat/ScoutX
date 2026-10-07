import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTrialAcceptance,
  buildTrialInvitation,
  serializeTrialInvitation,
  serializeTrialNotification,
} from '../../src/features/trial-invitations/models/TrialInvitationModel.ts';

function undefinedPaths(value: unknown, path = '$'): string[] {
  if (value === undefined) return [path];
  if (Array.isArray(value)) return value.flatMap((item, index) => undefinedPaths(item, `${path}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => undefinedPaths(item, `${path}.${key}`));
  }
  return [];
}

const draft = {
  club: 'FC Academy',
  coach: 'Coach Kim',
  location: 'Pitch 2',
  scheduledDate: '2026-10-20T14:00',
  notes: '',
};

describe('trial invitation serialisation', () => {
  test('a new invitation serialises without undefined values', () => {
    const invitation = buildTrialInvitation('scout-1', 'Scout', 'player-1', 'Player', draft);
    const serialized = serializeTrialInvitation(invitation);

    assert.deepEqual(undefinedPaths(serialized), []);
    assert.equal(serialized.status, 'pending');
    assert.equal('prep' in serialized, false);
    assert.equal('evaluation' in serialized, false);
  });

  test('an acceptance without a note serialises without undefined values', () => {
    const invitation = buildTrialInvitation('scout-1', 'Scout', 'player-1', 'Player', draft);
    const serialized = serializeTrialInvitation(applyTrialAcceptance(invitation, 'player-1', 'Player'));

    assert.deepEqual(undefinedPaths(serialized), []);
    assert.equal(serialized.status, 'accepted');
  });

  test('a notification without thread links serialises without undefined values', () => {
    const serialized = serializeTrialNotification({
      id: 'notif-1',
      recipientId: 'player-1',
      recipientRole: 'player',
      type: 'trial',
      title: 'Trial invitation',
      body: 'FC Academy invited you',
      read: false,
      createdAt: '2026-10-07T10:00:00.000Z',
    });

    assert.deepEqual(undefinedPaths(serialized), []);
  });
});
