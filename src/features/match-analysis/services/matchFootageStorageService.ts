import { getDownloadURL, ref } from 'firebase/storage';
import { getFirebaseStorage } from '@/config/firebase';
import { MATCH_ANALYSIS_STORAGE_PATHS } from '@/features/match-analysis/constants';
import { uriToBlob, uploadBlobWithProgress } from '@/firebase/storageUpload';
import { UPLOAD_LIMITS } from '@/firebase/uploadPolicy';

export async function uploadMatchFrame(
  userId: string,
  jobId: string,
  index: number,
  localUri: string,
): Promise<{ downloadUrl: string; storagePath: string }> {
  const storage = getFirebaseStorage();
  if (!storage) {
    throw new Error('Firebase Storage is not initialized.');
  }

  const blob = await uriToBlob(localUri);
  const storagePath = MATCH_ANALYSIS_STORAGE_PATHS.frame(userId, jobId, index);
  const storageRef = ref(storage, storagePath);
  const downloadUrl = await uploadBlobWithProgress(storageRef, blob, 'image/jpeg', undefined, {
    maxBytes: UPLOAD_LIMITS.matchFrame,
  });

  return { downloadUrl, storagePath };
}

/** Owner-readable URL for a server-extracted frame (storage rules allow only the owner). */
export async function resolveFrameUrl(storagePath: string): Promise<string | null> {
  const storage = getFirebaseStorage();
  if (!storage || !storagePath.startsWith('profiles/')) {
    return null;
  }
  try {
    return await getDownloadURL(ref(storage, storagePath));
  } catch {
    return null;
  }
}
