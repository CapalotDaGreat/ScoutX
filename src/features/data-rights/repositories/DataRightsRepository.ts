import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';
import { getFirebaseStorage, getFirestoreDb } from '@/config/firebase';
import { createCallableFunction } from '@/firebase/callableFunctions';
import {
  parseDeletionProgress,
  parseExportJob,
  parsePrivacyRequest,
  type DataExportJob,
  type DeletionProgress,
  type PrivacyRequest,
  type PrivacyRequestType,
} from '@/features/data-rights/types';

function callable<T>(name: string) {
  const fn = createCallableFunction<T>(name);
  if (!fn) throw new Error('PitchProof needs a connection to the server for this.');
  return fn;
}

const noop = () => undefined;

export const DataRightsRepository = {
  subscribeDeletion(uid: string, onData: (progress: DeletionProgress | null) => void): () => void {
    const db = getFirestoreDb();
    if (!db) return noop;
    return onSnapshot(
      doc(db, 'deletionRequests', uid),
      (snap) => onData(parseDeletionProgress(snap.data())),
      () => onData(null),
    );
  },

  /** Latest export first; older ones are kept only until they expire. */
  subscribeExports(uid: string, onData: (jobs: DataExportJob[]) => void): () => void {
    const db = getFirestoreDb();
    if (!db) {
      onData([]);
      return noop;
    }
    return onSnapshot(
      query(collection(db, 'dataExports'), where('uid', '==', uid)),
      (snap) => {
        const jobs = snap.docs
          .map((item) => parseExportJob(item.id, item.data()))
          .filter((job): job is DataExportJob => job !== null)
          .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
        onData(jobs);
      },
      () => onData([]),
    );
  },

  async requestExport(): Promise<{ exportId: string; status: string }> {
    const result = await callable<Record<string, never>>('requestDataExport')({});
    return result.data as { exportId: string; status: string };
  },

  /** Signed link when the server could sign one, otherwise a Storage URL the rules allow for the owner. */
  async downloadUrlFor(job: DataExportJob): Promise<string> {
    if (job.downloadUrl) return job.downloadUrl;
    const storage = getFirebaseStorage();
    if (!storage || !job.storagePath) throw new Error('This export is not available any more.');
    return getDownloadURL(ref(storage, job.storagePath));
  },

  subscribePrivacyRequests(uid: string, onData: (requests: PrivacyRequest[]) => void): () => void {
    const db = getFirestoreDb();
    if (!db) {
      onData([]);
      return noop;
    }
    return onSnapshot(
      query(collection(db, 'privacyRequests'), where('uid', '==', uid)),
      (snap) => {
        const requests = snap.docs
          .map((item) => parsePrivacyRequest(item.id, item.data()))
          .filter((request): request is PrivacyRequest => request !== null)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        onData(requests);
      },
      () => onData([]),
    );
  },

  async submitPrivacyRequest(type: PrivacyRequestType, details: string): Promise<{ requestId: string; deadlineAt: string }> {
    const result = await callable<{ type: PrivacyRequestType; details: string }>('submitPrivacyRequest')({ type, details });
    return result.data as { requestId: string; deadlineAt: string };
  },
};
