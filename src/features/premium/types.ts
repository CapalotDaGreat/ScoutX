export const METERED_FEATURES = ['frame_analysis', 'full_match_analysis', 'reel_export'] as const;
export type MeteredFeature = (typeof METERED_FEATURES)[number];

export const ENTITLEMENT_STATUSES = ['free', 'premium', 'trial', 'grace', 'expired', 'unknown'] as const;
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];

export type PlanId = 'free' | 'premium';

export type FeatureUsage = { used: number; limit: number; remaining: number };

/** Server-computed usage. The client only displays it; every limit is enforced by Cloud Functions. */
export type UsageSummary = {
  status: EntitlementStatus;
  plan: PlanId;
  /** Null until the first metered use starts the user's period. */
  resetAt: string | null;
  periodDays: number;
  features: Record<MeteredFeature, FeatureUsage>;
  maxConcurrentJobs: number;
  maxVideoDurationSec: number;
  maxVideoBytes: number;
  neverPaywalled: string[];
};

export type QuotaErrorInfo =
  | { reason: 'quota_exceeded'; feature: MeteredFeature; used: number; limit: number; resetAt: string | null }
  | { reason: 'plan_limit' };

export type PremiumPackage = {
  id: string;
  term: 'monthly' | 'yearly' | null;
  title: string;
  priceString: string;
  periodLabel: string | null;
};

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function isMeteredFeature(value: unknown): value is MeteredFeature {
  return typeof value === 'string' && (METERED_FEATURES as readonly string[]).includes(value);
}

export function parseUsageSummary(data: unknown): UsageSummary | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as Record<string, unknown>;
  const status = (ENTITLEMENT_STATUSES as readonly string[]).includes(String(raw.status))
    ? (raw.status as EntitlementStatus)
    : 'unknown';
  const featuresRaw = (raw.features ?? {}) as Record<string, unknown>;
  const features = Object.fromEntries(
    METERED_FEATURES.map((feature) => {
      const entry = (featuresRaw[feature] ?? {}) as Record<string, unknown>;
      return [feature, { used: num(entry.used), limit: num(entry.limit), remaining: num(entry.remaining) }];
    }),
  ) as Record<MeteredFeature, FeatureUsage>;
  return {
    status,
    plan: raw.plan === 'premium' ? 'premium' : 'free',
    resetAt: typeof raw.resetAt === 'string' ? raw.resetAt : null,
    periodDays: num(raw.periodDays),
    features,
    maxConcurrentJobs: num(raw.maxConcurrentJobs),
    maxVideoDurationSec: num(raw.maxVideoDurationSec),
    maxVideoBytes: num(raw.maxVideoBytes),
    neverPaywalled: Array.isArray(raw.neverPaywalled)
      ? raw.neverPaywalled.filter((item): item is string => typeof item === 'string')
      : [],
  };
}

/** Reads the `{reason}` detail attached to `resource-exhausted` / plan-cap callable errors. */
export function quotaErrorFrom(error: unknown): QuotaErrorInfo | null {
  if (!error || typeof error !== 'object' || !('details' in error)) return null;
  const details = (error as { details: unknown }).details;
  if (!details || typeof details !== 'object') return null;
  const raw = details as Record<string, unknown>;
  if (raw.reason === 'plan_limit') return { reason: 'plan_limit' };
  if (raw.reason !== 'quota_exceeded' || !isMeteredFeature(raw.feature)) return null;
  return {
    reason: 'quota_exceeded',
    feature: raw.feature,
    used: num(raw.used),
    limit: num(raw.limit),
    resetAt: typeof raw.resetAt === 'string' ? raw.resetAt : null,
  };
}
