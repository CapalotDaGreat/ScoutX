// Chunked resumable upload against the Firestore + Storage emulators: session creation,
// consent/ownership gates, dedupe, quotas, interrupted transfer with resume, cancel, cleanup.
import { before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { mediaFixtures } from './support/mediaFixtures.mjs';
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
let processQuarantinedObject;
let setMediaScanner;
let noopMediaScanner;
let cancelMatchAnalysis;
let fixtures;
let videoPolicyVersion;
const enqueued = [];

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
  await db.recursiveDelete(db.collection('usageLedger'));
}

before(async () => {
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET });
  db = getFirestore();
  ({ createUploadSession, cancelUploadSession, expireAbandonedUploads } = require('./lib/uploads/sessions.js'));
  ({ processQuarantinedObject } = require('./lib/uploads/quarantine.js'));
  ({ cancelMatchAnalysis } = require('./lib/matchAnalysis.js'));
  ({ setMediaScanner, noopMediaScanner } = require('./lib/uploads/mediaScanner.js'));
  require('./lib/analysis/taskDispatcher.js').setTaskDispatcher({
    enqueue: async (task) => {
      enqueued.push(task);
    },
  });
  fixtures = mediaFixtures();
  videoPolicyVersion = require('./lib/legal/legalVersions.generated.js').LEGAL_VERSIONS['video-recording-policy'];
  await seedUploader(UID);
  // Premium allows several full-match uploads per period, so the active-upload cap is what these tests hit.
  await db.doc(`entitlements/${UID}`).set({ status: 'premium', expiresAt: null });
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
  test('free plan: one full-match analysis per period, refunded for rejected or cancelled videos', async () => {
    const FREE = 'upload-free';
    await seedUploader(FREE);
    for (const jobId of ['job_q1', 'job_q2', 'job_q3']) await seedJob(jobId, FREE);
    const usedNow = async () => {
      const periods = await db.collection('usageLedger').doc(FREE).collection('periods').get();
      return periods.docs.reduce((sum, doc) => sum + (doc.get('counts.full_match_analysis') ?? 0), 0);
    };

    const first = await createUploadSession.run(call(FREE, request('job_q1', randomBytes(4096))));
    assert.equal(await usedNow(), 1);
    await assert.rejects(createUploadSession.run(call(FREE, request('job_q2', randomBytes(4096)))), (error) => {
      assert.equal(error.code, 'resource-exhausted');
      assert.equal(error.details?.reason, 'quota_exceeded');
      assert.equal(error.details?.feature, 'full_match_analysis');
      return true;
    });

    const path = `quarantine/${FREE}/${first.uploadId}/source`;
    await getStorage().bucket().file(path).save(randomBytes(4096));
    assert.equal(await processQuarantinedObject(db, path, 4096), 'rejected');
    assert.equal(await usedNow(), 0, 'a rejected video does not use the allowance');

    await createUploadSession.run(call(FREE, request('job_q2', randomBytes(4096))));
    assert.equal(await usedNow(), 1);
    await cancelMatchAnalysis.run(call(FREE, { jobId: 'job_q2' }));
    assert.equal(await usedNow(), 0, 'cancelling before analysis gives the allowance back');
    await createUploadSession.run(call(FREE, request('job_q3', randomBytes(4096))));
  });
});

describe('chunked transfer', () => {
  // The Storage emulator finalizes on the first PUT and does not implement Content-Range chunking,
  // so multi-chunk resume is covered against a protocol fake in tests/unit/chunkedUpload.test.ts.
  test('a real video sent through the session is validated and promoted to private match storage', async () => {
    await seedJob('job_land');
    const bytes = readFileSync(fixtures.mov);
    const session = await createUploadSession.run(
      call(UID, request('job_land', bytes, { contentType: 'video/quicktime', fileName: 'match.mov', declaredDurationSec: 30 })),
    );

    const uploader = new ResumableSessionUploader({
      sessionUri: session.sessionUri,
      source: bufferSource(bytes),
      chunkBytes: bytes.length,
    });
    assert.equal(await uploader.run(0), 'complete');

    const path = `quarantine/${UID}/${session.uploadId}/source`;
    const [stored] = await getStorage().bucket().file(path).download();
    assert.ok(stored.equals(bytes), 'stored object matches the source byte for byte');

    assert.equal(await processQuarantinedObject(db, path, stored.length), 'ready');
    const upload = (await db.doc(`mediaUploads/${session.uploadId}`).get()).data();
    assert.equal(upload.state, 'ready');
    assert.equal(upload.probe.container, 'mov');
    assert.equal(upload.scan.status, 'not_scanned', 'no malware scan is claimed');
    assert.equal((await db.doc(`mediaUploadSessions/${session.uploadId}`).get()).exists, false);

    const job = (await db.doc('matchAnalysisJobs/job_land').get()).data();
    assert.equal(job.videoStoragePath, `profiles/${UID}/matchFootage/job_land/video.mp4`);
    assert.equal(job.videoProbe.durationSec, 30);
    assert.equal(job.status, 'queued', 'promotion queues the analysis pipeline');
    assert.equal(job.pipelineState, 'queued');
    assert.equal(job.extractionSegments.length, 1);
    assert.ok(enqueued.some((task) => task.jobId === 'job_land' && task.kind === 'extract_segment'));
    assert.equal((await getStorage().bucket().file(path).exists())[0], false, 'quarantine copy removed');
    assert.equal((await getStorage().bucket().file(job.videoStoragePath).exists())[0], true);
  });

  test('objects in quarantine without an open upload are deleted', async () => {
    const path = `quarantine/${UID}/orphan_upload/source`;
    await getStorage().bucket().file(path).save(Buffer.alloc(2048, 7));
    assert.equal(await processQuarantinedObject(db, path, 2048), null);
    const [exists] = await getStorage().bucket().file(path).exists();
    assert.equal(exists, false);
  });
});

describe('ffprobe validation', () => {
  async function validate(name, file, { sizeOverride } = {}) {
    const uploadId = `val_${name}`;
    const jobId = `job_val_${name}`;
    const bytes = readFileSync(file);
    const path = `quarantine/${UID}/${uploadId}/source`;
    await seedJob(jobId);
    await getStorage().bucket().file(path).save(bytes, { contentType: 'video/mp4' });
    await db.doc(`mediaUploads/${uploadId}`).set({
      ownerId: UID,
      state: 'uploading',
      jobId,
      sizeBytes: sizeOverride ?? bytes.length,
      storagePath: path,
      createdAt: new Date().toISOString(),
    });
    const state = await processQuarantinedObject(db, path, bytes.length);
    const upload = (await db.doc(`mediaUploads/${uploadId}`).get()).data();
    return { state, upload, path, jobId };
  }

  for (const [name, minutes] of [['valid10', 10], ['valid45', 45], ['valid90', 90], ['valid120', 120]]) {
    test(`accepts a ${minutes}-minute match`, async () => {
      const { state, upload, jobId } = await validate(name, fixtures[name]);
      assert.equal(state, 'ready', upload.rejectionReason);
      assert.equal(Math.round(upload.probe.durationSec / 60), minutes);
      assert.equal(upload.probe.videoCodec, 'h264');
      assert.equal((await db.doc(`matchAnalysisJobs/${jobId}`).get()).get('measuredDurationSec'), upload.probe.durationSec);
    });
  }

  const rejections = [
    ['tooLong', 'too_long'],
    ['unsupportedCodec', 'unsupported_codec'],
    ['tinyResolution', 'resolution'],
    ['corrupted', 'probe_failed'],
    ['notVideo', 'not_video'],
  ];
  for (const [name, reason] of rejections) {
    test(`rejects ${name} as ${reason} and deletes the quarantined bytes`, async () => {
      const { state, upload, path, jobId } = await validate(name, fixtures[name]);
      assert.equal(state, 'rejected');
      assert.equal(upload.rejectionReason, reason);
      assert.equal((await getStorage().bucket().file(path).exists())[0], false);
      const job = (await db.doc(`matchAnalysisJobs/${jobId}`).get()).data();
      assert.equal(job.videoStoragePath, undefined);
      assert.equal(job.status, 'failed');
      assert.equal(job.errorCode, 'video_rejected');
    });
  }

  test('rejects an object whose size differs from the declared size', async () => {
    const { state, upload } = await validate('sizeMismatch', fixtures.mov, { sizeOverride: 1 });
    assert.equal(state, 'rejected');
    assert.equal(upload.rejectionReason, 'size_mismatch');
  });

  test('a flagged scan result rejects the upload through the scanner seam', async () => {
    setMediaScanner({ engine: 'test', scan: async () => ({ status: 'flagged', engine: 'test', checkedAt: '' }) });
    try {
      const { state, upload } = await validate('flagged', fixtures.mov);
      assert.equal(state, 'rejected');
      assert.equal(upload.rejectionReason, 'scanner_flagged');
    } finally {
      setMediaScanner(noopMediaScanner);
    }
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
    assert.equal((await db.doc('matchAnalysisJobs/job_old').get()).get('status'), 'expired');
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

  test('clients cannot forge validated video fields on their analysis jobs', async () => {
    const base = { id: 'rules_job', playerId: UID, status: 'uploading' };
    assert.ok(isDenied(await setDocument(UID, 'matchAnalysisJobs/rules_job_forged', {
      ...base,
      id: 'rules_job_forged',
      videoStoragePath: `profiles/${UID}/matchFootage/rules_job_forged/video.mp4`,
    })));
    assert.ok(isAllowed(await setDocument(UID, 'matchAnalysisJobs/rules_job', base)));
    assert.ok(isDenied(await setDocument(UID, 'matchAnalysisJobs/rules_job', { ...base, measuredDurationSec: 10 })));
    assert.ok(isDenied(await setDocument(UID, 'matchAnalysisJobs/rules_job', { ...base, status: 'queued' })));
    assert.ok(isAllowed(await setDocument(UID, 'matchAnalysisJobs/rules_job', {
      ...base,
      identityConfirmation: { state: 'pending', frameIds: [], confirmedAt: null },
    })));
  });

  test('clients can neither write nor read quarantine objects, even their own', async () => {
    const path = `quarantine/${UID}/rules_u2/source`;
    assert.ok(isDenied(await uploadObject(UID, path, 'video/mp4', 2048)));
    await getStorage().bucket().file(path).save(Buffer.alloc(2048, 1));
    assert.ok(isDenied(await downloadObject(UID, path)));
  });
});
