import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getFirestore, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { createCallableOptions } from '../callableOptions';
import {
  METERED_FEATURES,
  NEVER_PAYWALLED,
  effectiveStatus,
  periodFor,
  planForStatus,
  type EntitlementStatus,
  type MeteredFeature,
  type Plan,
} from './plans';

type LedgerPeriod = {
  counts?: Partial<Record<MeteredFeature, number>>;
  refs?: Record<string, MeteredFeature>;
};

export type QuotaDecision = {
  feature: MeteredFeature;
  used: number;
  limit: number;
  remaining: number;
  resetAt: string;
  plan: Plan['id'];
};

async function readEntitlement(db: Firestore, uid: string, tx?: Transaction): Promise<EntitlementStatus> {
  const ref = db.collection('entitlements').doc(uid);
  const snap = tx ? await tx.get(ref) : await ref.get();
  return effectiveStatus(snap.data() as { status?: unknown; expiresAt?: unknown } | undefined);
}

export async function planFor(db: Firestore, uid: string, tx?: Transaction): Promise<Plan> {
  return planForStatus(await readEntitlement(db, uid, tx));
}

async function currentPeriod(db: Firestore, tx: Transaction, uid: string, plan: Plan, nowMs: number) {
  const ledgerRef = db.collection('usageLedger').doc(uid);
  const ledger = await tx.get(ledgerRef);
  const storedAnchor = Date.parse(String(ledger.get('anchorAt') ?? ''));
  const anchorMs = Number.isFinite(storedAnchor) ? storedAnchor : nowMs;
  const period = periodFor(anchorMs, nowMs, plan.periodDays);
  const periodRef = ledgerRef.collection('periods').doc(period.key);
  const periodSnap = await tx.get(periodRef);
  return {
    ledgerRef,
    hasAnchor: Number.isFinite(storedAnchor),
    anchorMs,
    period,
    periodRef,
    data: (periodSnap.data() ?? {}) as LedgerPeriod,
  };
}

/**
 * Records one use of a metered feature. Idempotent per `refId` (a job or export id), so
 * retries and re-runs of the same job are never charged twice.
 */
export async function consumeQuota(
  db: Firestore,
  uid: string,
  feature: MeteredFeature,
  refId: string,
  now: Date = new Date(),
): Promise<QuotaDecision> {
  return db.runTransaction(async (tx) => {
    const plan = await planFor(db, uid, tx);
    const current = await currentPeriod(db, tx, uid, plan, now.getTime());
    const counts = current.data.counts ?? {};
    const refs = current.data.refs ?? {};
    const used = counts[feature] ?? 0;
    const limit = plan.limits[feature];
    const resetAt = new Date(current.period.resetMs).toISOString();
    if (refs[refId] === feature) {
      return { feature, used, limit, remaining: Math.max(0, limit - used), resetAt, plan: plan.id };
    }
    if (used >= limit) {
      throw new HttpsError('resource-exhausted', 'You have reached the limit for this period.', {
        reason: 'quota_exceeded',
        feature,
        used,
        limit,
        resetAt,
        plan: plan.id,
      });
    }
    if (!current.hasAnchor) tx.set(current.ledgerRef, { anchorAt: new Date(current.anchorMs).toISOString() }, { merge: true });
    tx.set(
      current.periodRef,
      {
        counts: { ...counts, [feature]: used + 1 },
        refs: { ...refs, [refId]: feature },
        startAt: new Date(current.period.startMs).toISOString(),
        resetAt,
        updatedAt: now.toISOString(),
      },
      { merge: true },
    );
    return { feature, used: used + 1, limit, remaining: Math.max(0, limit - used - 1), resetAt, plan: plan.id };
  });
}

/** Refunds a use when the work never ran (rejected video, cancelled before processing). */
export async function releaseQuota(db: Firestore, uid: string, feature: MeteredFeature, refId: string, now: Date = new Date()): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const plan = await planFor(db, uid, tx);
    const current = await currentPeriod(db, tx, uid, plan, now.getTime());
    const refs = { ...(current.data.refs ?? {}) };
    if (refs[refId] !== feature) return false;
    delete refs[refId];
    const counts = current.data.counts ?? {};
    tx.update(current.periodRef, {
      counts: { ...counts, [feature]: Math.max(0, (counts[feature] ?? 0) - 1) },
      refs,
      updatedAt: now.toISOString(),
    });
    return true;
  });
}

/** Read-only check used before expensive work starts (e.g. before a 4 GB upload). */
export async function assertQuotaAvailable(db: Firestore, uid: string, feature: MeteredFeature, refId: string): Promise<void> {
  await db.runTransaction(async (tx) => {
    const plan = await planFor(db, uid, tx);
    const current = await currentPeriod(db, tx, uid, plan, Date.now());
    if ((current.data.refs ?? {})[refId] === feature) return;
    const used = (current.data.counts ?? {})[feature] ?? 0;
    if (used >= plan.limits[feature]) {
      throw new HttpsError('resource-exhausted', 'You have reached the limit for this period.', {
        reason: 'quota_exceeded',
        feature,
        used,
        limit: plan.limits[feature],
        resetAt: new Date(current.period.resetMs).toISOString(),
        plan: plan.id,
      });
    }
  });
}

export async function usageSummary(db: Firestore, uid: string, now: Date = new Date()) {
  return db.runTransaction(async (tx) => {
    const status = await readEntitlement(db, uid, tx);
    const plan = planForStatus(status);
    const current = await currentPeriod(db, tx, uid, plan, now.getTime());
    const counts = current.data.counts ?? {};
    return {
      status,
      plan: plan.id,
      resetAt: current.hasAnchor ? new Date(current.period.resetMs).toISOString() : null,
      periodDays: plan.periodDays,
      features: Object.fromEntries(
        METERED_FEATURES.map((feature) => {
          const used = counts[feature] ?? 0;
          const limit = plan.limits[feature];
          return [feature, { used, limit, remaining: Math.max(0, limit - used) }];
        }),
      ) as Record<MeteredFeature, { used: number; limit: number; remaining: number }>,
      maxConcurrentJobs: plan.maxConcurrentJobs,
      maxVideoDurationSec: plan.maxVideoDurationSec,
      maxVideoBytes: plan.maxVideoBytes,
      neverPaywalled: [...NEVER_PAYWALLED],
    };
  });
}

export const getUsageSummary = onCall(createCallableOptions(), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  return usageSummary(getFirestore(), uid);
});
