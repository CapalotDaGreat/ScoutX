import { randomUUID } from 'node:crypto';
import type { DocumentReference, DocumentSnapshot, Firestore, Transaction } from 'firebase-admin/firestore';
import { MATCH_COLLECTION } from './frameAnalysis';
import { TRACKING_COLLECTION } from './trackingV3';
import { OCR_REFRESH_MAX_ATTEMPTS, RESOLVE_MAX_ATTEMPTS, TRACKING_ATTEMPT_LEASE_MS } from './trackingDeadlines';
import { followUpRunnable, type OcrFollowUp } from './trackingFollowUp';

export const RECONCILIATION_COLLECTION = 'trackingAttemptReconciliation';

export const RESOLVE_LEASE_MS = TRACKING_ATTEMPT_LEASE_MS;
export const OCR_REFRESH_LEASE_MS = TRACKING_ATTEMPT_LEASE_MS;
export type TrackingTaskLease = { ref: DocumentReference; token: string; generation: number | null; revision: number };

/** One lease per scope, so a slow preliminary report cannot consume the full report's retry budget. */
export async function claimTrackingTask(db: Firestore, jobId: string, revision: number,
  scope: 'feedback' | 'preliminary' | 'full' | 'refresh', round: number | undefined,
  now: () => Date, attempt?: number): Promise<TrackingTaskLease | 'busy' | 'stale' | 'superseded' | 'unavailable'> {
  const base = db.collection(MATCH_COLLECTION).doc(jobId).collection(TRACKING_COLLECTION);
  const ref = base.doc(`lease_${scope}`);
  return db.runTransaction(async (tx) => {
    const progress = await tx.get(base.doc('progress'));
    const stored = await tx.get(ref);
    const feedback = await tx.get(base.doc('feedback'));
    const job = await tx.get(db.collection(MATCH_COLLECTION).doc(jobId));
    if (!job.exists || progress.get('outcome') === 'cancelled') return 'unavailable' as const;
    if (scope !== 'refresh' && (feedback.get('revision') ?? 0) !== revision) return 'superseded' as const;
    const current = await tx.get(base.doc('current'));
    if (scope === 'refresh') {
      if (!followUpRunnable(current.get('followUp') as OcrFollowUp | undefined, revision, round ?? -1)) return 'stale' as const;
    }
    const generation = (progress.get('generation') as number | undefined) ?? null;
    const key = `${generation ?? '-'}:${revision}:${round ?? '-'}`;
    const at = now().getTime();
    const busy = stored.get('key') === key && typeof stored.get('token') === 'string'
      && Number(stored.get('expiresAtMs')) > at;
    const token = busy ? stored.get('token') as string : randomUUID();
    const expiresAtMs = busy ? Number(stored.get('expiresAtMs')) : at + TRACKING_ATTEMPT_LEASE_MS;
    const maxAttempts = scope === 'refresh' ? OCR_REFRESH_MAX_ATTEMPTS : RESOLVE_MAX_ATTEMPTS;
    // Atomic outbox: even death immediately after claim leaves durable final-attempt recovery.
    // A final delivery acknowledged as busy must also register its existing owner's expiry.
    if (attempt !== undefined && Number.isSafeInteger(attempt) && attempt >= maxAttempts - 1) {
      tx.set(db.collection(RECONCILIATION_COLLECTION).doc(token), {
        jobId, scope, round: round ?? null, token, generation, revision,
        currentVersion: busy ? stored.get('currentVersion') ?? null : current.get('version') ?? null,
        startedAt: busy ? stored.get('startedAt') ?? null : progress.get('startedAt') ?? null,
        dueAtMs: expiresAtMs,
      });
    }
    if (busy) return 'busy' as const;
    tx.set(ref, { key, token, expiresAtMs, currentVersion: current.get('version') ?? null,
      startedAt: progress.get('startedAt') ?? null });
    return { ref, token, generation, revision };
  });
}

export function ownsTrackingLease(snapshot: DocumentSnapshot, lease: TrackingTaskLease, at: Date): boolean {
  return snapshot.get('token') === lease.token && Number(snapshot.get('expiresAtMs')) > at.getTime();
}

/** Fences against takeover/new generations. allowStopped is only for marking an old OCR chain stale/cancelled. */
export async function trackingLeaseCurrent(tx: Transaction, db: Firestore, jobId: string,
  lease: TrackingTaskLease, at: Date, allowStopped = false): Promise<boolean> {
  const stored = await tx.get(lease.ref);
  const job = db.collection(MATCH_COLLECTION).doc(jobId);
  const progress = await tx.get(job.collection(TRACKING_COLLECTION).doc('progress'));
  const feedback = await tx.get(job.collection(TRACKING_COLLECTION).doc('feedback'));
  const currentJob = await tx.get(job);
  return ownsTrackingLease(stored, lease, at) && (progress.get('generation') ?? null) === lease.generation
    && (allowStopped || ((feedback.get('revision') ?? 0) === lease.revision && currentJob.exists
      && currentJob.get('cancelRequested') !== true && progress.get('outcome') !== 'cancelled'));
}

export async function releaseTrackingTask(db: Firestore, lease: TrackingTaskLease): Promise<void> {
  await db.runTransaction(async (tx) => {
    const stored = await tx.get(lease.ref);
    if (stored.get('token') === lease.token) tx.set(lease.ref, { token: null, expiresAtMs: 0 }, { merge: true });
  });
}
