// Premium entitlements and usage quotas against the Firestore emulator: the RevenueCat webhook
// (auth, idempotency, ordering, transfers), the quota ledger (charge, refund, idempotency,
// plan-based limits), server gating of AI analysis and reel export, and the security rules.
import { before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { BUCKET, PROJECT_ID, getDocument, isAllowed, isDenied, setDocument } from './emulator.mjs';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

const USER = 'premium-user';
const OTHER = 'premium-other';
const SECRET = 'rc-test-secret';
const DAY = 24 * 60 * 60 * 1000;

let db;
let rc;
let quota;
let analyzeMatchFootage;
let exportReel;
let onReelExportQueued;

function call(uid, data) {
  return { data, auth: { uid, token: {} }, rawRequest: { headers: {} }, acceptsStreaming: false };
}

async function expectCode(promise, code, reason) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    if (reason) assert.equal(error.details?.reason, reason);
    return true;
  });
}

function rcEvent(partial) {
  return {
    id: `evt-${Math.random().toString(36).slice(2)}`,
    type: 'INITIAL_PURCHASE',
    app_user_id: USER,
    entitlement_ids: ['pitchproven'],
    expiration_at_ms: Date.now() + 30 * DAY,
    event_timestamp_ms: Date.now(),
    product_id: 'PitchProven_Monthly',
    store: 'APP_STORE',
    environment: 'SANDBOX',
    ...partial,
  };
}

/** Invokes the deployed HTTP handler the way Cloud Run would. */
async function postWebhook({ method = 'POST', authorization, body }) {
  const headers = { authorization };
  const req = { method, body, headers, get: (name) => headers[name.toLowerCase()] };
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      on() {
        return this;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      send() {
        resolve(this.statusCode);
        return this;
      },
      json() {
        resolve(this.statusCode);
        return this;
      },
      end() {
        resolve(this.statusCode);
        return this;
      },
    };
    Promise.resolve(rc.revenueCatWebhook(req, res)).catch(reject);
  });
}

/** A reel that passes request validation but cannot be decoded when rendered. */
async function seedReelWithBrokenClip(owner, reelId) {
  const storagePath = `profiles/${owner}/videos/broken/video.mp4`;
  await getStorage().bucket(BUCKET).file(storagePath).save(Buffer.from('not a video'), { contentType: 'video/mp4' });
  await db.collection('players').doc(owner).collection('media').doc('broken').set({
    id: 'broken', ownerId: owner, storagePath, durationSec: 3, uploadState: 'ready',
  });
  await db.collection('reels').doc(reelId).set({
    id: reelId, ownerId: owner, segments: [{ mediaId: 'broken', inSec: 0, outSec: 1 }], aspectRatio: '9:16', coverMediaId: null, version: 1, status: 'draft',
  });
  const exports = await db.collection('reelExports').where('reelId', '==', reelId).get();
  await Promise.all(exports.docs.map((doc) => doc.ref.delete()));
}

const entitlement = async (uid) => (await db.collection('entitlements').doc(uid).get()).data();

async function clearUser(uid) {
  await db.collection('entitlements').doc(uid).delete();
  const periods = await db.collection('usageLedger').doc(uid).collection('periods').get();
  await Promise.all(periods.docs.map((doc) => doc.ref.delete()));
  await db.collection('usageLedger').doc(uid).delete();
}

before(async () => {
  process.env.REVENUECAT_WEBHOOK_SECRET = SECRET;
  process.env.OPENROUTER_API_KEY = 'test-key';
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET });
  db = getFirestore();
  rc = require('./lib/entitlements/revenueCat.js');
  quota = require('./lib/entitlements/quotaService.js');
  ({ analyzeMatchFootage } = require('./lib/matchAnalysis.js'));
  ({ exportReel, onReelExportQueued } = require('./lib/reelRender.js'));
});

beforeEach(async () => {
  await clearUser(USER);
  await clearUser(OTHER);
});

describe('RevenueCat webhook', () => {
  test('rejects missing or wrong authorization and non-POST requests', async () => {
    const body = { event: rcEvent({}) };
    assert.equal(await postWebhook({ authorization: undefined, body }), 401);
    assert.equal(await postWebhook({ authorization: 'Bearer nope', body }), 401);
    assert.equal(await postWebhook({ method: 'GET', authorization: `Bearer ${SECRET}`, body }), 405);
    assert.equal(await entitlement(USER), undefined);
  });

  test('a signed purchase event writes a server-owned premium entitlement', async () => {
    assert.equal(await postWebhook({ authorization: `Bearer ${SECRET}`, body: { event: rcEvent({}) } }), 200);
    const record = await entitlement(USER);
    assert.equal(record.status, 'premium');
    assert.equal(record.source, 'revenuecat');
    assert.equal((await quota.planFor(db, USER)).id, 'premium');
  });

  test('duplicate deliveries are applied once and older events never overwrite newer state', async () => {
    const purchase = rcEvent({ event_timestamp_ms: Date.now() });
    assert.equal(await rc.applyRevenueCatEvent(db, purchase), 'applied');
    assert.equal(await rc.applyRevenueCatEvent(db, purchase), 'duplicate');
    const stale = rcEvent({ type: 'EXPIRATION', expiration_at_ms: Date.now() - DAY, event_timestamp_ms: Date.now() - 2 * DAY });
    assert.equal(await rc.applyRevenueCatEvent(db, stale), 'ignored');
    assert.equal((await entitlement(USER)).status, 'premium');
    const expiry = rcEvent({ type: 'EXPIRATION', expiration_at_ms: Date.now() - 1, event_timestamp_ms: Date.now() + 1000 });
    assert.equal(await rc.applyRevenueCatEvent(db, expiry), 'applied');
    assert.equal((await entitlement(USER)).status, 'expired');
    assert.equal((await quota.planFor(db, USER)).id, 'free');
  });

  test('anonymous app user ids are recorded but grant nothing', async () => {
    const anon = rcEvent({ app_user_id: '$RCAnonymousID:123', original_app_user_id: '$RCAnonymousID:123' });
    assert.equal(await rc.applyRevenueCatEvent(db, anon), 'ignored');
  });

  test('a transfer moves the entitlement to the new account and resets the old one', async () => {
    await rc.applyRevenueCatEvent(db, rcEvent({}));
    const transfer = rcEvent({ type: 'TRANSFER', app_user_id: undefined, transferred_from: [USER], transferred_to: [OTHER] });
    assert.equal(await rc.applyRevenueCatEvent(db, transfer), 'applied');
    assert.equal((await entitlement(USER)).status, 'free');
    assert.equal((await entitlement(OTHER)).status, 'premium');
  });
});

describe('quota ledger', () => {
  test('charges once per reference, refuses over the limit and refunds', async () => {
    const first = await quota.consumeQuota(db, USER, 'reel_export', 'reel-a:v1');
    assert.equal(first.remaining, 1);
    assert.equal((await quota.consumeQuota(db, USER, 'reel_export', 'reel-a:v1')).used, 1);
    await quota.consumeQuota(db, USER, 'reel_export', 'reel-b:v1');
    await expectCode(quota.consumeQuota(db, USER, 'reel_export', 'reel-c:v1'), 'resource-exhausted', 'quota_exceeded');
    assert.equal(await quota.releaseQuota(db, USER, 'reel_export', 'reel-b:v1'), true);
    assert.equal(await quota.releaseQuota(db, USER, 'reel_export', 'reel-b:v1'), false);
    assert.equal((await quota.consumeQuota(db, USER, 'reel_export', 'reel-c:v1')).used, 2);
  });

  test('premium raises limits and the summary reports server numbers', async () => {
    await rc.applyRevenueCatEvent(db, rcEvent({}));
    for (const ref of ['a', 'b', 'c']) await quota.consumeQuota(db, USER, 'reel_export', ref);
    const summary = await quota.getUsageSummary.run(call(USER, {}));
    assert.equal(summary.plan, 'premium');
    assert.deepEqual(summary.features.reel_export, { used: 3, limit: 20, remaining: 17 });
    assert.ok(summary.resetAt);
    assert.ok(summary.neverPaywalled.includes('account_deletion'));
  });

  test('the next period starts with a fresh allowance', async () => {
    await quota.consumeQuota(db, USER, 'full_match_analysis', 'job-1');
    await expectCode(quota.consumeQuota(db, USER, 'full_match_analysis', 'job-2'), 'resource-exhausted', 'quota_exceeded');
    const later = new Date(Date.now() + 31 * DAY);
    assert.equal((await quota.consumeQuota(db, USER, 'full_match_analysis', 'job-2', later)).used, 1);
  });

  test('getUsageSummary requires sign-in', async () => {
    await expectCode(quota.getUsageSummary.run({ data: {}, rawRequest: { headers: {} }, acceptsStreaming: false }), 'unauthenticated');
  });
});

describe('server gating', () => {
  test('clip analysis is refused once the free allowance is used, before calling the model', async () => {
    for (const ref of ['used-1', 'used-2', 'used-3']) await quota.consumeQuota(db, USER, 'frame_analysis', ref);
    await db.collection('matchAnalysisJobs').doc('quota-job').set({
      id: 'quota-job',
      playerId: USER,
      status: 'failed',
      frames: [],
      targeting: { jerseyNumber: '8' },
      match: { opponent: 'FC Test', date: '2026-10-01' },
    });
    await expectCode(analyzeMatchFootage.run(call(USER, { jobId: 'quota-job' })), 'resource-exhausted', 'quota_exceeded');
  });

  test('reel export is refused once the free allowance is used', async () => {
    await quota.consumeQuota(db, USER, 'reel_export', 'x:v1');
    await quota.consumeQuota(db, USER, 'reel_export', 'y:v1');
    await seedReelWithBrokenClip(USER, 'quota-reel');
    await expectCode(exportReel.run(call(USER, { reelId: 'quota-reel' })), 'resource-exhausted', 'quota_exceeded');
    assert.equal((await quota.usageSummary(db, USER)).features.reel_export.used, 2);
  });

  test('a failed render gives the export back', async () => {
    await seedReelWithBrokenClip(USER, 'refund-reel');
    const queued = await exportReel.run(call(USER, { reelId: 'refund-reel' }));
    assert.equal(queued.status, 'queued');
    assert.equal((await quota.usageSummary(db, USER)).features.reel_export.used, 1);
    const snap = await db.collection('reelExports').doc(queued.exportId).get();
    await onReelExportQueued.run({ params: { exportId: queued.exportId }, data: snap });
    assert.equal((await db.collection('reelExports').doc(queued.exportId).get()).get('status'), 'failed');
    assert.equal((await quota.usageSummary(db, USER)).features.reel_export.used, 0);
  });
});

describe('rules', () => {
  test('owners can read their entitlement and usage but nobody can write them from the client', async () => {
    await db.collection('entitlements').doc(USER).set({ status: 'free' });
    await quota.consumeQuota(db, USER, 'reel_export', 'r');
    const periods = await db.collection('usageLedger').doc(USER).collection('periods').get();
    const periodPath = `usageLedger/${USER}/periods/${periods.docs[0].id}`;
    assert.ok(isAllowed(await getDocument(USER, `entitlements/${USER}`)));
    assert.ok(isAllowed(await getDocument(USER, periodPath)));
    assert.ok(isDenied(await getDocument(OTHER, `entitlements/${USER}`)));
    assert.ok(isDenied(await getDocument(OTHER, periodPath)));
    assert.ok(isDenied(await setDocument(USER, `entitlements/${USER}`, { status: 'premium' })));
    assert.ok(isDenied(await setDocument(USER, periodPath, { counts: { reel_export: 0 } })));
    assert.ok(isDenied(await setDocument(USER, `usageLedger/${USER}`, { anchorAt: '2020-01-01T00:00:00.000Z' })));
  });

  test('webhook event records are never readable from the client', async () => {
    await db.collection('revenueCatEvents').doc('evt-private').set({ uid: USER, type: 'RENEWAL' });
    assert.ok(isDenied(await getDocument(USER, 'revenueCatEvents/evt-private')));
  });
});
