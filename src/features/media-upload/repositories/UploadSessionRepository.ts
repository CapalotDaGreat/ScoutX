import { doc, onSnapshot } from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import { createCallableFunction } from '@/firebase/callableFunctions';
import {
  parseServerUploadRecord,
  parseUploadState,
  type ServerUploadRecord,
  type UploadPurpose,
  type UploadSession,
} from '@/features/media-upload/types';
import { type UploadContentType } from '@/features/media-upload/services/chunkPlan';

type CreateUploadSessionRequest = {
  purpose: UploadPurpose;
  jobId: string;
  fileName: string;
  contentType: UploadContentType;
  sizeBytes: number;
  declaredDurationSec: number;
  fingerprint: string;
};

function parseSession(data: unknown): UploadSession {
  const record = (data ?? {}) as Record<string, unknown>;
  const state = parseUploadState(record.state);
  if (typeof record.uploadId !== 'string' || !state || typeof record.chunkBytes !== 'number') {
    throw new Error('The server returned an invalid upload session.');
  }
  return {
    uploadId: record.uploadId,
    sessionUri: typeof record.sessionUri === 'string' ? record.sessionUri : '',
    state,
    chunkBytes: record.chunkBytes,
    reused: record.reused === true,
  };
}

export const UploadSessionRepository = {
  async create(request: CreateUploadSessionRequest): Promise<UploadSession> {
    const fn = createCallableFunction<CreateUploadSessionRequest>('createUploadSession');
    if (!fn) throw new Error('Uploading needs a connection to the ScoutX server.');
    return parseSession((await fn(request)).data);
  },

  async cancel(uploadId: string): Promise<void> {
    const fn = createCallableFunction<{ uploadId: string }>('cancelUploadSession');
    if (!fn) return;
    await fn({ uploadId });
  },

  /** Resolves when server validation finishes, or null if it does not within `timeoutMs`. */
  waitForOutcome(uploadId: string, timeoutMs: number): Promise<ServerUploadRecord | null> {
    return new Promise((resolve) => {
      let settled = false;
      let unsubscribe: () => void = () => undefined;
      const finish = (record: ServerUploadRecord | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        resolve(record);
      };
      const timer = setTimeout(() => finish(null), timeoutMs);
      unsubscribe = this.subscribe(
        uploadId,
        (record) => {
          if (record && ['ready', 'rejected', 'expired', 'cancelled'].includes(record.state)) finish(record);
        },
        () => finish(null),
      );
      if (settled) unsubscribe();
    });
  },

  /** Server-owned processing state: quarantined, validated, ready or rejected. */
  subscribe(
    uploadId: string,
    onData: (record: ServerUploadRecord | null) => void,
    onError: (error: Error) => void,
  ): () => void {
    const db = getFirestoreDb();
    if (!db) {
      onData(null);
      return () => undefined;
    }
    return onSnapshot(
      doc(db, 'mediaUploads', uploadId),
      (snapshot) => onData(parseServerUploadRecord(uploadId, snapshot.data())),
      onError,
    );
  },
};
