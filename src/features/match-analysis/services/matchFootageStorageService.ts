import { ref } from 'firebase/storage';
import { getFirebaseStorage } from '@/config/firebase';
import { MATCH_ANALYSIS_STORAGE_PATHS } from '@/features/match-analysis/constants';
import { uriToBlob, uploadBlobWithProgress } from '@/firebase/storageUpload';
import { UPLOAD_LIMITS } from '@/firebase/uploadPolicy';

export async function uploadMatchVideo(
  userId: string,
  jobId: string,
  localUri: string,
  onProgress?: (progress: number) => void,
): Promise<{ downloadUrl: string; storagePath: string; fileSizeBytes: number }> {
  const storage = getFirebaseStorage();
  if (!storage) {
    throw new Error('Firebase Storage is not initialized.');
  }

  const blob = await uriToBlob(localUri);
  const storagePath = MATCH_ANALYSIS_STORAGE_PATHS.video(userId, jobId);
  const storageRef = ref(storage, storagePath);
  const downloadUrl = await uploadBlobWithProgress(
    storageRef,
    blob,
    'video/mp4',
    onProgress ? (progress) => onProgress(progress) : undefined,
    { maxBytes: UPLOAD_LIMITS.matchFootage },
  );

  return { downloadUrl, storagePath, fileSizeBytes: blob.size };
}

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
