import AsyncStorage from '@react-native-async-storage/async-storage';
import { parsePendingUploads, type PendingUpload } from '@/features/media-upload/types';

const keyFor = (uid: string) => `scoutx.pendingUploads.v1.${uid}`;

/** Device-local resume records so an interrupted upload continues from the committed offset. */
export const PendingUploadStore = {
  async list(uid: string): Promise<PendingUpload[]> {
    return parsePendingUploads(await AsyncStorage.getItem(keyFor(uid)));
  },

  async save(uid: string, upload: PendingUpload): Promise<void> {
    const others = (await this.list(uid)).filter((entry) => entry.uploadId !== upload.uploadId);
    await AsyncStorage.setItem(keyFor(uid), JSON.stringify([...others, upload]));
  },

  async remove(uid: string, uploadId: string): Promise<void> {
    const remaining = (await this.list(uid)).filter((entry) => entry.uploadId !== uploadId);
    if (remaining.length === 0) await AsyncStorage.removeItem(keyFor(uid));
    else await AsyncStorage.setItem(keyFor(uid), JSON.stringify(remaining));
  },

  async findForJob(uid: string, jobId: string): Promise<PendingUpload | null> {
    return (await this.list(uid)).find((entry) => entry.jobId === jobId) ?? null;
  },

  /** Clears every pending resume record for one account (used on sign-out). */
  async clearAll(uid: string): Promise<void> {
    await AsyncStorage.removeItem(keyFor(uid));
  },
};
