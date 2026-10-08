import { Platform } from 'react-native';
import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';
import { PREMIUM_ENTITLEMENT_ID, revenueCatApiKey } from '@/features/premium/config';
import { classifyPurchaseError, readStoreEntitlement, toPremiumPackages, type StoreEntitlement } from '@/features/premium/services/purchaseModel';
import type { PremiumPackage } from '@/features/premium/types';

/**
 * RevenueCat wrapper. The SDK decides what the paywall and Customer Center show; Premium access
 * for metered features is still granted by the server after the RevenueCat webhook writes
 * `entitlements/{uid}`, so a purchase never unlocks server work on its own.
 */

const APPLE_MANAGE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';

type PurchasesModule = typeof import('react-native-purchases').default;
type PurchasesUiModule = typeof import('react-native-purchases-ui').default;

let configured = false;
let currentUser: string | null = null;
let cachedPackages: PurchasesPackage[] = [];

export function isPurchasingAvailable(): boolean {
  return Platform.OS === 'ios' && revenueCatApiKey() !== null;
}

async function loadPurchases(): Promise<PurchasesModule | null> {
  if (!isPurchasingAvailable()) return null;
  try {
    return (await import('react-native-purchases')).default;
  } catch {
    return null;
  }
}

async function loadPurchasesUi(): Promise<PurchasesUiModule | null> {
  if (!isPurchasingAvailable()) return null;
  try {
    return (await import('react-native-purchases-ui')).default;
  } catch {
    return null;
  }
}

/** Thrown with a classified kind so screens can pick the right message. */
export class PurchaseError extends Error {
  constructor(
    readonly kind: ReturnType<typeof classifyPurchaseError>,
    readonly original: unknown,
  ) {
    super(original instanceof Error ? original.message : 'Purchase failed');
    this.name = 'PurchaseError';
  }
}

function wrap(error: unknown): PurchaseError {
  return error instanceof PurchaseError ? error : new PurchaseError(classifyPurchaseError(error), error);
}

/**
 * Configures the SDK once with the Firebase uid as App User ID, and switches users with logIn.
 * Using the uid keeps purchases attached to the account across devices and lets the webhook
 * find the right `entitlements/{uid}` document.
 */
async function ready(uid: string): Promise<PurchasesModule> {
  const Purchases = await loadPurchases();
  const key = revenueCatApiKey();
  if (!Purchases || !key) throw new PurchaseError('configuration', null);
  if (!configured) {
    if (__DEV__) await Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
    Purchases.configure({ apiKey: key, appUserID: uid });
    configured = true;
    currentUser = uid;
  } else if (currentUser !== uid) {
    await Purchases.logIn(uid);
    currentUser = uid;
  }
  return Purchases;
}

/** Call when the signed-in account changes (null on sign-out). */
export async function identifyPurchaser(uid: string | null): Promise<void> {
  if (uid) {
    await ready(uid);
    return;
  }
  if (!configured || currentUser === null) return;
  const Purchases = await loadPurchases();
  if (!Purchases) return;
  try {
    if (!(await Purchases.isAnonymous())) await Purchases.logOut();
  } finally {
    currentUser = null;
  }
}

export async function getStoreEntitlement(uid: string): Promise<StoreEntitlement> {
  const Purchases = await ready(uid);
  return readStoreEntitlement(await Purchases.getCustomerInfo());
}

/** Subscribes to CustomerInfo changes (purchases, renewals, expiry, restores). */
export async function subscribeStoreEntitlement(
  uid: string,
  onChange: (entitlement: StoreEntitlement) => void,
): Promise<() => void> {
  const Purchases = await ready(uid);
  const listener = (info: CustomerInfo) => onChange(readStoreEntitlement(info));
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => {
    Purchases.removeCustomerInfoUpdateListener(listener);
  };
}

export async function loadPackages(uid: string): Promise<PremiumPackage[]> {
  const Purchases = await ready(uid);
  try {
    const offerings = await Purchases.getOfferings();
    cachedPackages = offerings.current?.availablePackages ?? [];
    return toPremiumPackages(cachedPackages);
  } catch (error) {
    throw wrap(error);
  }
}

export type PurchaseOutcome = 'purchased' | 'cancelled' | 'pending';

/** Fallback purchase path for builds where the paywall UI is unavailable. */
export async function purchasePackage(uid: string, packageId: string): Promise<PurchaseOutcome> {
  const Purchases = await ready(uid);
  const pkg = cachedPackages.find((item) => item.identifier === packageId);
  if (!pkg) throw new PurchaseError('product_unavailable', null);
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return readStoreEntitlement(customerInfo).active ? 'purchased' : 'pending';
  } catch (error) {
    const wrapped = wrap(error);
    if (wrapped.kind === 'cancelled') return 'cancelled';
    if (wrapped.kind === 'pending') return 'pending';
    throw wrapped;
  }
}

export async function restorePurchases(uid: string): Promise<StoreEntitlement> {
  const Purchases = await ready(uid);
  try {
    return readStoreEntitlement(await Purchases.restorePurchases());
  } catch (error) {
    throw wrap(error);
  }
}

export type PaywallOutcome = 'purchased' | 'restored' | 'cancelled' | 'not_presented' | 'error' | 'unavailable';

/**
 * Presents the RevenueCat Paywall for the current offering (configured in the dashboard).
 * Only shown when the user asks for it; the app never pushes a paywall at players under 18.
 */
export async function presentPaywall(uid: string): Promise<PaywallOutcome> {
  await ready(uid);
  const RevenueCatUI = await loadPurchasesUi();
  if (!RevenueCatUI) return 'unavailable';
  const { PAYWALL_RESULT } = await import('react-native-purchases-ui');
  const result = await RevenueCatUI.presentPaywallIfNeeded({
    requiredEntitlementIdentifier: PREMIUM_ENTITLEMENT_ID,
    displayCloseButton: true,
  });
  switch (result) {
    case PAYWALL_RESULT.PURCHASED:
      return 'purchased';
    case PAYWALL_RESULT.RESTORED:
      return 'restored';
    case PAYWALL_RESULT.CANCELLED:
      return 'cancelled';
    case PAYWALL_RESULT.NOT_PRESENTED:
      return 'not_presented';
    default:
      return 'error';
  }
}

/** Opens RevenueCat Customer Center (cancel, change plan, refunds, restore). */
export async function presentCustomerCenter(uid: string): Promise<'presented' | 'unavailable'> {
  await ready(uid);
  const RevenueCatUI = await loadPurchasesUi();
  if (!RevenueCatUI) return 'unavailable';
  await RevenueCatUI.presentCustomerCenter();
  return 'presented';
}

export async function manageSubscriptionsUrl(uid: string): Promise<string> {
  try {
    return (await getStoreEntitlement(uid)).managementURL ?? APPLE_MANAGE_SUBSCRIPTIONS_URL;
  } catch {
    return APPLE_MANAGE_SUBSCRIPTIONS_URL;
  }
}
