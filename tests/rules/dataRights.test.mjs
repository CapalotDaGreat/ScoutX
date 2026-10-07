// Data rights against the Firestore and Storage emulators: data export (recent sign-in, archive
// contents, no location data, owner-only access), privacy requests (validation, limits, staff
// handling with audit log) and scheduled retention cleanup.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { BUCKET, PROJECT_ID, downloadObject, getDocument, isAllowed, isDenied, setDocument } from './emulator.mjs';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

const USER = 'rights-user';
const OTHER = 'rights-other';
const DAY = 24 * 60 * 60 * 1000;

let db;
let bucket;
let exportsModule;
let requestsModule;
let runRetentionCleanup;
const queued = [];

function call(uid, data, token = {}) {
  return { data, auth: { uid, token }, rawRequest: { headers: {} }, acceptsStreaming: false };
}

const freshAuth = () => ({ auth_time: Math.floor(Date.now() / 1000) - 30 });

async function expectReason(promise, code, reason) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    if (reason) assert.equal(error.details?.reason, reason);
    return true;
  });
}

before(async () => {
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET });
  db = getFirestore();
  bucket = getStorage().bucket();
  exportsModule = require('./lib/dataRights/dataExport.js');
  exportsModule.setExportQueue({ enqueue: async (exportId) => queued.push(exportId) });
  requestsModule = require('./lib/dataRights/privacyRequests.js');
  ({ runRetentionCleanup } = require('./lib/dataRights/retentionCleanup.js'));

  await db.collection('users').doc(USER).set({ name: 'Rights User' });
  await db.collection('players').doc(USER).collection('matches').doc('m1').set({ opponent: 'FC Test', goals: 1 });
  await db.collection('gpsSessions').doc('gps-1').set({
    playerId: USER,
    distanceMeters: 8200,
    heatmap: { columns: 2, cells: [0, 1, 2, 3] },
    // Legacy fields that must never leave the server, even if an old build wrote them.
    location: { lat: 47.39, lng: 8.62 },
    start: { latitude: 47.39, longitude: 8.62 },
  });
  await db.collection('consentRecords').doc(USER).set({ consents: { ai_analysis: { status: 'granted', version: '1.0.0' } } });
  await db.collection('players').doc(OTHER).collection('matches').doc('m1').set({ opponent: 'Not mine' });
});

describe('data export', () => {
  test('requires sign-in within the last 10 minutes', async () => {
    await expectReason(exportsModule.requestDataExport.run(call(USER, {}, {})), 'failed-precondition', 'recent_login_required');
    const stale = { auth_time: Math.floor(Date.now() / 1000) - 3600 };
    await expectReason(exportsModule.requestDataExport.run(call(USER, {}, stale)), 'failed-precondition', 'recent_login_required');
    await expectReason(exportsModule.requestDataExport.run({ data: {}, rawRequest: { headers: {} }, acceptsStreaming: false }), 'unauthenticated');
  });

  test('builds an owner-only JSON archive without any location data and reuses it for a day', async () => {
    const started = await exportsModule.requestDataExport.run(call(USER, {}, freshAuth()));
    assert.equal(started.status, 'queued');
    assert.ok(queued.includes(started.exportId));
    const again = await exportsModule.requestDataExport.run(call(USER, {}, freshAuth()));
    assert.equal(again.exportId, started.exportId);
    assert.equal(again.reused, true);

    assert.equal(await exportsModule.processDataExport(db, started.exportId), 'ready');
    const job = (await db.collection('dataExports').doc(started.exportId).get()).data();
    assert.equal(job.storagePath, `exports/${USER}/${started.exportId}/scoutx-data-export.json`);
    const expiresIn = Date.parse(job.expiresAt) - Date.now();
    assert.ok(expiresIn > 6.9 * DAY && expiresIn <= 7 * DAY, 'link valid for 7 days');

    const [bytes] = await bucket.file(job.storagePath).download();
    const archive = JSON.parse(bytes.toString('utf8'));
    assert.equal(archive.accountId, USER);
    assert.equal(archive.sections.matches.length, 1);
    assert.equal(archive.sections.matches[0].opponent, 'FC Test');
    assert.equal(archive.sections.consents.summary.consents.ai_analysis.version, '1.0.0');
    const movement = archive.sections.movementSessions[0];
    assert.equal(movement.distanceMeters, 8200);
    assert.ok(movement.heatmap);
    const movementText = JSON.stringify(archive.sections.movementSessions);
    for (const key of ['"location"', '"lat"', '"lng"', '"latitude"', '"longitude"']) {
      assert.equal(movementText.includes(key), false, `no ${key} in movement sessions`);
    }
    assert.equal(JSON.stringify(archive).includes('Not mine'), false, 'no other user data');

    assert.ok(isAllowed(await getDocument(USER, `dataExports/${started.exportId}`)));
    assert.ok(isDenied(await getDocument(OTHER, `dataExports/${started.exportId}`)));
    assert.ok(isDenied(await setDocument(USER, `dataExports/${started.exportId}`, { status: 'ready' })));
    assert.ok(isAllowed(await downloadObject(USER, job.storagePath)));
    assert.ok(isDenied(await downloadObject(OTHER, job.storagePath)));
  });
});

describe('privacy requests', () => {
  test('validates type and details, sets a 30-day deadline and caps open requests', async () => {
    await expectReason(requestsModule.submitPrivacyRequest.run(call(OTHER, { type: 'gossip' })), 'invalid-argument');
    await expectReason(requestsModule.submitPrivacyRequest.run(call(OTHER, { type: 'correction', details: '' })), 'invalid-argument', 'details_required');
    const created = await requestsModule.submitPrivacyRequest.run(call(OTHER, { type: 'access', details: 'Please\u0000 send my data' }));
    assert.equal(created.selfService, 'data_export');
    const doc = (await db.collection('privacyRequests').doc(created.requestId).get()).data();
    assert.equal(doc.details, 'Please send my data');
    assert.equal(doc.status, 'received');
    const days = (Date.parse(doc.deadlineAt) - Date.parse(doc.createdAt)) / DAY;
    assert.equal(Math.round(days), 30);
    for (let i = 0; i < 4; i += 1) await requestsModule.submitPrivacyRequest.run(call(OTHER, { type: 'objection', details: `Objection number ${i}` }));
    await expectReason(requestsModule.submitPrivacyRequest.run(call(OTHER, { type: 'access' })), 'resource-exhausted', 'too_many_open');

    assert.ok(isAllowed(await getDocument(OTHER, `privacyRequests/${created.requestId}`)));
    assert.ok(isDenied(await getDocument(USER, `privacyRequests/${created.requestId}`)));
    assert.ok(isDenied(await setDocument(OTHER, `privacyRequests/${created.requestId}`, { status: 'completed' })));
  });

  test('only admins with recent sign-in can close a request, and it is audit-logged', async () => {
    const created = await requestsModule.submitPrivacyRequest.run(call(USER, { type: 'deletion' }));
    await expectReason(
      requestsModule.updatePrivacyRequest.run(call(USER, { requestId: created.requestId, status: 'completed', resolution: 'Done for you' })),
      'permission-denied',
    );
    const admin = { staffRole: 'admin', auth_time: Math.floor(Date.now() / 1000) - 10 };
    await requestsModule.updatePrivacyRequest.run(call('staff-admin', { requestId: created.requestId, status: 'completed', resolution: 'Account deleted on request.' }, admin));
    const doc = (await db.collection('privacyRequests').doc(created.requestId).get()).data();
    assert.equal(doc.status, 'completed');
    assert.ok(doc.closedAt);
    const audit = await db.collection('adminAuditLog').where('targetId', '==', created.requestId).get();
    assert.equal(audit.size, 1);
    await expectReason(
      requestsModule.updatePrivacyRequest.run(call('staff-admin', { requestId: created.requestId, status: 'rejected', resolution: 'Too late now' }, admin)),
      'failed-precondition',
    );
  });
});

describe('retention cleanup', () => {
  test('deletes expired and abandoned records and keeps everything still in use', async () => {
    const now = new Date();
    const old = (days) => new Date(now.getTime() - days * DAY).toISOString();
    await bucket.file(`exports/${USER}/old-export/scoutx-data-export.json`).save(Buffer.from('{}'));
    await db.collection('dataExports').doc('old-export').set({ uid: USER, status: 'ready', expiresAt: old(1), updatedAt: old(8) });
    await db.collection('dataExports').doc('live-export').set({ uid: USER, status: 'ready', expiresAt: new Date(now.getTime() + DAY).toISOString(), updatedAt: old(1) });
    await db.collection('mediaUploads').doc('old-rejected').set({ ownerId: USER, state: 'rejected', updatedAt: old(8) });
    await db.collection('mediaUploads').doc('new-rejected').set({ ownerId: USER, state: 'rejected', updatedAt: old(1) });
    await db.collection('mediaUploads').doc('old-ready').set({ ownerId: USER, state: 'ready', updatedAt: old(400) });
    await bucket.file(`profiles/${USER}/matchFootage/old-cancelled/frames/frame_0.jpg`).save(Buffer.from('x'));
    await db.collection('matchAnalysisJobs').doc('old-cancelled').set({ playerId: USER, status: 'cancelled', updatedAt: old(31) });
    await db.collection('matchAnalysisJobs').doc('old-complete').set({ playerId: USER, status: 'complete', updatedAt: old(400) });
    await db.collection('revenueCatEvents').doc('old-receipt').set({ type: 'RENEWAL', processedAt: old(91) });
    await db.collection('revenueCatEvents').doc('new-receipt').set({ type: 'RENEWAL', processedAt: old(1) });
    await db.collection('legalRetention').doc('expired-record').set({ kind: 'deletion_receipt', deleteAfter: old(1) });
    await db.collection('legalRetention').doc('live-record').set({ kind: 'deletion_receipt', deleteAfter: new Date(now.getTime() + DAY).toISOString() });

    const counts = await runRetentionCleanup(db, now);
    assert.ok(counts.exportsExpired >= 1);
    const exists = async (path) => (await db.doc(path).get()).exists;
    assert.equal((await db.doc('dataExports/old-export').get()).get('status'), 'expired');
    assert.equal((await bucket.file(`exports/${USER}/old-export/scoutx-data-export.json`).exists())[0], false);
    assert.equal((await db.doc('dataExports/live-export').get()).get('status'), 'ready');
    assert.equal(await exists('mediaUploads/old-rejected'), false);
    assert.equal(await exists('mediaUploads/new-rejected'), true);
    assert.equal(await exists('mediaUploads/old-ready'), true);
    assert.equal(await exists('matchAnalysisJobs/old-cancelled'), false);
    assert.equal((await bucket.file(`profiles/${USER}/matchFootage/old-cancelled/frames/frame_0.jpg`).exists())[0], false);
    assert.equal(await exists('matchAnalysisJobs/old-complete'), true, 'completed reports are kept');
    assert.equal(await exists('revenueCatEvents/old-receipt'), false);
    assert.equal(await exists('revenueCatEvents/new-receipt'), true);
    assert.equal(await exists('legalRetention/expired-record'), false);
    assert.equal(await exists('legalRetention/live-record'), true);
  });

  test('legal retention and deletion progress are closed to other users', async () => {
    await db.collection('deletionRequests').doc(USER).set({ uid: USER, step: 'requested', status: 'in_progress' });
    assert.ok(isAllowed(await getDocument(USER, `deletionRequests/${USER}`)));
    assert.ok(isDenied(await getDocument(OTHER, `deletionRequests/${USER}`)));
    assert.ok(isDenied(await setDocument(USER, `deletionRequests/${USER}`, { step: 'completed' })));
    assert.ok(isDenied(await getDocument(USER, 'legalRetention/live-record')));
  });
});
