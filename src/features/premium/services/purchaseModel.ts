import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';
import { PREMIUM_ENTITLEMENT_ID, SUBSCRIPTION_PRODUCTS, type SubscriptionTerm } from '@/features/premium/config';
import type { PremiumPackage } from '@/features/premium/types';

// Pure helpers over RevenueCat types (type-only imports), so they run in unit tests without the
// native module. Error codes mirror PURCHASES_ERROR_CODE in @revenuecat/purchases-typescript-internal.
const ERROR_CODES = {
  cancelled: '1',
  store: '2',
  notAllowed: '3',
  productUnavailable: '5',
  alreadyOwned: '6',
  network: '10',
  pending: '20',
  configuration: '23',
} as const;

export type PurchaseErrorKind =
  | 'cancelled'
  | 'pending'
  | 'already_owned'
  | 'network'
  | 'store'
  | 'not_allowed'
  | 'product_unavailable'
  | 'configuration'
  | 'unknown';

export function classifyPurchaseError(error: unknown): PurchaseErrorKind {
  if (!error || typeof error !== 'object') return 'unknown';
  const raw = error as { code?: unknown; userCancelled?: unknown };
  if (raw.userCancelled === true) return 'cancelled';
  switch (String(raw.code ?? '')) {
    case ERROR_CODES.cancelled:
      return 'cancelled';
    case ERROR_CODES.pending:
      return 'pending';
    case ERROR_CODES.alreadyOwned:
      return 'already_owned';
    case ERROR_CODES.network:
      return 'network';
    case ERROR_CODES.store:
      return 'store';
    case ERROR_CODES.notAllowed:
      return 'not_allowed';
    case ERROR_CODES.productUnavailable:
      return 'product_unavailable';
    case ERROR_CODES.configuration:
      return 'configuration';
    default:
      return 'unknown';
  }
}

/** What the App Store currently reports for the pitchproven entitlement. Display only. */
export type StoreEntitlement = {
  active: boolean;
  productId: string | null;
  term: SubscriptionTerm | null;
  expiresAt: string | null;
  willRenew: boolean;
  isSandbox: boolean;
  hasBillingIssue: boolean;
  managementURL: string | null;
};

export const NO_STORE_ENTITLEMENT: StoreEntitlement = {
  active: false,
  productId: null,
  term: null,
  expiresAt: null,
  willRenew: false,
  isSandbox: false,
  hasBillingIssue: false,
  managementURL: null,
};

export function termForProduct(productId: string | null | undefined): SubscriptionTerm | null {
  if (!productId) return null;
  const base = productId.split(':')[0];
  if ((SUBSCRIPTION_PRODUCTS.yearly as readonly string[]).includes(base)) return 'yearly';
  if ((SUBSCRIPTION_PRODUCTS.monthly as readonly string[]).includes(base)) return 'monthly';
  return null;
}

type EntitlementView = Pick<
  CustomerInfo['entitlements']['all'][string],
  'isActive' | 'productIdentifier' | 'expirationDate' | 'willRenew' | 'isSandbox' | 'billingIssueDetectedAt'
>;

export function readStoreEntitlement(
  info: { entitlements: { active: Record<string, EntitlementView> }; managementURL: string | null } | null,
): StoreEntitlement {
  if (!info) return NO_STORE_ENTITLEMENT;
  const entitlement = info.entitlements.active[PREMIUM_ENTITLEMENT_ID];
  if (!entitlement?.isActive) return { ...NO_STORE_ENTITLEMENT, managementURL: info.managementURL };
  return {
    active: true,
    productId: entitlement.productIdentifier,
    term: termForProduct(entitlement.productIdentifier),
    expiresAt: entitlement.expirationDate,
    willRenew: entitlement.willRenew,
    isSandbox: entitlement.isSandbox,
    hasBillingIssue: entitlement.billingIssueDetectedAt !== null,
    managementURL: info.managementURL,
  };
}

type PackageView = Pick<PurchasesPackage, 'identifier' | 'packageType'> & {
  product: Pick<PurchasesPackage['product'], 'identifier' | 'title' | 'priceString' | 'subscriptionPeriod'>;
};

function termForPackage(pkg: PackageView): SubscriptionTerm | null {
  const type = String(pkg.packageType);
  if (type === 'ANNUAL') return 'yearly';
  if (type === 'MONTHLY') return 'monthly';
  return termForProduct(pkg.product.identifier);
}

/** Yearly first, then monthly, then anything else the offering adds. */
export function toPremiumPackages(packages: readonly PackageView[]): PremiumPackage[] {
  const rank = (term: SubscriptionTerm | null) => (term === 'yearly' ? 0 : term === 'monthly' ? 1 : 2);
  return packages
    .map((pkg) => ({
      id: pkg.identifier,
      term: termForPackage(pkg),
      title: pkg.product.title,
      priceString: pkg.product.priceString,
      periodLabel: pkg.product.subscriptionPeriod ?? null,
    }))
    .sort((a, b) => rank(a.term) - rank(b.term));
}
