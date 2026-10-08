/** RevenueCat entitlement that unlocks Premium. Must match the dashboard and the server webhook. */
export const PREMIUM_ENTITLEMENT_ID = 'pitchproven';

/**
 * Product identifiers attached to the entitlement and the current offering: App Store Connect
 * IDs first (permanent once created), then the RevenueCat Test Store IDs used in development.
 */
export const SUBSCRIPTION_PRODUCTS = {
  monthly: ['PitchProven_Monthly', 'monthly'],
  yearly: ['PitchProven_Yearly', 'yearly'],
} as const satisfies Record<string, readonly string[]>;

export type SubscriptionTerm = keyof typeof SUBSCRIPTION_PRODUCTS;

/**
 * Public SDK key. Expo only inlines static `process.env.EXPO_PUBLIC_*` references.
 * `test_` keys belong to the RevenueCat Test Store and are rejected for production builds.
 */
export function revenueCatApiKey(): string | null {
  const key = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
  return typeof key === 'string' && key.trim() ? key.trim() : null;
}

export function isTestStoreKey(key: string | null = revenueCatApiKey()): boolean {
  return key?.startsWith('test_') ?? false;
}
