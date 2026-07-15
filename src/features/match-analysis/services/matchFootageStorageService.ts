import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type UploadTask,
} from 'firebase/storage';
import { getFirebaseStorage } from '@/config/firebase';
import { MATCH_ANALYSIS_STORAGE_PATHS } from '@/features/match-analysis/constants';

async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error('Unable to read file for upload.');
  }
  return response.blob();
}

function uploadBlobWithProgress(
  storageRef: ReturnType<typeof ref>,
  blob: Blob,
  contentType: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const task: UploadTask = uploadBytesResumable(storageRef, blob, {
      contentType,
      cacheControl: 'public,max-age=31536000',
    });

    task.on(
      'state_changed',
      (snapshot) => {
        const totalBytes = snapshot.totalBytes || blob.size;
        const progress = totalBytes > 0 ? (snapshot.bytesTransferred / totalBytes) * 100 : 0;
        onProgress?.(progress);
      },
      reject,
      () => {
        void getDownloadURL(task.snapshot.ref).then(resolve).catch(reject);
      },
    );
  });
}

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
  const downloadUrl = await uploadBlobWithProgress(storageRef, blob, 'video/mp4', onProgress);

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
  const downloadUrl = await uploadBlobWithProgress(storageRef, blob, 'image/jpeg');

  return { downloadUrl, storagePath };
}
