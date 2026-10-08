import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { PREMIUM_ENTITLEMENT_ID, isTestStoreKey } from '../../src/features/premium/config.ts';
import {
  NO_STORE_ENTITLEMENT,
  classifyPurchaseError,
  readStoreEntitlement,
  termForProduct,
  toPremiumPackages,
} from '../../src/features/premium/services/purchaseModel.ts';

function entitlement(overrides: Partial<{ isActive: boolean; productIdentifier: string; willRenew: boolean; billingIssueDetectedAt: string | null }> = {}) {
  return {
    isActive: true,
    productIdentifier: 'yearly',
    expirationDate: '2027-10-08T00:00:00Z',
    willRenew: true,
    isSandbox: true,
    billingIssueDetectedAt: null,
    ...overrides,
  };
}

function pkg(identifier: string, packageType: string, productId: string) {
  return {
    identifier,
    packageType: packageType as never,
    product: { identifier: productId, title: productId, priceString: '$1', subscriptionPeriod: null },
  };
}

describe('RevenueCat purchase model', () => {
  test('the entitlement id is pitchproven', () => {
    assert.equal(PREMIUM_ENTITLEMENT_ID, 'pitchproven');
  });

  test('purchase errors map from PURCHASES_ERROR_CODE values', () => {
    assert.equal(classifyPurchaseError({ code: '1' }), 'cancelled');
    assert.equal(classifyPurchaseError({ userCancelled: true }), 'cancelled');
    assert.equal(classifyPurchaseError({ code: '20' }), 'pending');
    assert.equal(classifyPurchaseError({ code: '6' }), 'already_owned');
    assert.equal(classifyPurchaseError({ code: '10' }), 'network');
    assert.equal(classifyPurchaseError({ code: '2' }), 'store');
    assert.equal(classifyPurchaseError({ code: '3' }), 'not_allowed');
    assert.equal(classifyPurchaseError({ code: '5' }), 'product_unavailable');
    assert.equal(classifyPurchaseError({ code: '23' }), 'configuration');
    assert.equal(classifyPurchaseError({ code: '999' }), 'unknown');
    assert.equal(classifyPurchaseError(null), 'unknown');
    assert.equal(classifyPurchaseError('boom'), 'unknown');
  });

  test('reads the active pitchproven entitlement and ignores others', () => {
    const active = readStoreEntitlement({
      entitlements: { active: { [PREMIUM_ENTITLEMENT_ID]: entitlement() } },
      managementURL: 'https://apps.apple.com/account/subscriptions',
    });
    assert.equal(active.active, true);
    assert.equal(active.term, 'yearly');
    assert.equal(active.willRenew, true);
    assert.equal(active.hasBillingIssue, false);

    const other = readStoreEntitlement({ entitlements: { active: { premium: entitlement() } }, managementURL: null });
    assert.equal(other.active, false);
    assert.deepEqual(readStoreEntitlement(null), NO_STORE_ENTITLEMENT);
  });

  test('flags billing issues', () => {
    const info = readStoreEntitlement({
      entitlements: { active: { [PREMIUM_ENTITLEMENT_ID]: entitlement({ billingIssueDetectedAt: '2026-10-01T00:00:00Z' }) } },
      managementURL: null,
    });
    assert.equal(info.hasBillingIssue, true);
  });

  test('maps product ids to terms, including base-plan suffixes', () => {
    assert.equal(termForProduct('monthly'), 'monthly');
    assert.equal(termForProduct('yearly:base'), 'yearly');
    assert.equal(termForProduct('lifetime'), null);
    assert.equal(termForProduct(null), null);
  });

  test('orders packages yearly first, then monthly, then others', () => {
    const ordered = toPremiumPackages([
      pkg('$rc_monthly', 'MONTHLY', 'monthly'),
      pkg('custom', 'CUSTOM', 'lifetime'),
      pkg('$rc_annual', 'ANNUAL', 'yearly'),
    ]);
    assert.deepEqual(
      ordered.map((item) => [item.id, item.term]),
      [
        ['$rc_annual', 'yearly'],
        ['$rc_monthly', 'monthly'],
        ['custom', null],
      ],
    );
    assert.equal(toPremiumPackages([pkg('x', 'CUSTOM', 'monthly')])[0]?.term, 'monthly');
  });

  test('detects Test Store keys', () => {
    assert.equal(isTestStoreKey('test_abc'), true);
    assert.equal(isTestStoreKey('appl_abc'), false);
    assert.equal(isTestStoreKey(null), false);
  });
});
