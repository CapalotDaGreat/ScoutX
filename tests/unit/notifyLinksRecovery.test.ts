import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isGuardianToken,
  resolveDeepLinkPath,
  resolutionToPath,
} from '../../src/navigation/deepLinkResolver.ts';
import {
  GENERIC_PUSH_COPY,
  lockScreenCopy,
  parseStoredPreferences,
} from '../../functions/src/notificationPolicy.ts';
import { parseNotificationPreferences } from '../../src/features/notifications/services/notificationPreferencesParser.ts';
import {
  RESUMABLE_SESSION_MAX_AGE_MS,
  classifyPendingUpload,
  requestFromPending,
} from '../../src/features/media-upload/services/uploadRecovery.ts';
import type { PendingUpload, ServerUploadRecord } from '../../src/features/media-upload/types.ts';

const TOKEN = `${'a'.repeat(120)}.${'b'.repeat(43)}`;
const signedOut = { authenticated: false, role: null } as const;
const player = { authenticated: true, role: 'player' } as const;
const scout = { authenticated: true, role: 'scout' } as const;

describe('guardian and report deep links', () => {
  test('guardian links route to the hand-off screen without sign-in for any session', () => {
    for (const session of [signedOut, player, scout]) {
      assert.deepEqual(resolveDeepLinkPath(`guardian/${TOKEN}`, session), {
        kind: 'route',
        path: `link/guardian/${TOKEN}`,
      });
    }
  });

  test('malformed guardian tokens are invalid', () => {
    assert.equal(isGuardianToken(TOKEN), true);
    assert.equal(isGuardianToken('short.tok'), false);
    assert.equal(isGuardianToken(`${'a'.repeat(40)}`), false, 'signature is required');
    assert.equal(isGuardianToken(`${'a'.repeat(40)}.${'b'.repeat(43)}.x`), false);
    assert.deepEqual(resolveDeepLinkPath('guardian/../../etc', player), { kind: 'unavailable', reason: 'invalid' });
    assert.deepEqual(resolveDeepLinkPath(`guardian/${TOKEN}/extra`, player), { kind: 'unavailable', reason: 'invalid' });
  });

  test('report links need sign-in, carry the owner, and work for every role', () => {
    assert.deepEqual(resolveDeepLinkPath('report/owner1/media1', signedOut), {
      kind: 'requires_auth',
      resumePath: 'report/owner1/media1',
    });
    for (const session of [player, scout]) {
      assert.equal(
        resolutionToPath(resolveDeepLinkPath('report/owner1/media1', session)),
        'link/report/owner1/media1',
      );
    }
    assert.deepEqual(resolveDeepLinkPath('report/media1', player), { kind: 'unavailable', reason: 'invalid' });
    assert.deepEqual(resolveDeepLinkPath('report/own$er/m', player), { kind: 'unavailable', reason: 'invalid' });
  });
});

describe('lock-screen privacy', () => {
  const detailed = { title: 'Match analysis ready', body: 'Your analysis vs FC Example is ready.' };

  test('minors always get generic copy; adults choose', () => {
    assert.deepEqual(lockScreenCopy(detailed, 'details', true), GENERIC_PUSH_COPY);
    assert.deepEqual(lockScreenCopy(detailed, 'generic', false), GENERIC_PUSH_COPY);
    assert.deepEqual(lockScreenCopy(detailed, 'details', false), detailed);
  });

  test('server and client parsers agree and default to details', () => {
    for (const parse of [parseStoredPreferences, parseNotificationPreferences]) {
      assert.equal(parse(undefined).lockScreenPreview, 'details');
      assert.equal(parse({ lockScreenPreview: 'generic' }).lockScreenPreview, 'generic');
      assert.equal(parse({ lockScreenPreview: 'everything' }).lockScreenPreview, 'details');
    }
  });
});

describe('upload recovery after restart', () => {
  const now = Date.parse('2026-10-07T12:00:00Z');
  const pending: PendingUpload = {
    uploadId: 'u1',
    sessionUri: 'https://storage.example/session',
    fileUri: 'file:///match.mp4',
    fileName: 'match.mp4',
    contentType: 'video/mp4',
    sizeBytes: 500_000_000,
    declaredDurationSec: 5400,
    jobId: 'job1',
    purpose: 'match_footage',
    chunkBytes: 8 * 1024 * 1024,
    createdAt: '2026-10-06T12:00:00Z',
  };
  const server = (state: ServerUploadRecord['state']): ServerUploadRecord => ({
    uploadId: 'u1',
    state,
    jobId: 'job1',
    rejectionReason: null,
  });

  test('open sessions can resume; finished and closed ones are cleaned up', () => {
    assert.equal(classifyPendingUpload(pending, server('uploading'), now), 'resumable');
    assert.equal(classifyPendingUpload(pending, server('quarantined'), now), 'finished');
    assert.equal(classifyPendingUpload(pending, server('ready'), now), 'finished');
    assert.equal(classifyPendingUpload(pending, server('rejected'), now), 'closed');
    assert.equal(classifyPendingUpload(pending, server('cancelled'), now), 'closed');
    assert.equal(classifyPendingUpload(pending, 'missing', now), 'closed');
  });

  test('offline keeps the record unless the session is past its lifetime', () => {
    assert.equal(classifyPendingUpload(pending, null, now), 'unknown');
    const stale = now + RESUMABLE_SESSION_MAX_AGE_MS;
    assert.equal(classifyPendingUpload(pending, null, stale), 'closed');
    assert.equal(classifyPendingUpload(pending, server('uploading'), stale), 'closed');
  });

  test('the resume request matches the original upload', () => {
    assert.deepEqual(requestFromPending(pending), {
      purpose: 'match_footage',
      jobId: 'job1',
      fileUri: 'file:///match.mp4',
      fileName: 'match.mp4',
      contentType: 'video/mp4',
      declaredDurationSec: 5400,
    });
  });
});
