import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { parseQuarantinePath, type UploadState } from './model';

/** Marks a finished upload as quarantined; objects without a matching session are deleted. */
export async function recordQuarantinedObject(
  db: Firestore,
  path: string,
  sizeBytes: number,
): Promise<UploadState | null> {
  const parsed = parseQuarantinePath(path);
  if (!parsed) return null;
  const ref = db.collection('mediaUploads').doc(parsed.uploadId);
  const snap = await ref.get();
  const data = snap.data() as { ownerId?: string; state?: UploadState; sizeBytes?: number } | undefined;
  if (!data || data.ownerId !== parsed.uid || data.state !== 'uploading') {
    await getStorage().bucket().file(path).delete({ ignoreNotFound: true });
    logger.warn('Quarantine object without an open upload was deleted', { uploadId: parsed.uploadId });
    return null;
  }
  await db.collection('mediaUploadSessions').doc(parsed.uploadId).delete();
  await ref.update({
    state: 'quarantined',
    receivedBytes: sizeBytes,
    quarantinedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return 'quarantined';
}

export const onQuarantineObjectFinalized = onObjectFinalized({ memory: '256MiB' }, async (event) => {
  if (!event.data.name?.startsWith('quarantine/')) return;
  await recordQuarantinedObject(getFirestore(), event.data.name, Number(event.data.size ?? 0));
});
