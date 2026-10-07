// Runs the compiled moderation pipeline against the Firestore emulator: report triage and
// automatic restriction, staff actions, notices, appeals and the public report form.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { BUCKET, PROJECT_ID } from './emulator.mjs';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const OWNER = 'mod-owner';
const REPORTER = 'mod-reporter';
const MODERATOR = 'mod-moderator';
const ADMIN = 'mod-admin';
const SECOND_ADMIN = 'mod-admin-2';

let db;
let triageReport;
let applyModerationAction;
let submitAppeal;
let resolveAppeal;
let submitPublicReport;

function staff(uid, staffRole, data) {
  return {
    data,
    auth: { uid, token: { staffRole, auth_time: Math.floor(Date.now() / 1000) } },
    rawRequest: { headers: {} },
    acceptsStreaming: false,
  };
}

function user(uid, data) {
  return { data, auth: { uid, token: {} }, rawRequest: { headers: {} }, acceptsStreaming: false };
}

function publicRequest(data, ip) {
  return { data, rawRequest: { headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` }, ip: '10.0.0.1' }, acceptsStreaming: false };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    return true;
  });
}

async function seedMedia(mediaId) {
  await db.doc(`players/${OWNER}/media/${mediaId}`).set({
    id: mediaId,
    ownerId: OWNER,
    type: 'highlight',
    storagePath: `profiles/${OWNER}/videos/${mediaId}/video.mp4`,
    visibility: 'passport',
    rightsState: 'user_confirmed',
    moderationState: 'none',
  });
}

async function report(reportId, mediaId, reason, reporterId = REPORTER) {
  const data = { reporterId, targetType: 'media', targetId: mediaId, targetOwnerId: OWNER, reason, createdAt: new Date().toISOString() };
  await db.doc(`contentReports/${reportId}`).set(data);
  return triageReport(db, reportId, data);
}

before(async () => {
  if (!getApps().length) {
    initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET });
  }
  db = getFirestore();
  ({ triageReport, submitPublicReport } = require('./lib/moderation/reports.js'));
  ({ applyModerationAction, submitAppeal, resolveAppeal } = require('./lib/moderation/actions.js'));
  await db.doc(`users/${OWNER}`).set({ role: 'player' });
});

describe('report triage', () => {
  test('"I appear in this video" restricts the media at once and groups later reports', async () => {
    await seedMedia('mv1');
    const caseId = await report('mr1', 'mv1', 'appears_in_video');
    assert.ok(caseId);

    const media = (await db.doc(`players/${OWNER}/media/mv1`).get()).data();
    assert.equal(media.visibility, 'private');
    assert.equal(media.moderationState, 'restricted');
    assert.equal(media.visibilityBeforeHold, 'passport');
    assert.equal((await db.doc('moderationHolds/media_mv1').get()).exists, true);
    assert.equal((await db.doc('contentReports/mr1').get()).get('caseId'), caseId);

    const again = await report('mr2', 'mv1', 'minor_in_video', 'mod-reporter-2');
    assert.equal(again, caseId);
    const moderationCase = (await db.doc(`moderationCases/${caseId}`).get()).data();
    assert.equal(moderationCase.reportCount, 2);
    assert.equal(moderationCase.priority, 'urgent');
    assert.equal(moderationCase.targetOwnerId, OWNER);

    const audit = await db.collection('adminAuditLog').where('caseId', '==', caseId).get();
    assert.equal(audit.docs.some((doc) => doc.get('action') === 'auto_restrict'), true);
  });

  test('an unverifiable owner never becomes the case owner', async () => {
    const data = { reporterId: REPORTER, targetType: 'media', targetId: 'ghost', targetOwnerId: 'victim', reason: 'spam' };
    await db.doc('contentReports/mr-ghost').set(data);
    const caseId = await triageReport(db, 'mr-ghost', data);
    assert.equal((await db.doc(`moderationCases/${caseId}`).get()).get('targetOwnerId'), null);
  });
});

describe('staff actions', () => {
  test('dismissal restores the media and notifies the owner; non-staff are refused', async () => {
    await seedMedia('mv2');
    const caseId = await report('mr3', 'mv2', 'appears_in_video');

    await expectCode(applyModerationAction.run(user(OWNER, { caseId, action: 'dismiss', reason: 'Looks fine' })), 'permission-denied');
    await expectCode(
      applyModerationAction.run(staff(MODERATOR, 'moderator', { caseId, action: 'dismiss', reason: 'no' })),
      'invalid-argument',
    );
    await applyModerationAction.run(staff(MODERATOR, 'moderator', { caseId, action: 'dismiss', reason: 'Owner is not in the clip' }));

    const media = (await db.doc(`players/${OWNER}/media/mv2`).get()).data();
    assert.equal(media.visibility, 'passport');
    assert.equal(media.moderationState, 'none');
    assert.equal((await db.doc('moderationHolds/media_mv2').get()).exists, false);
    const notice = (await db.doc(`moderationNotices/${OWNER}/items/${caseId}`).get()).data();
    assert.equal(notice.action, 'restored');
    assert.equal((await db.doc(`moderationCases/${caseId}`).get()).get('state'), 'closed');
  });

  test('moderators cannot remove; admins can, and a different reviewer decides the appeal', async () => {
    await seedMedia('mv3');
    const caseId = await report('mr4', 'mv3', 'privacy');

    await expectCode(
      applyModerationAction.run(staff(MODERATOR, 'moderator', { caseId, action: 'remove', reason: 'Shows a home address' })),
      'permission-denied',
    );
    await applyModerationAction.run(staff(ADMIN, 'admin', { caseId, action: 'remove', reason: 'Shows a home address' }));
    const removed = (await db.doc(`players/${OWNER}/media/mv3`).get()).data();
    assert.equal(removed.moderationState, 'removed');
    assert.equal(removed.visibility, 'private');
    assert.equal((await db.doc(`moderationNotices/${OWNER}/items/${caseId}`).get()).get('appealable'), true);

    await expectCode(submitAppeal.run(user(REPORTER, { caseId, text: 'This is not my video at all.' })), 'not-found');
    await submitAppeal.run(user(OWNER, { caseId, text: 'The address is blurred in the final cut.' }));
    await expectCode(submitAppeal.run(user(OWNER, { caseId, text: 'Trying a second appeal here.' })), 'failed-precondition');

    await expectCode(
      resolveAppeal.run(staff(ADMIN, 'admin', { caseId, outcome: 'overturned', reason: 'Self review' })),
      'permission-denied',
    );
    await resolveAppeal.run(staff(SECOND_ADMIN, 'admin', { caseId, outcome: 'overturned', reason: 'Address is not readable' }));

    const restored = (await db.doc(`players/${OWNER}/media/mv3`).get()).data();
    assert.equal(restored.moderationState, 'none');
    assert.equal(restored.visibility, 'passport');
    assert.equal(restored.rightsState, 'user_confirmed');
    assert.equal((await db.doc(`appeals/${caseId}`).get()).get('state'), 'overturned');
    const actions = await db.collection('adminAuditLog').where('caseId', '==', caseId).get();
    assert.ok(actions.size >= 2);
  });
});

describe('public report form', () => {
  test('honeypot, validation, passport lookup and daily rate limit', async () => {
    await db.doc('portfolioSlugs/mod-striker').set({ playerId: OWNER });
    const valid = {
      passport: 'https://scoutx.app/player/mod-striker',
      reason: 'appears_in_video',
      relationship: 'self',
      details: 'I am the goalkeeper in the second clip.',
      contactEmail: 'reporter@example.com',
    };

    const before = (await db.collection('contentReports').where('source', '==', 'public_form').get()).size;
    assert.deepEqual(await submitPublicReport.run(publicRequest({ ...valid, website: 'spam' }, '203.0.113.9')), { received: true });
    assert.equal((await db.collection('contentReports').where('source', '==', 'public_form').get()).size, before);

    await expectCode(submitPublicReport.run(publicRequest({ ...valid, reason: 'spam' }, '203.0.113.9')), 'invalid-argument');
    await expectCode(submitPublicReport.run(publicRequest({ ...valid, passport: 'nobody-here' }, '203.0.113.9')), 'not-found');

    await submitPublicReport.run(publicRequest(valid, '203.0.113.10'));
    const created = await db.collection('contentReports').where('source', '==', 'public_form').where('targetId', '==', OWNER).get();
    assert.ok(created.size >= 1);
    const reportDoc = created.docs[0];
    assert.equal(reportDoc.get('reporterId'), 'public');
    assert.equal(reportDoc.get('targetType'), 'passport');
    assert.equal((await db.doc(`publicReporterContacts/${reportDoc.id}`).get()).get('email'), 'reporter@example.com');

    for (let index = 0; index < 4; index += 1) {
      await submitPublicReport.run(publicRequest(valid, '203.0.113.11'));
    }
    await submitPublicReport.run(publicRequest(valid, '203.0.113.11'));
    await expectCode(submitPublicReport.run(publicRequest(valid, '203.0.113.11')), 'resource-exhausted');
  });
});
