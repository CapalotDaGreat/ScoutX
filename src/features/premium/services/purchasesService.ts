import { Platform } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import type { PremiumPackage } from '@/features/premium/types';

/**
 * Thin wrapper around RevenueCat. Purchases only change what the store reports; access is
 * granted by the server after the RevenueCat webhook writes `entitlements/{uid}`.
 */

const APPLE_MANAGE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';

type PurchasesModule = typeof import('react-native-purchases').default;

let configuredFor: string | null = null;
let cachedPackages: PurchasesPackage[] = [];

function apiKey(): string | null {
  const key = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
  return typeof key === 'string' && key.trim() ? key.trim() : null;
}

export function isPurchasingAvailable(): boolean {
  return Platform.OS === 'ios' && apiKey() !== null;
}

async function loadPurchases(): Promise<PurchasesModule | null> {
  if (!isPurchasingAvailable()) return null;
  try {
    const mod = await import('react-native-purchases');
    return mod.default;
  } catch {
    // Expo Go and other builds without the native module.
    return null;
  }
}

async function ready(uid: string): Promise<PurchasesModule> {
  const Purchases = await loadPurchases();
  const key = apiKey();
  if (!Purchases || !key) throw new Error('In-app purchases are not available in this build.');
  if (configuredFor === null) {
    Purchases.configure({ apiKey: key, appUserID: uid });
    configuredFor = uid;
  } else if (configuredFor !== uid) {
    await Purchases.logIn(uid);
    configuredFor = uid;
  }
  return Purchases;
}

function periodLabel(pkg: PurchasesPackage): string | null {
  return pkg.product.subscriptionPeriod ?? null;
}

export async function loadPackages(uid: string): Promise<PremiumPackage[]> {
  const Purchases = await ready(uid);
  const offerings = await Purchases.getOfferings();
  cachedPackages = offerings.current?.availablePackages ?? [];
  return cachedPackages.map((pkg) => ({
    id: pkg.identifier,
    title: pkg.product.title,
    priceString: pkg.product.priceString,
    periodLabel: periodLabel(pkg),
  }));
}

export type PurchaseOutcome = 'purchased' | 'cancelled';

export async function purchasePackage(uid: string, packageId: string): Promise<PurchaseOutcome> {
  const Purchases = await ready(uid);
  const pkg = cachedPackages.find((item) => item.identifier === packageId);
  if (!pkg) throw new Error('This plan is no longer available. Please reopen the plan page.');
  try {
    await Purchases.purchasePackage(pkg);
    return 'purchased';
  } catch (error) {
    if (error && typeof error === 'object' && (error as { userCancelled?: unknown }).userCancelled === true) {
      return 'cancelled';
    }
    throw error;
  }
}

export async function restorePurchases(uid: string): Promise<void> {
  const Purchases = await ready(uid);
  await Purchases.restorePurchases();
}

export async function manageSubscriptionsUrl(uid: string): Promise<string> {
  try {
    const Purchases = await ready(uid);
    const info = await Purchases.getCustomerInfo();
    return info.managementURL ?? APPLE_MANAGE_SUBSCRIPTIONS_URL;
  } catch {
    return APPLE_MANAGE_SUBSCRIPTIONS_URL;
  }
}
