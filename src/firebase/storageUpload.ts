/**
 * Shared Firebase Storage upload helpers used by highlight videos and match analysis.
 */

import {
  getDownloadURL,
  uploadBytesResumable,
  type UploadTask,
  type StorageReference,
} from 'firebase/storage';

export type StorageUploadProgressCallback = (
  progress: number,
  bytesTransferred: number,
  totalBytes: number,
) => void;

export async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error('Unable to read file for upload.');
  }
  return response.blob();
}

export function uploadBlobWithProgress(
  storageRef: StorageReference,
  blob: Blob,
  contentType: string,
  onProgress?: StorageUploadProgressCallback,
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
        onProgress?.(progress, snapshot.bytesTransferred, totalBytes);
      },
      reject,
      () => {
        void getDownloadURL(task.snapshot.ref).then(resolve).catch(reject);
      },
    );
  });
}
