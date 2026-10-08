import { getFirestore, type Firestore, type Query, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { accountDeletionDeps, accountDeletionSecrets } from '../appleAuth';
import { deleteUnconsentedChildAccounts } from '../safety/childAccounts';
import { footageMediaId } from '../uploads/model';
import type { DeletionDeps } from './deletion';
import { LEGAL_RETENTION_COLLECTION } from './legalRetention';
import { RETENTION, olderThan } from './retention';

const BATCH = 300;

export type CleanupCounts = {
  exportsExpired: number;
  failedUploads: number;
  abandonedJobs: number;
  webhookReceipts: number;
  legalRecords: number;
  privacyRequests: number;
  /** Under-13 accounts deleted for lack of valid parental consent. */
  childAccounts: number;
};

async function each(query: Query, run: (doc: QueryDocumentSnapshot) => Promise<void>): Promise<number> {
  const snap = await query.limit(BATCH).get();
  for (const doc of snap.docs) await run(doc);
  return snap.size;
}

async function deletePrefix(prefix: string): Promise<void> {
  await getStorage().bucket().deleteFiles({ prefix, force: true });
}

/**
 * Applies the retention periods in `retention.ts`. Each pass handles up to BATCH items per
 * category; the daily schedule catches up on anything left over.
 */
export async function runRetentionCleanup(
  db: Firestore,
  now: Date = new Date(),
  deletionDeps: DeletionDeps = accountDeletionDeps,
): Promise<CleanupCounts> {
  const nowIso = now.toISOString();

  const exportsExpired = await each(
    db.collection('dataExports').where('status', '==', 'ready').where('expiresAt', '<=', nowIso),
    async (doc) => {
      await deletePrefix(`exports/${String(doc.get('uid'))}/${doc.id}/`);
      await doc.ref.update({ status: 'expired', downloadUrl: null, storagePath: null, updatedAt: nowIso });
    },
  ) + await each(
    db.collection('dataExports').where('status', 'in', ['failed', 'expired']).where('updatedAt', '<=', olderThan(now, RETENTION.exportDays)),
    async (doc) => {
      await deletePrefix(`exports/${String(doc.get('uid'))}/${doc.id}/`);
      await doc.ref.delete();
    },
  );

  const failedUploads = await each(
    db.collection('mediaUploads').where('state', 'in', ['rejected', 'expired', 'cancelled']).where('updatedAt', '<=', olderThan(now, RETENTION.failedUploadDays)),
    async (doc) => {
      await deletePrefix(`quarantine/${String(doc.get('ownerId'))}/${doc.id}/`);
      await doc.ref.delete();
    },
  );

  const abandonedJobs = await each(
    db.collection('matchAnalysisJobs').where('status', 'in', ['cancelled', 'expired', 'failed']).where('updatedAt', '<=', olderThan(now, RETENTION.abandonedJobDays)),
    async (doc) => {
      await deletePrefix(`profiles/${String(doc.get('playerId'))}/matchFootage/${doc.id}/`);
      await db.collection('players').doc(String(doc.get('playerId'))).collection('media').doc(footageMediaId(doc.id)).delete();
      await doc.ref.delete();
    },
  );

  const webhookReceipts = await each(
    db.collection('revenueCatEvents').where('processedAt', '<=', olderThan(now, RETENTION.webhookReceiptDays)),
    async (doc) => {
      await doc.ref.delete();
    },
  );

  const legalRecords = await each(
    db.collection(LEGAL_RETENTION_COLLECTION).where('deleteAfter', '<=', nowIso),
    async (doc) => {
      await doc.ref.delete();
    },
  );

  const privacyRequests = await each(
    db.collection('privacyRequests').where('status', 'in', ['completed', 'rejected']).where('closedAt', '<=', olderThan(now, RETENTION.privacyRequestDays)),
    async (doc) => {
      await doc.ref.delete();
    },
  );

  const childAccounts = await deleteUnconsentedChildAccounts(db, now, deletionDeps);

  return { exportsExpired, failedUploads, abandonedJobs, webhookReceipts, legalRecords, privacyRequests, childAccounts };
}

export const retentionCleanup = onSchedule({
  schedule: 'every day 03:30',
  timeZone: 'Europe/Zurich',
  timeoutSeconds: 540,
  secrets: accountDeletionSecrets,
}, async () => {
  const counts = await runRetentionCleanup(getFirestore());
  logger.info('Retention cleanup finished', counts);
});
