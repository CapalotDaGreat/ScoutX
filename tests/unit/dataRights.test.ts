import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DELETION_STEPS as SERVER_STEPS,
  isDeletionStep,
  nextDeletionStep,
} from '../../functions/src/dataRights/deletion.ts';
import { toPlain } from '../../functions/src/dataRights/dataExport.ts';
import { subjectHash } from '../../functions/src/dataRights/legalRetention.ts';
import {
  PRIVACY_REQUEST_TYPES as SERVER_TYPES,
  cleanDetails,
  isPrivacyRequestType,
  selfServiceFor,
} from '../../functions/src/dataRights/privacyRequests.ts';
import { PRIVACY_REQUEST_DEADLINE_DAYS, RETENTION } from '../../functions/src/dataRights/retention.ts';
import {
  DELETION_STEPS,
  PRIVACY_REQUEST_TYPES,
  deletionFraction,
  parseDeletionProgress,
  parseExportJob,
  parsePrivacyRequest,
} from '../../src/features/data-rights/types.ts';

describe('deletion state machine', () => {
  test('steps run in a fixed order and end at completed', () => {
    assert.equal(nextDeletionStep('requested'), 'access_revoked');
    assert.equal(nextDeletionStep('derived_deleted'), 'verified');
    assert.equal(nextDeletionStep('verified'), 'completed');
    assert.equal(nextDeletionStep('completed'), null);
    assert.equal(isDeletionStep('primary_deleted'), true);
    assert.equal(isDeletionStep('nuked'), false);
  });

  test('client and server agree on steps and request types', () => {
    assert.deepEqual([...DELETION_STEPS], [...SERVER_STEPS]);
    assert.deepEqual([...PRIVACY_REQUEST_TYPES], [...SERVER_TYPES]);
  });

  test('progress parsing and fraction', () => {
    assert.equal(parseDeletionProgress({ step: 'bogus' }), null);
    assert.deepEqual(parseDeletionProgress({ step: 'media_deleted', status: 'failed' }), { step: 'media_deleted', status: 'failed' });
    assert.equal(deletionFraction('requested'), 0);
    assert.equal(deletionFraction('completed'), 1);
  });
});

describe('legal retention', () => {
  test('subject hash is stable, one-way looking and does not contain the uid', () => {
    const hash = subjectHash('uid-123');
    assert.equal(hash, subjectHash('uid-123'));
    assert.notEqual(hash, subjectHash('uid-124'));
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.equal(hash.includes('uid-123'), false);
  });

  test('retention periods are positive and exports expire after 7 days', () => {
    assert.equal(RETENTION.exportDays, 7);
    for (const value of Object.values(RETENTION)) assert.ok(value > 0);
    assert.equal(PRIVACY_REQUEST_DEADLINE_DAYS, 30);
  });
});

describe('data export', () => {
  test('location-like keys are dropped from movement data', () => {
    const cleaned = toPlain(
      { distanceMeters: 5000, heatmap: { cells: [1] }, location: { lat: 1 }, Latitude: 2, nested: { lng: 3, keep: true }, at: new Date('2026-10-07T00:00:00.000Z') },
      true,
    );
    assert.deepEqual(cleaned, { distanceMeters: 5000, heatmap: { cells: [1] }, nested: { keep: true }, at: '2026-10-07T00:00:00.000Z' });
  });

  test('other sections keep their fields', () => {
    assert.deepEqual(toPlain({ location: 'Home ground' }), { location: 'Home ground' });
  });

  test('export job parsing', () => {
    assert.equal(parseExportJob('x', { status: 'weird', requestedAt: 'a' }), null);
    const job = parseExportJob('x', { status: 'ready', requestedAt: '2026-10-07T00:00:00.000Z', expiresAt: '2026-10-14T00:00:00.000Z', sizeBytes: 12 });
    assert.equal(job?.downloadUrl, null);
    assert.equal(job?.sizeBytes, 12);
  });
});

describe('privacy requests', () => {
  test('details are cleaned and capped', () => {
    assert.equal(cleanDetails('  hi\u0000 there\u0007 '), 'hi there');
    assert.equal(cleanDetails(42), '');
    assert.equal(cleanDetails('x'.repeat(3000)).length, 2000);
  });

  test('each request type points to the matching self-service action', () => {
    assert.equal(selfServiceFor('access'), 'data_export');
    assert.equal(selfServiceFor('portability'), 'data_export');
    assert.equal(selfServiceFor('deletion'), 'account_deletion');
    assert.equal(selfServiceFor('withdrawal'), 'privacy_center_consents');
    assert.equal(selfServiceFor('objection'), null);
    assert.equal(isPrivacyRequestType('access'), true);
    assert.equal(isPrivacyRequestType('erase-everything'), false);
  });

  test('request parsing requires a deadline', () => {
    assert.equal(parsePrivacyRequest('r', { type: 'access', status: 'received', createdAt: 'a' }), null);
    assert.equal(parsePrivacyRequest('r', { type: 'access', status: 'received', createdAt: 'a', deadlineAt: 'b' })?.resolution, null);
  });
});
