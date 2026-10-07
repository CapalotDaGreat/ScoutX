import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NEVER_PAYWALLED,
  PLANS,
  effectiveStatus,
  periodFor,
  planForStatus,
} from '../../functions/src/entitlements/plans.ts';
import {
  deriveEntitlement,
  isAppUserUid,
  parseRevenueCatEvent,
  revenueCatSecretMatches,
  type RevenueCatEvent,
} from '../../functions/src/entitlements/revenueCat.ts';
import { parseUsageSummary, quotaErrorFrom } from '../../src/features/premium/types.ts';

const NOW = new Date('2026-10-07T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function event(partial: Partial<RevenueCatEvent>): RevenueCatEvent {
  return { id: 'evt', type: 'INITIAL_PURCHASE', app_user_id: 'uid-1', event_timestamp_ms: NOW.getTime(), ...partial };
}

describe('plans', () => {
  test('premium-like statuses unlock premium; everything else is free', () => {
    assert.equal(planForStatus('premium').id, 'premium');
    assert.equal(planForStatus('trial').id, 'premium');
    assert.equal(planForStatus('grace').id, 'premium');
    for (const status of ['free', 'expired', 'unknown'] as const) assert.equal(planForStatus(status).id, 'free');
  });

  test('premium is never more restrictive than free', () => {
    for (const feature of Object.keys(PLANS.free.limits) as (keyof typeof PLANS.free.limits)[]) {
      assert.ok(PLANS.premium.limits[feature] >= PLANS.free.limits[feature]);
    }
    assert.ok(PLANS.premium.maxVideoDurationSec >= PLANS.free.maxVideoDurationSec);
  });

  test('safety, deletion, privacy, guardian controls and match logging are never paywalled', () => {
    for (const item of ['safety_and_reporting', 'account_deletion', 'privacy_controls', 'guardian_controls', 'match_logging', 'basic_development']) {
      assert.ok((NEVER_PAYWALLED as readonly string[]).includes(item), item);
    }
  });

  test('effectiveStatus treats past-dated premium as expired and unknown data as free', () => {
    assert.equal(effectiveStatus(undefined, NOW), 'free');
    assert.equal(effectiveStatus({ status: 'gold' }, NOW), 'free');
    assert.equal(effectiveStatus({ status: 'premium', expiresAt: new Date(NOW.getTime() - 1).toISOString() }, NOW), 'expired');
    assert.equal(effectiveStatus({ status: 'premium', expiresAt: new Date(NOW.getTime() + DAY).toISOString() }, NOW), 'premium');
    assert.equal(effectiveStatus({ status: 'premium', expiresAt: null }, NOW), 'premium');
  });

  test('periodFor uses fixed windows from the anchor', () => {
    const anchor = NOW.getTime();
    assert.deepEqual(periodFor(anchor, anchor, 30), { key: 'p0', startMs: anchor, resetMs: anchor + 30 * DAY });
    assert.equal(periodFor(anchor, anchor + 30 * DAY - 1, 30).key, 'p0');
    const next = periodFor(anchor, anchor + 30 * DAY, 30);
    assert.equal(next.key, 'p1');
    assert.equal(next.startMs, anchor + 30 * DAY);
    assert.equal(periodFor(anchor, anchor - DAY, 30).key, 'p0');
  });
});

describe('RevenueCat webhook mapping', () => {
  test('purchase, trial, cancellation and expiry', () => {
    const future = NOW.getTime() + 30 * DAY;
    assert.equal(deriveEntitlement(event({ expiration_at_ms: future }), NOW)?.status, 'premium');
    assert.equal(deriveEntitlement(event({ period_type: 'TRIAL', expiration_at_ms: future }), NOW)?.status, 'trial');
    const cancelled = deriveEntitlement(event({ type: 'CANCELLATION', expiration_at_ms: future }), NOW);
    assert.equal(cancelled?.status, 'premium');
    assert.equal(cancelled?.willRenew, false);
    assert.equal(deriveEntitlement(event({ type: 'EXPIRATION', expiration_at_ms: NOW.getTime() - 1 }), NOW)?.status, 'expired');
    assert.equal(deriveEntitlement(event({ type: 'RENEWAL', expiration_at_ms: NOW.getTime() - 1 }), NOW)?.status, 'expired');
  });

  test('billing issue keeps premium only during the grace period', () => {
    const grace = deriveEntitlement(event({ type: 'BILLING_ISSUE', grace_period_expiration_at_ms: NOW.getTime() + DAY }), NOW);
    assert.equal(grace?.status, 'grace');
    const lapsed = deriveEntitlement(event({ type: 'BILLING_ISSUE', expiration_at_ms: NOW.getTime() - 1 }), NOW);
    assert.equal(lapsed?.status, 'expired');
  });

  test('other entitlements and informational events do not change access', () => {
    assert.equal(deriveEntitlement(event({ entitlement_ids: ['other'] }), NOW), null);
    assert.equal(deriveEntitlement(event({ type: 'TEST' }), NOW), null);
    assert.equal(deriveEntitlement(event({ type: 'SUBSCRIBER_ALIAS' }), NOW), null);
  });

  test('anonymous RevenueCat ids never map to an account', () => {
    assert.equal(isAppUserUid('$RCAnonymousID:abc'), false);
    assert.equal(isAppUserUid(''), false);
    assert.equal(isAppUserUid('firebase-uid'), true);
  });

  test('event parsing and shared-secret check', () => {
    assert.equal(parseRevenueCatEvent({}), null);
    assert.equal(parseRevenueCatEvent({ event: { id: 1, type: 'X' } }), null);
    assert.equal(parseRevenueCatEvent({ event: { id: 'a', type: 'RENEWAL' } })?.type, 'RENEWAL');
    assert.equal(revenueCatSecretMatches('Bearer s3cret', 's3cret'), true);
    assert.equal(revenueCatSecretMatches('s3cret', 's3cret'), true);
    assert.equal(revenueCatSecretMatches('Bearer wrong!', 's3cret'), false);
    assert.equal(revenueCatSecretMatches(undefined, 's3cret'), false);
    assert.equal(revenueCatSecretMatches('Bearer ', ''), false);
  });
});

describe('client premium parsing', () => {
  test('quota errors are recognised from callable details', () => {
    const info = quotaErrorFrom({
      code: 'functions/resource-exhausted',
      details: { reason: 'quota_exceeded', feature: 'reel_export', used: 2, limit: 2, resetAt: '2026-11-06T00:00:00.000Z' },
    });
    assert.deepEqual(info, { reason: 'quota_exceeded', feature: 'reel_export', used: 2, limit: 2, resetAt: '2026-11-06T00:00:00.000Z' });
    assert.deepEqual(quotaErrorFrom({ details: { reason: 'plan_limit' } }), { reason: 'plan_limit' });
    assert.equal(quotaErrorFrom({ details: { reason: 'quota_exceeded', feature: 'unknown' } }), null);
    assert.equal(quotaErrorFrom(new Error('x')), null);
  });

  test('usage summary parsing never trusts unknown statuses', () => {
    const summary = parseUsageSummary({ status: 'lifetime', plan: 'premium', features: { reel_export: { used: 1, limit: 2, remaining: 1 } } });
    assert.equal(summary?.status, 'unknown');
    assert.equal(summary?.features.reel_export.remaining, 1);
    assert.equal(summary?.features.frame_analysis.limit, 0);
    assert.equal(parseUsageSummary(null), null);
  });
});
