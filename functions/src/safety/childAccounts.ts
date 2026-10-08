import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { accountDeletionDeps } from '../appleAuth';
import { DELETION_COLLECTION, runAccountDeletion, type DeletionDeps } from '../dataRights/deletion';
import { CHILD_CONSENT_WAIT_DAYS } from './userSafety';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Grace period after a parent's consent expires before the private account is deleted. */
export const CHILD_EXPIRED_GRACE_DAYS = 30;

/** When an under-13 account without parental consent is deleted. */
export function childConsentDeadline(from: Date = new Date()): string {
  return new Date(from.getTime() + CHILD_CONSENT_WAIT_DAYS * DAY_MS).toISOString();
}

/** Approved accounts are kept while consent is valid, plus a grace period to renew it. */
export function childDeleteAfterApproval(consentExpiresAt: string): string {
  return new Date(Date.parse(consentExpiresAt) + CHILD_EXPIRED_GRACE_DAYS * DAY_MS).toISOString();
}

/**
 * Deletes a child's account because a parent declined or withdrew consent, or consent was
 * never given. Returns false if deletion stopped part-way; the daily cleanup retries it.
 */
export async function deleteChildAccount(
  db: Firestore,
  uid: string,
  reason: string,
  deps: DeletionDeps = accountDeletionDeps,
): Promise<boolean> {
  // Marks the request so the daily cleanup resumes it if a step fails after userSafety is gone.
  await db.collection(DELETION_COLLECTION).doc(uid).set({ uid, childAccount: true, childReason: reason }, { merge: true });
  const outcome = await runAccountDeletion(db, uid, deps);
  if (outcome.status === 'failed') {
    logger.error('Child account deletion incomplete', { uid, reason, step: outcome.step });
    return false;
  }
  logger.info('Child account deleted', { uid, reason });
  return true;
}

/**
 * Under-13 accounts whose `childDeleteAfter` has passed: parental consent was never given,
 * was declined or withdrawn, or expired and was not renewed.
 */
export async function deleteUnconsentedChildAccounts(
  db: Firestore,
  now: Date = new Date(),
  deps: DeletionDeps = accountDeletionDeps,
  batch = 100,
): Promise<number> {
  const due = await db
    .collection('userSafety')
    .where('childDeleteAfter', '<=', now.toISOString())
    .limit(batch)
    .get();
  let deleted = 0;
  for (const doc of due.docs) {
    if (doc.get('ageBand') !== 'under13') continue;
    if (await deleteChildAccount(db, doc.id, 'no_valid_parental_consent', deps)) deleted += 1;
  }
  const interrupted = await db
    .collection(DELETION_COLLECTION)
    .where('childAccount', '==', true)
    .where('status', '==', 'failed')
    .limit(batch)
    .get();
  for (const doc of interrupted.docs) {
    const reason = typeof doc.get('childReason') === 'string' ? String(doc.get('childReason')) : 'retry';
    if (await deleteChildAccount(db, doc.id, reason, deps)) deleted += 1;
  }
  return deleted;
}
