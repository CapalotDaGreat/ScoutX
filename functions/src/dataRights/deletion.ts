import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError } from 'firebase-functions/v2/https';
import { decideDeletionAuth, RECENT_LOGIN_MESSAGE, RECENT_LOGIN_REQUIRED } from '../security/recentAuth';
import {
  deleteDerivedData,
  deleteMediaData,
  deletePrimaryData,
  verifyUserDataDeleted,
} from '../accountDeletion';
import { discardUploadsForJob } from '../uploads/sessions';
import { retainLegalRecords, writeDeletionReceipt } from './legalRetention';

/**
 * Account deletion as a resumable state machine in `deletionRequests/{uid}`. Each step is
 * idempotent, so a retry (or a second tap on "Delete account") continues where the last
 * attempt stopped instead of starting over.
 */
export const DELETION_STEPS = [
  'requested',
  'access_revoked',
  'jobs_cancelled',
  'primary_deleted',
  'media_deleted',
  'derived_deleted',
  'verified',
  'completed',
] as const;
export type DeletionStep = (typeof DELETION_STEPS)[number];

export const DELETION_COLLECTION = 'deletionRequests';

export type DeletionDeps = {
  /** Revokes third-party sign-in tokens (Sign in with Apple). */
  revokeProviderTokens: (uid: string) => Promise<void>;
  /** Signs the account out everywhere. */
  revokeSessions: (uid: string) => Promise<void>;
  deleteAuthUser: (uid: string) => Promise<void>;
};

export type DeletionOutcome = { status: 'completed' } | { status: 'failed'; step: DeletionStep; remaining: string[] };

export function isDeletionStep(value: unknown): value is DeletionStep {
  return typeof value === 'string' && (DELETION_STEPS as readonly string[]).includes(value);
}

export function nextDeletionStep(step: DeletionStep): DeletionStep | null {
  const index = DELETION_STEPS.indexOf(step);
  return index >= 0 && index < DELETION_STEPS.length - 1 ? DELETION_STEPS[index + 1] : null;
}

type DeletionAuthToken = { auth_time?: unknown; firebase?: { sign_in_provider?: unknown } } | undefined;

/** Throws `failed-precondition` / `recent_login_required` unless the caller may delete `uid` now. */
export async function assertDeletionAuthorized(db: Firestore, uid: string, token: DeletionAuthToken): Promise<void> {
  const pending = await db.collection(DELETION_COLLECTION).doc(uid).get();
  const decision = decideDeletionAuth({
    authTime: token?.auth_time,
    signInProvider: token?.firebase?.sign_in_provider,
    pendingRequestedAt: pending.exists ? pending.get('requestedAt') : undefined,
    nowMs: Date.now(),
  });
  if (!decision.allowed) {
    throw new HttpsError('failed-precondition', RECENT_LOGIN_MESSAGE, { reason: RECENT_LOGIN_REQUIRED });
  }
}

const ACTIVE_JOB_STATUSES = ['draft', 'uploading', 'queued', 'processing'];

async function hideAndRevoke(db: Firestore, uid: string, deps: DeletionDeps): Promise<void> {
  // Stop being discoverable and reachable first, before the slower deletes.
  await Promise.all(
    ['discoverablePlayers', 'publicPassports', 'scoutFootballSources', 'pushTokens'].map((collection) =>
      db.collection(collection).doc(uid).delete(),
    ),
  );
  await deps.revokeProviderTokens(uid);
  await deps.revokeSessions(uid);
}

async function cancelActiveWork(db: Firestore, uid: string): Promise<void> {
  const jobs = await db.collection('matchAnalysisJobs').where('playerId', '==', uid).get();
  const now = new Date().toISOString();
  for (const job of jobs.docs) {
    if (!ACTIVE_JOB_STATUSES.includes(String(job.get('status')))) continue;
    await job.ref.update({ cancelRequested: true, status: 'cancelled', pipelineState: 'cancelled', updatedAt: now });
    await discardUploadsForJob(db, uid, job.id);
  }
}

export async function runAccountDeletion(db: Firestore, uid: string, deps: DeletionDeps): Promise<DeletionOutcome> {
  const ref = db.collection(DELETION_COLLECTION).doc(uid);
  const snap = await ref.get();
  const now = new Date().toISOString();
  const requestedAt = typeof snap.get('requestedAt') === 'string' ? (snap.get('requestedAt') as string) : now;
  let step: DeletionStep = isDeletionStep(snap.get('step')) ? (snap.get('step') as DeletionStep) : 'requested';
  await ref.set(
    {
      uid,
      step,
      status: 'in_progress',
      requestedAt,
      attempts: (typeof snap.get('attempts') === 'number' ? (snap.get('attempts') as number) : 0) + 1,
      updatedAt: now,
    },
    { merge: true },
  );

  const failures: string[] = [];
  for (let next = nextDeletionStep(step); next; next = nextDeletionStep(step)) {
    try {
      if (next === 'access_revoked') await hideAndRevoke(db, uid, deps);
      if (next === 'jobs_cancelled') await cancelActiveWork(db, uid);
      if (next === 'primary_deleted') {
        await retainLegalRecords(db, uid);
        failures.push(...(await deletePrimaryData(uid)).failures);
      }
      if (next === 'media_deleted') failures.push(...(await deleteMediaData(uid)).failures);
      if (next === 'derived_deleted') failures.push(...(await deleteDerivedData(uid)).failures);
      if (next === 'verified') {
        const remaining = await verifyUserDataDeleted(uid);
        if (remaining.length > 0) {
          // Retry re-runs the delete steps; the earlier ones are already done.
          await ref.set({ step: 'jobs_cancelled', status: 'failed', remaining, updatedAt: new Date().toISOString() }, { merge: true });
          logger.warn('Account deletion left data behind; will retry', { remaining, failures });
          return { status: 'failed', step: 'verified', remaining };
        }
      }
      if (next === 'completed') {
        await deps.deleteAuthUser(uid);
        await writeDeletionReceipt(db, uid, { requestedAt, completedAt: new Date().toISOString(), remaining: [] });
        await ref.delete();
        return { status: 'completed' };
      }
    } catch (error) {
      logger.error('Account deletion step failed', {
        step: next,
        message: error instanceof Error ? error.message : 'unknown',
      });
      await ref.set({ status: 'failed', failedStep: next, updatedAt: new Date().toISOString() }, { merge: true });
      return { status: 'failed', step: next, remaining: [] };
    }
    step = next;
    await ref.set({ step, status: 'in_progress', updatedAt: new Date().toISOString() }, { merge: true });
  }
  return { status: 'completed' };
}
