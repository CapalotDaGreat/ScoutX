/**
 * Central plan limits. These numbers are a business decision and can be edited here only;
 * every server check and the usage summary read from this file.
 */
export const ENTITLEMENT_STATUSES = ['free', 'premium', 'trial', 'grace', 'expired', 'unknown'] as const;
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];

export type PlanId = 'free' | 'premium';

export const METERED_FEATURES = ['frame_analysis', 'full_match_analysis', 'reel_export'] as const;
export type MeteredFeature = (typeof METERED_FEATURES)[number];

export type Plan = {
  id: PlanId;
  periodDays: number;
  limits: Record<MeteredFeature, number>;
  maxConcurrentJobs: number;
  maxVideoDurationSec: number;
  maxVideoBytes: number;
};

const GIB = 1024 * 1024 * 1024;

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    periodDays: 30,
    limits: { frame_analysis: 3, full_match_analysis: 1, reel_export: 2 },
    maxConcurrentJobs: 1,
    maxVideoDurationSec: 120 * 60,
    maxVideoBytes: 3 * GIB,
  },
  premium: {
    id: 'premium',
    periodDays: 30,
    limits: { frame_analysis: 30, full_match_analysis: 8, reel_export: 20 },
    maxConcurrentJobs: 2,
    maxVideoDurationSec: 150 * 60,
    maxVideoBytes: 4 * GIB,
  },
};

/**
 * Never metered or paywalled: these work the same on every plan and never call the quota
 * service. Listed so the app and docs can show it.
 */
export const NEVER_PAYWALLED = [
  'safety_and_reporting',
  'account_deletion',
  'privacy_controls',
  'guardian_controls',
  'match_logging',
  'basic_development',
] as const;

/** Premium-like statuses unlock the premium plan; anything unknown falls back to free. */
export function planForStatus(status: EntitlementStatus): Plan {
  return status === 'premium' || status === 'trial' || status === 'grace' ? PLANS.premium : PLANS.free;
}

export function isEntitlementStatus(value: unknown): value is EntitlementStatus {
  return typeof value === 'string' && (ENTITLEMENT_STATUSES as readonly string[]).includes(value);
}

/**
 * Status that applies now. A stored premium/trial/grace entitlement whose end date has passed
 * counts as expired even if the expiry webhook has not arrived yet.
 */
export function effectiveStatus(
  stored: { status?: unknown; expiresAt?: unknown } | undefined,
  now: Date = new Date(),
): EntitlementStatus {
  if (!stored || !isEntitlementStatus(stored.status)) return 'free';
  const status = stored.status;
  if (status !== 'premium' && status !== 'trial' && status !== 'grace') return status;
  if (typeof stored.expiresAt !== 'string') return status;
  const expires = Date.parse(stored.expiresAt);
  return Number.isFinite(expires) && expires <= now.getTime() ? 'expired' : status;
}

/** Fixed 30-day windows anchored on the user's first metered use. */
export function periodFor(anchorMs: number, nowMs: number, periodDays: number): { key: string; startMs: number; resetMs: number } {
  const length = periodDays * 24 * 60 * 60 * 1000;
  const index = Math.max(0, Math.floor((nowMs - anchorMs) / length));
  const startMs = anchorMs + index * length;
  return { key: `p${index}`, startMs, resetMs: startMs + length };
}
