/**
 * Shared Firebase Storage upload helpers used by highlight videos and match analysis.
 */

import {
  getDownloadURL,
  uploadBytesResumable,
  type UploadTask,
  type StorageReference,
} from 'firebase/storage';
import {
  assertWithinLimit,
  DEFAULT_UPLOAD_RETRIES,
  isRetryableUploadError,
  retryDelayMs,
} from '@/firebase/uploadPolicy';

export type StorageUploadProgressCallback = (
  progress: number,
  bytesTransferred: number,
  totalBytes: number,
) => void;

export type ResumableUploadOptions = {
  onProgress?: StorageUploadProgressCallback;
  /** Rejects before uploading when the file is larger than this. */
  maxBytes?: number;
  /** Fresh attempts after a transient failure; the SDK already retries chunks within one attempt. */
  maxRetries?: number;
};

export type ResumableUpload = {
  promise: Promise<string>;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
};

export async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error('Unable to read file for upload.');
  }
  return response.blob();
}

/** Upload with progress, pause/resume, size limit and backoff retries on transient errors. */
export function createResumableUpload(
  storageRef: StorageReference,
  blob: Blob,
  contentType: string,
  options: ResumableUploadOptions = {},
): ResumableUpload {
  let task: UploadTask | null = null;
  let cancelled = false;
  const maxRetries = options.maxRetries ?? DEFAULT_UPLOAD_RETRIES;

  const attempt = (): Promise<string> =>
    new Promise((resolve, reject) => {
      task = uploadBytesResumable(storageRef, blob, {
        contentType,
        cacheControl: 'public,max-age=31536000',
      });
      task.on(
        'state_changed',
        (snapshot) => {
          const totalBytes = snapshot.totalBytes || blob.size;
          const progress = totalBytes > 0 ? (snapshot.bytesTransferred / totalBytes) * 100 : 0;
          options.onProgress?.(progress, snapshot.bytesTransferred, totalBytes);
        },
        reject,
        () => {
          if (!task) return;
          void getDownloadURL(task.snapshot.ref).then(resolve).catch(reject);
        },
      );
    });

  const run = async (): Promise<string> => {
    assertWithinLimit(blob.size, options.maxBytes);
    for (let tries = 0; ; tries += 1) {
      try {
        return await attempt();
      } catch (error) {
        if (cancelled || tries >= maxRetries || !isRetryableUploadError(error)) throw error;
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs(tries)));
        if (cancelled) throw error;
      }
    }
  };

  return {
    promise: run(),
    pause: () => {
      task?.pause();
    },
    resume: () => {
      task?.resume();
    },
    cancel: () => {
      cancelled = true;
      task?.cancel();
    },
  };
}

export function uploadBlobWithProgress(
  storageRef: StorageReference,
  blob: Blob,
  contentType: string,
  onProgress?: StorageUploadProgressCallback,
  limits: Omit<ResumableUploadOptions, 'onProgress'> = {},
): Promise<string> {
  return createResumableUpload(storageRef, blob, contentType, { ...limits, onProgress }).promise;
}
