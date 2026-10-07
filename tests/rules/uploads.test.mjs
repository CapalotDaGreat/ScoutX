// Chunked resumable upload against the Firestore + Storage emulators: session creation,
// consent/ownership gates, dedupe, quotas, interrupted transfer with resume, cancel, cleanup.
import { before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  BUCKET,
  PROJECT_ID,
  downloadObject,
  getDocument,
  isAllowed,
  isDenied,
  setDocument,
  uploadObject,
} from './emulator.mjs';
import { ResumableSessionUploader } from '../../src/features/media-upload/services/resumableSessionUploader.ts';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

const UID = 'upload-owner';
const OTHER = 'upload-other';
const CHUNK = 256 * 1024;

let db;
let createUploadSession;
let cancelUploadSession;
let expireAbandonedUploads;
let recordQuarantinedObject;
let videoPolicyVersion;

function call(uid, data) {
  return { data, auth: { uid, token: {} }, rawRequest: { headers: {} }, acceptsStreaming: false };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    return true;
  });
}

async function seedUploader(uid, { consent = true } = {}) {
  await db.doc(`userSafety/${uid}`).set({ ageBand: '18plus', guardianStatus: 'not_required', scopes: [] });
  await db.doc(`consentRecords/${uid}`).set({
    uid,
    consents: consent ? { media_upload: { status: 'granted', version: videoPolicyVersion } } : {},
  });
}

async function seedJob(jobId, playerId = UID) {
  await db.doc(`matchAnalysisJobs/${jobId}`).set({ id: jobId, playerId, status: 'uploading' });
}

function request(jobId, bytes, overrides = {}) {
  return {
    purpose: 'match_footage',
    jobId,
    fileName: 'match.mp4',
    contentType: 'video/mp4',
    sizeBytes: bytes.length,
    declaredDurationSec: 600,
    fingerprint: createHash('sha256').update(bytes).digest('hex'),
    ...overrides,
  };
}

function bufferSource(bytes) {
  return {
    size: bytes.length,
    read: async (offset, length) => {
      const slice = bytes.subarray(offset, offset + length);
      return slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength);
    },
    close: () => undefined,
  };
}

async function clearUploads() {
  for (const name of ['mediaUploads', 'mediaUploadSessions', 'uploadSessionLimits']) {
    const docs = await db.collection(name).get();
    await Promise.all(docs.docs.map((doc) => doc.ref.delete()));
  }
}

before(async () => {
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET });
  db = getFirestore();
  ({ createUploadSession, cancelUploadSession, expireAbandonedUploads } = require('./lib/uploads/sessions.js'));
  ({ recordQuarantinedObject } = require('./lib/uploads/quarantine.js'));
  videoPolicyVersion = require('./lib/legal/legalVersions.generated.js').LEGAL_VERSIONS['video-recording-policy'];
  await seedUploader(UID);
});

beforeEach(clearUploads);

describe('createUploadSession', () => {
  test('rejects missing consent, foreign jobs and invalid files', async () => {
    await seedUploader(OTHER, { consent: false });
    await seedJob('job_noconsent', OTHER);
    const bytes = randomBytes(4096);
    await expectCode(createUploadSession.run(call(OTHER, request('job_noconsent', bytes))), 'failed-precondition');

    await seedJob('job_foreign', OTHER);
    await expectCode(createUploadSession.run(call(UID, request('job_foreign', bytes))), 'failed-precondition');

    await seedJob('job_bad');
    await expectCode(
      createUploadSession.run(call(UID, request('job_bad', bytes, { contentType: 'video/webm' }))),
      'invalid-argument',
    );
    await expectCode(
      createUploadSession.run(call(UID, request('job_bad', bytes, { sizeBytes: 5 * 1024 ** 3 }))),
      'invalid-argument',
    );
    await expectCode(
      createUploadSession.run(call(UID, request('job_bad', bytes, { declaredDurationSec: 9001 }))),
      'invalid-argument',
    );
    await expectCode(createUploadSession.run({ ...call(UID, request('job_bad', bytes)), auth: undefined }), 'unauthenticated');
  });

  test('stores the session URI server-side only and dedupes the same file for the same job', async () => {
    await seedJob('job_dedupe');
    const bytes = randomBytes(CHUNK * 2);
    const first = await createUploadSession.run(call(UID, request('job_dedupe', bytes)));
    assert.equal(first.state, 'uploading');
    assert.equal(first.reused, false);
    assert.match(first.sessionUri, /^https?:\/\//);

    const upload = (await db.doc(`mediaUploads/${first.uploadId}`).get()).data();
    assert.equal(upload.ownerId, UID);
    assert.equal(upload.storagePath, `quarantine/${UID}/${first.uploadId}/source`);
    assert.equal(upload.sessionUri, undefined, 'session URI is not on the owner-readable doc');

    const second = await createUploadSession.run(call(UID, request('job_dedupe', bytes)));
    assert.equal(second.uploadId, first.uploadId);
    assert.equal(second.reused, true);
    assert.equal(second.sessionUri, first.sessionUri);
  });

  test('enforces the active upload limit', async () => {
    for (const jobId of ['job_l1', 'job_l2', 'job_l3']) await seedJob(jobId);
    await createUploadSession.run(call(UID, request('job_l1', randomBytes(4096))));
    await createUploadSession.run(call(UID, request('job_l2', randomBytes(4096))));
    await expectCode(createUploadSession.run(call(UID, request('job_l3', randomBytes(4096)))), 'resource-exhausted');
  });
});

describe('chunked transfer', () => {
  // The Storage emulator finalizes on the first PUT and does not implement Content-Range chunking,
  // so multi-chunk resume is covered against a protocol fake in tests/unit/chunkedUpload.test.ts.
  test('bytes sent to the session land in quarantine and the upload becomes quarantined', async () => {
    await seedJob('job_land');
    const bytes = randomBytes(CHUNK + 1234);
    const session = await createUploadSession.run(call(UID, request('job_land', bytes)));

    const uploader = new ResumableSessionUploader({
      sessionUri: session.sessionUri,
      source: bufferSource(bytes),
      chunkBytes: bytes.length,
    });
    assert.equal(await uploader.run(0), 'complete');

    const path = `quarantine/${UID}/${session.uploadId}/source`;
    const [stored] = await getStorage().bucket().file(path).download();
    assert.equal(stored.length, bytes.length);
    assert.ok(stored.equals(bytes), 'stored object matches the source byte for byte');

    assert.equal(await recordQuarantinedObject(db, path, stored.length), 'quarantined');
    const upload = (await db.doc(`mediaUploads/${session.uploadId}`).get()).data();
    assert.equal(upload.state, 'quarantined');
    assert.equal((await db.doc(`mediaUploadSessions/${session.uploadId}`).get()).exists, false);
  });

  test('objects in quarantine without an open upload are deleted', async () => {
    const path = `quarantine/${UID}/orphan_upload/source`;
    await getStorage().bucket().file(path).save(Buffer.alloc(2048, 7));
    assert.equal(await recordQuarantinedObject(db, path, 2048), null);
    const [exists] = await getStorage().bucket().file(path).exists();
    assert.equal(exists, false);
  });
});

describe('cancel and cleanup', () => {
  test('only the owner can cancel, and cancel discards the session', async () => {
    await seedJob('job_cancel');
    const session = await createUploadSession.run(call(UID, request('job_cancel', randomBytes(4096))));
    await expectCode(cancelUploadSession.run(call(OTHER, { uploadId: session.uploadId })), 'not-found');
    await cancelUploadSession.run(call(UID, { uploadId: session.uploadId }));
    assert.equal((await db.doc(`mediaUploads/${session.uploadId}`).get()).get('state'), 'cancelled');
    assert.equal((await db.doc(`mediaUploadSessions/${session.uploadId}`).get()).exists, false);
  });

  test('abandoned uploads expire after seven days', async () => {
    await seedJob('job_old');
    const session = await createUploadSession.run(call(UID, request('job_old', randomBytes(4096))));
    await db.doc(`mediaUploads/${session.uploadId}`).update({ createdAt: '2020-01-01T00:00:00.000Z' });
    await expireAbandonedUploads(db, new Date());
    assert.equal((await db.doc(`mediaUploads/${session.uploadId}`).get()).get('state'), 'expired');
  });
});

describe('rules', () => {
  test('owners read their upload state; session URIs and limits are never client-readable', async () => {
    await db.doc('mediaUploads/rules_u1').set({ ownerId: UID, state: 'uploading' });
    await db.doc('mediaUploadSessions/rules_u1').set({ sessionUri: 'https://example.invalid' });
    await db.doc(`uploadSessionLimits/${UID}_2026-01-01`).set({ ownerId: UID, count: 1 });

    assert.ok(isAllowed(await getDocument(UID, 'mediaUploads/rules_u1')));
    assert.ok(isDenied(await getDocument(OTHER, 'mediaUploads/rules_u1')));
    assert.ok(isDenied(await setDocument(UID, 'mediaUploads/rules_u1', { ownerId: UID, state: 'ready' })));
    assert.ok(isDenied(await getDocument(UID, 'mediaUploadSessions/rules_u1')));
    assert.ok(isDenied(await getDocument(UID, `uploadSessionLimits/${UID}_2026-01-01`)));
  });

  test('clients can neither write nor read quarantine objects, even their own', async () => {
    const path = `quarantine/${UID}/rules_u2/source`;
    assert.ok(isDenied(await uploadObject(UID, path, 'video/mp4', 2048)));
    await getStorage().bucket().file(path).save(Buffer.alloc(2048, 1));
    assert.ok(isDenied(await downloadObject(UID, path)));
  });
});
