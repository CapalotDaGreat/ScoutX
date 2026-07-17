import {
  deleteObject,
  ref,
} from 'firebase/storage';
import { getFirebaseStorage } from '@/config/firebase';
import { VIDEO_STORAGE_PATHS } from '@/features/highlight-videos/constants';
import {
  uriToBlob,
  uploadBlobWithProgress,
  type StorageUploadProgressCallback,
} from '@/firebase/storageUpload';

export type StorageUploadCallbacks = {
  onProgress?: StorageUploadProgressCallback;
};

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

  const downloadUrl = await uploadBlobWithProgress(
    storageRef,
    blob,
    'video/mp4',
    callbacks?.onProgress,
  );

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

  const downloadUrl = await uploadBlobWithProgress(
    storageRef,
    blob,
    'image/jpeg',
    callbacks?.onProgress,
  );

  return {
    downloadUrl,
    storagePath,
  };
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
