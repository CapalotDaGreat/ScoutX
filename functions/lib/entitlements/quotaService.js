"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUsageSummary = void 0;
exports.planFor = planFor;
exports.consumeQuota = consumeQuota;
exports.releaseQuota = releaseQuota;
exports.assertQuotaAvailable = assertQuotaAvailable;
exports.usageSummary = usageSummary;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const callableOptions_1 = require("../callableOptions");
const plans_1 = require("./plans");
async function readEntitlement(db, uid, tx) {
    const ref = db.collection('entitlements').doc(uid);
    const snap = tx ? await tx.get(ref) : await ref.get();
    return (0, plans_1.effectiveStatus)(snap.data());
}
async function planFor(db, uid, tx) {
    return (0, plans_1.planForStatus)(await readEntitlement(db, uid, tx));
}
async function currentPeriod(db, tx, uid, plan, nowMs) {
    const ledgerRef = db.collection('usageLedger').doc(uid);
    const ledger = await tx.get(ledgerRef);
    const storedAnchor = Date.parse(String(ledger.get('anchorAt') ?? ''));
    const anchorMs = Number.isFinite(storedAnchor) ? storedAnchor : nowMs;
    const period = (0, plans_1.periodFor)(anchorMs, nowMs, plan.periodDays);
    const periodRef = ledgerRef.collection('periods').doc(period.key);
    const periodSnap = await tx.get(periodRef);
    return {
        ledgerRef,
        hasAnchor: Number.isFinite(storedAnchor),
        anchorMs,
        period,
        periodRef,
        data: (periodSnap.data() ?? {}),
    };
}
/**
 * Records one use of a metered feature. Idempotent per `refId` (a job or export id), so
 * retries and re-runs of the same job are never charged twice.
 */
async function consumeQuota(db, uid, feature, refId, now = new Date()) {
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
            throw new https_1.HttpsError('resource-exhausted', 'You have reached the limit for this period.', {
                reason: 'quota_exceeded',
                feature,
                used,
                limit,
                resetAt,
                plan: plan.id,
            });
        }
        if (!current.hasAnchor)
            tx.set(current.ledgerRef, { anchorAt: new Date(current.anchorMs).toISOString() }, { merge: true });
        tx.set(current.periodRef, {
            counts: { ...counts, [feature]: used + 1 },
            refs: { ...refs, [refId]: feature },
            startAt: new Date(current.period.startMs).toISOString(),
            resetAt,
            updatedAt: now.toISOString(),
        }, { merge: true });
        return { feature, used: used + 1, limit, remaining: Math.max(0, limit - used - 1), resetAt, plan: plan.id };
    });
}
/** Refunds a use when the work never ran (rejected video, cancelled before processing). */
async function releaseQuota(db, uid, feature, refId, now = new Date()) {
    return db.runTransaction(async (tx) => {
        const plan = await planFor(db, uid, tx);
        const current = await currentPeriod(db, tx, uid, plan, now.getTime());
        const refs = { ...(current.data.refs ?? {}) };
        if (refs[refId] !== feature)
            return false;
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
async function assertQuotaAvailable(db, uid, feature, refId) {
    await db.runTransaction(async (tx) => {
        const plan = await planFor(db, uid, tx);
        const current = await currentPeriod(db, tx, uid, plan, Date.now());
        if ((current.data.refs ?? {})[refId] === feature)
            return;
        const used = (current.data.counts ?? {})[feature] ?? 0;
        if (used >= plan.limits[feature]) {
            throw new https_1.HttpsError('resource-exhausted', 'You have reached the limit for this period.', {
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
async function usageSummary(db, uid, now = new Date()) {
    return db.runTransaction(async (tx) => {
        const status = await readEntitlement(db, uid, tx);
        const plan = (0, plans_1.planForStatus)(status);
        const current = await currentPeriod(db, tx, uid, plan, now.getTime());
        const counts = current.data.counts ?? {};
        return {
            status,
            plan: plan.id,
            resetAt: current.hasAnchor ? new Date(current.period.resetMs).toISOString() : null,
            periodDays: plan.periodDays,
            features: Object.fromEntries(plans_1.METERED_FEATURES.map((feature) => {
                const used = counts[feature] ?? 0;
                const limit = plan.limits[feature];
                return [feature, { used, limit, remaining: Math.max(0, limit - used) }];
            })),
            maxConcurrentJobs: plan.maxConcurrentJobs,
            maxVideoDurationSec: plan.maxVideoDurationSec,
            maxVideoBytes: plan.maxVideoBytes,
            neverPaywalled: [...plans_1.NEVER_PAYWALLED],
        };
    });
}
exports.getUsageSummary = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    return usageSummary((0, firestore_1.getFirestore)(), uid);
});
//# sourceMappingURL=quotaService.js.map