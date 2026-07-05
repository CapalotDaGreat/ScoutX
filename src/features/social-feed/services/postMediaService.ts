import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getFirebaseStorage } from '@/config/firebase';
import { POST_STORAGE_PATHS } from '@/features/social-feed/constants';

export type PostMediaUploadProgress = {
  progress: number;
  bytesTransferred: number;
  totalBytes: number;
};

export async function uploadPostImage(
  userId: string,
  postId: string,
  fileUri: string,
  onProgress?: (progress: PostMediaUploadProgress) => void,
): Promise<string> {
  const storage = getFirebaseStorage();
  if (!storage) {
    return fileUri;
  }

  const response = await fetch(fileUri);
  const blob = await response.blob();
  const storageRef = ref(storage, POST_STORAGE_PATHS.image(userId, postId));

  return uploadBlobWithProgress(storageRef, blob, onProgress);
}

export async function uploadPostClip(
  userId: string,
  postId: string,
  fileUri: string,
  onProgress?: (progress: PostMediaUploadProgress) => void,
): Promise<{ videoUrl: string; thumbnailUrl?: string }> {
  const storage = getFirebaseStorage();
  if (!storage) {
    return { videoUrl: fileUri };
  }

  const response = await fetch(fileUri);
  const blob = await response.blob();
  const videoRef = ref(storage, POST_STORAGE_PATHS.clip(userId, postId));
  const videoUrl = await uploadBlobWithProgress(videoRef, blob, onProgress);

  return { videoUrl };
}

async function uploadBlobWithProgress(
  storageRef: ReturnType<typeof ref>,
  blob: Blob,
  onProgress?: (progress: PostMediaUploadProgress) => void,
): Promise<string> {
  const storage = getFirebaseStorage();
  if (!storage) {
    throw new Error('Firebase Storage is not configured.');
  }

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, blob, {
      cacheControl: 'public,max-age=31536000',
    });

    task.on(
      'state_changed',
      (snapshot) => {
        onProgress?.({
          progress: snapshot.bytesTransferred / snapshot.totalBytes,
          bytesTransferred: snapshot.bytesTransferred,
          totalBytes: snapshot.totalBytes,
        });
      },
      reject,
      async () => {
        resolve(await getDownloadURL(task.snapshot.ref));
      },
    );
  });
}
