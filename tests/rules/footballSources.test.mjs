// External football source links against the Firestore emulator: client writes are denied,
// the server callables validate every link, minors need the matching guardian scope, the
// Passport and scout projections only carry active links, and reports hide a link at once.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  BUCKET,
  PROJECT_ID,
  deleteDocument,
  getDocument,
  isAllowed,
  isDenied,
  setDocument,
  withClaims,
} from './emulator.mjs';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const ADULT = 'fs-adult';
const MINOR = 'fs-minor';
const STRANGER = 'fs-stranger';
const SCOUT = withClaims('fs-scout', { role: 'scout' });
const MODERATOR = 'fs-moderator';

let db;
let service;
let callables;
let projectPassport;
let projectDiscoverablePlayer;
let triageReport;
let applyModerationAction;

function call(uid, data) {
  return { data, auth: { uid, token: {} }, rawRequest: { headers: {} }, acceptsStreaming: false };
}

function staff(uid, data) {
  return {
    data,
    auth: { uid, token: { staffRole: 'moderator', auth_time: Math.floor(Date.now() / 1000) } },
    rawRequest: { headers: {} },
    acceptsStreaming: false,
  };
}

async function expectReason(promise, code, reason) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    if (reason) assert.equal(error.details?.reason, reason);
    return true;
  });
}

async function seedPlayer(uid, ageBand, extra = {}) {
  await db.doc(`users/${uid}`).set({ role: 'player' });
  await db.doc(`userSafety/${uid}`).set({ ageBand, guardianStatus: ageBand === '18plus' ? 'not_required' : 'required', scopes: [], ...extra });
  await db.doc(`profiles/${uid}`).set({
    fullName: 'Source Player',
    position: 'ST',
    privacy: { publicPortfolioEnabled: true, discoverableByScouts: true },
    statisticsMatches: [{ id: 'match-1', date: '2026-09-01', opponent: 'FC Test', result: 'W 2-1', minutes: 90 }],
  });
}

async function reproject(uid) {
  const profile = await db.doc(`profiles/${uid}`).get();
  await projectPassport(uid, profile.data());
  await projectDiscoverablePlayer(uid);
}

before(async () => {
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET });
  db = getFirestore();
  service = require('./lib/footballSources/service.js');
  callables = require('./lib/footballSources/callables.js');
  ({ projectPassport } = require('./lib/publicPassport.js'));
  ({ projectDiscoverablePlayer } = require('./lib/discoveryProjection.js'));
  ({ triageReport } = require('./lib/moderation/reports.js'));
  ({ applyModerationAction } = require('./lib/moderation/actions.js'));
  await seedPlayer(ADULT, '18plus');
  await seedPlayer(MINOR, '13-17');
});

describe('server validation', () => {
  test('requires sign-in', async () => {
    await expectReason(
      callables.addExternalFootballSource.run({ data: { url: 'https://www.fvrz.ch/team/1', sourceType: 'team' }, rawRequest: { headers: {} }, acceptsStreaming: false }),
      'unauthenticated',
    );
  });

  test('stores an approved link privately with player provenance and derives the provider', async () => {
    const { source } = await callables.addExternalFootballSource.run(
      call(ADULT, { url: '  https://WWW.FVRZ.ch/de/team/5/#top ', sourceType: 'team', providerId: 'fupa', status: 'active', verified: true }),
    );
    assert.equal(source.url, 'https://www.fvrz.ch/de/team/5');
    assert.equal(source.providerId, 'fvrz');
    assert.equal(source.visibility, 'private');
    assert.equal(source.provenance, 'self_reported_with_link');
    assert.equal(source.addedBy, 'player');
    const stored = (await db.doc(`players/${ADULT}/footballSources/${source.id}`).get()).data();
    assert.equal('verified' in stored, false);
    assert.equal('official' in stored, false);
  });

  test('rejects non-https, lookalike and unsupported hosts and bad source types', async () => {
    await expectReason(service.addFootballSource(db, ADULT, { url: 'http://www.fvrz.ch/', sourceType: 'team' }), 'invalid-argument', 'not_https');
    await expectReason(service.addFootballSource(db, ADULT, { url: 'javascript:alert(1)', sourceType: 'team' }), 'invalid-argument', 'not_https');
    await expectReason(service.addFootballSource(db, ADULT, { url: 'https://fvrz.ch.attacker.com/x', sourceType: 'team' }), 'invalid-argument', 'unsupported_provider');
    await expectReason(service.addFootballSource(db, ADULT, { url: 'https://evilfvrz.ch/x', sourceType: 'team' }), 'invalid-argument', 'unsupported_provider');
    await expectReason(service.addFootballSource(db, ADULT, { url: 'https://example.com/', sourceType: 'team' }), 'invalid-argument', 'unsupported_provider');
    await expectReason(service.addFootballSource(db, ADULT, { url: 'https://www.fvrz.ch/x', sourceType: 'verified' }), 'invalid-argument', 'invalid_source_type');
  });

  test('an equivalent link cannot be added twice', async () => {
    await service.addFootballSource(db, ADULT, { url: 'https://www.fupa.net/player/a', sourceType: 'player' });
    await expectReason(
      service.addFootballSource(db, ADULT, { url: 'https://fupa.net/player/a/', sourceType: 'league' }),
      'already-exists',
      'duplicate',
    );
  });

  test('attaches only to the player\'s own matches without touching match data', async () => {
    const source = await service.addFootballSource(db, ADULT, { url: 'https://www.fussball.de/spiel/1', sourceType: 'match' });
    await expectReason(service.updateFootballSource(db, ADULT, { sourceId: source.id, matchIds: ['someone-elses'] }), 'invalid-argument', 'invalid_match');
    const before = (await db.doc(`profiles/${ADULT}`).get()).get('statisticsMatches');
    const updated = await service.updateFootballSource(db, ADULT, { sourceId: source.id, matchIds: ['match-1'] });
    assert.deepEqual(updated.matchIds, ['match-1']);
    assert.deepEqual((await db.doc(`profiles/${ADULT}`).get()).get('statisticsMatches'), before);
  });

  test('a minor cannot share a link without the guardian scope for that audience', async () => {
    const source = await service.addFootballSource(db, MINOR, { url: 'https://www.fvrz.ch/junioren/1', sourceType: 'team' });
    await expectReason(service.updateFootballSource(db, MINOR, { sourceId: source.id, visibility: 'passport' }), 'failed-precondition', 'guardian_scope_required');
    await expectReason(service.updateFootballSource(db, MINOR, { sourceId: source.id, visibility: 'scouts' }), 'failed-precondition', 'guardian_scope_required');
    await db.doc(`userSafety/${MINOR}`).set({ guardianStatus: 'approved', scopes: ['public_passport'] }, { merge: true });
    const shared = await service.updateFootballSource(db, MINOR, { sourceId: source.id, visibility: 'passport' });
    assert.equal(shared.visibility, 'passport');
    await expectReason(service.updateFootballSource(db, MINOR, { sourceId: source.id, visibility: 'scouts' }), 'failed-precondition', 'guardian_scope_required');
  });
});

describe('Firestore rules', () => {
  test('only the owner reads their sources; nobody writes them from a client', async () => {
    const path = `players/${ADULT}/footballSources/client-made`;
    const body = {
      id: 'client-made', ownerId: ADULT, providerId: 'fvrz', url: 'https://evil.example/', sourceType: 'team',
      provenance: 'self_reported_with_link', visibility: 'passport', status: 'active', verified: true,
    };
    assert.ok(isDenied(await setDocument(ADULT, path, body)), 'owner create denied');
    assert.ok(isDenied(await setDocument(STRANGER, path, body)), 'stranger create denied');

    const existing = (await db.collection(`players/${ADULT}/footballSources`).limit(1).get()).docs[0].id;
    const existingPath = `players/${ADULT}/footballSources/${existing}`;
    assert.ok(isAllowed(await getDocument(ADULT, existingPath)), 'owner read');
    assert.ok(isDenied(await getDocument(STRANGER, existingPath)), 'stranger read denied');
    assert.ok(isDenied(await getDocument(SCOUT, existingPath)), 'scout cannot read private sources');
    assert.ok(isDenied(await setDocument(ADULT, `${existingPath}?updateMask.fieldPaths=status`, { status: 'active' })), 'owner cannot set status');
    assert.ok(isDenied(await setDocument(ADULT, `${existingPath}?updateMask.fieldPaths=verified`, { verified: true })), 'owner cannot add verified');
    assert.ok(isDenied(await deleteDocument(ADULT, existingPath)), 'removal goes through the callable');
  });

  test('scout projection: recruiters and the owner read, players do not, nobody writes', async () => {
    await db.doc(`scoutFootballSources/${ADULT}`).set({ playerId: ADULT, sources: [] });
    assert.ok(isAllowed(await getDocument(SCOUT, `scoutFootballSources/${ADULT}`)));
    assert.ok(isAllowed(await getDocument(ADULT, `scoutFootballSources/${ADULT}`)));
    assert.ok(isDenied(await getDocument(STRANGER, `scoutFootballSources/${ADULT}`)));
    assert.ok(isDenied(await setDocument(SCOUT, `scoutFootballSources/${ADULT}`, { playerId: ADULT, sources: [] })));
  });

  test('a signed-in user can report a source of another player', async () => {
    const status = await setDocument(STRANGER, 'contentReports/fs-rule-report', {
      reporterId: STRANGER,
      targetType: 'external_football_source',
      targetId: 'any-source',
      targetOwnerId: ADULT,
      reason: 'impersonation',
      createdAt: new Date().toISOString(),
    });
    assert.ok(isAllowed(status));
  });
});

describe('projections and moderation', () => {
  let shared;

  test('Passport carries active passport links; scouts also get scout-only links', async () => {
    shared = await service.addFootballSource(db, ADULT, { url: 'https://www.football.ch/club/42', sourceType: 'team' });
    await service.updateFootballSource(db, ADULT, { sourceId: shared.id, visibility: 'passport' });
    const scoutOnly = await service.addFootballSource(db, ADULT, { url: 'https://www.transfermarkt.ch/x/profil/spieler/9', sourceType: 'player' });
    await service.updateFootballSource(db, ADULT, { sourceId: scoutOnly.id, visibility: 'scouts' });
    await reproject(ADULT);

    const passport = (await db.doc(`publicPassports/${ADULT}`).get()).data();
    assert.deepEqual(passport.footballSources.map((source) => source.url), ['https://www.football.ch/club/42']);
    assert.equal(passport.footballSources[0].provenance, 'self_reported_with_link');
    assert.equal('ownerId' in passport.footballSources[0], false);
    assert.equal('matchIds' in passport.footballSources[0], false);

    const scout = (await db.doc(`scoutFootballSources/${ADULT}`).get()).data();
    assert.deepEqual(scout.sources.map((source) => source.url).sort(), ['https://www.football.ch/club/42', 'https://www.transfermarkt.ch/x/profil/spieler/9']);
  });

  test('a link whose provider leaves the allowlist is not projected', async () => {
    await db.doc(`players/${ADULT}/footballSources/legacy`).set({
      id: 'legacy', ownerId: ADULT, providerId: 'fvrz', providerName: 'FVRZ', url: 'https://not-allowlisted.example/x', sourceType: 'team',
      addedBy: 'player', addedAt: '2026-01-01T00:00:00.000Z', provenance: 'self_reported_with_link', visibility: 'passport', status: 'active', matchIds: [],
    });
    await reproject(ADULT);
    const passport = (await db.doc(`publicPassports/${ADULT}`).get()).data();
    assert.equal(passport.footballSources.some((source) => source.id === 'legacy'), false);
  });

  test('a report hides the link at once; dismissal restores it', async () => {
    const data = { reporterId: STRANGER, targetType: 'external_football_source', targetId: shared.id, targetOwnerId: ADULT, reason: 'impersonation', createdAt: new Date().toISOString() };
    await db.doc('contentReports/fs-report-1').set(data);
    const caseId = await triageReport(db, 'fs-report-1', data);
    const source = (await db.doc(`players/${ADULT}/footballSources/${shared.id}`).get()).data();
    assert.equal(source.status, 'reported');
    assert.equal(source.reportCount, 1);
    const moderationCase = (await db.doc(`moderationCases/${caseId}`).get()).data();
    assert.equal(moderationCase.targetOwnerId, ADULT);
    assert.deepEqual(moderationCase.targetContext, { providerId: 'football_ch', url: 'https://www.football.ch/club/42' });

    await reproject(ADULT);
    assert.equal(((await db.doc(`publicPassports/${ADULT}`).get()).get('footballSources') ?? []).length, 0);
    const scoutSources = (await db.doc(`scoutFootballSources/${ADULT}`).get()).get('sources') ?? [];
    assert.equal(scoutSources.some((item) => item.id === shared.id), false);
    await expectReason(service.updateFootballSource(db, ADULT, { sourceId: shared.id, visibility: 'scouts' }), 'failed-precondition', 'under_review');

    await applyModerationAction.run(staff(MODERATOR, { caseId, action: 'dismiss', reason: 'Link belongs to the player' }));
    assert.equal((await db.doc(`players/${ADULT}/footballSources/${shared.id}`).get()).get('status'), 'active');
  });

  test('a report pointing at another owner is not attributed to them', async () => {
    const data = { reporterId: STRANGER, targetType: 'external_football_source', targetId: shared.id, targetOwnerId: MINOR, reason: 'spam', createdAt: new Date().toISOString() };
    await db.doc('contentReports/fs-report-2').set(data);
    const caseId = await triageReport(db, 'fs-report-2', data);
    assert.equal((await db.doc(`moderationCases/${caseId}`).get()).get('targetOwnerId'), null);
    assert.equal((await db.doc(`players/${ADULT}/footballSources/${shared.id}`).get()).get('status'), 'active');
  });

  test('a minor without the discovery scope has no scout projection', async () => {
    await reproject(MINOR);
    assert.equal((await db.doc(`scoutFootballSources/${MINOR}`).get()).exists, false);
    const passport = (await db.doc(`publicPassports/${MINOR}`).get()).data();
    assert.equal(passport.footballSources.length, 1, 'shown on the Passport the guardian allowed');
  });

  test('the owner can remove a link and it leaves every projection', async () => {
    const { removed } = await callables.removeExternalFootballSource.run(call(ADULT, { sourceId: shared.id }));
    assert.equal(removed, true);
    assert.equal((await db.doc(`players/${ADULT}/footballSources/${shared.id}`).get()).exists, false);
    await reproject(ADULT);
    const passport = (await db.doc(`publicPassports/${ADULT}`).get()).data();
    assert.equal((passport.footballSources ?? []).some((item) => item.id === shared.id), false);
  });
});
