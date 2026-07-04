import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type UploadTask,
} from 'firebase/storage';
import { getFirebaseStorage } from '@/config/firebase';
import { VIDEO_STORAGE_PATHS } from '@/features/highlight-videos/constants';

export type StorageUploadCallbacks = {
  onProgress?: (progress: number, bytesTransferred: number, totalBytes: number) => void;
};

async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error('Unable to read file for upload.');
  }
  return response.blob();
}

export async function uploadVideoBlob(
  userId: string,
  videoId: string,
  localUri: string,
  callbacks?: StorageUploadCallbacks,
): Promise<{ downloadUrl: string; storagePath: string; fileSizeBytes: number }> {
  const storage = getFirebaseStorage();
  if (!storage) {
    throw new Error('Firebase Storage is not initialized.');
  }

  const blob = await uriToBlob(localUri);
  const storagePath = VIDEO_STORAGE_PATHS.video(userId, videoId);
  const storageRef = ref(storage, storagePath);

  const downloadUrl = await uploadBlobWithProgress(storageRef, blob, 'video/mp4', callbacks);

  return {
    downloadUrl,
    storagePath,
    fileSizeBytes: blob.size,
  };
}

export async function uploadThumbnailBlob(
  userId: string,
  videoId: string,
  localUri: string,
  callbacks?: StorageUploadCallbacks,
): Promise<{ downloadUrl: string; storagePath: string }> {
  const storage = getFirebaseStorage();
  if (!storage) {
    throw new Error('Firebase Storage is not initialized.');
  }

  const blob = await uriToBlob(localUri);
  const storagePath = VIDEO_STORAGE_PATHS.thumbnail(userId, videoId);
  const storageRef = ref(storage, storagePath);

  const downloadUrl = await uploadBlobWithProgress(storageRef, blob, 'image/jpeg', callbacks);

  return {
    downloadUrl,
    storagePath,
  };
}

function uploadBlobWithProgress(
  storageRef: ReturnType<typeof ref>,
  blob: Blob,
  contentType: string,
  callbacks?: StorageUploadCallbacks,
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
        callbacks?.onProgress?.(progress, snapshot.bytesTransferred, totalBytes);
      },
      (error) => {
        reject(error);
      },
      () => {
        void getDownloadURL(task.snapshot.ref).then(resolve).catch(reject);
      },
    );
  });
}

export async function deleteVideoStorageFiles(
  storagePath: string,
  thumbnailStoragePath?: string,
): Promise<void> {
  const storage = getFirebaseStorage();
  if (!storage) {
    return;
  }

  const deletions: Promise<void>[] = [deleteObject(ref(storage, storagePath))];

  if (thumbnailStoragePath) {
    deletions.push(deleteObject(ref(storage, thumbnailStoragePath)));
  }

  await Promise.allSettled(deletions);
}
