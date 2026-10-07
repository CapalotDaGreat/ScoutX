import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  updateDoc,
  where,
  getDocs,
} from 'firebase/firestore';
import { getFirestoreDb, isFirebaseConfiguredForProject } from '@/config/firebase';
import { createCallableFunction } from '@/firebase/callableFunctions';
import type { EvidenceAttachment, StoredEvidenceRequest } from '@/features/request-center/types';
import type { VerificationLike } from '@/features/request-center/services/requestCenterService';

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function parseStoredRequest(id: string, data: Record<string, unknown>): StoredEvidenceRequest {
  const response = data.response && typeof data.response === 'object'
    ? (data.response as StoredEvidenceRequest['response'])
    : null;
  return {
    id,
    scoutId: asString(data.scoutId),
    playerId: asString(data.playerId),
    kinds: Array.isArray(data.kinds) ? data.kinds.filter((item): item is string => typeof item === 'string') : [],
    message: asString(data.message),
    status: asString(data.status),
    createdAt: asString(data.createdAt),
    updatedAt: asString(data.updatedAt),
    response,
  };
}

export class RequestCenterRepository {
  private static instance: RequestCenterRepository | null = null;

  public static getInstance(): RequestCenterRepository {
    if (!this.instance) {
      this.instance = new RequestCenterRepository();
    }
    return this.instance;
  }

  public subscribeToEvidenceRequests(
    playerId: string,
    onNext: (requests: StoredEvidenceRequest[]) => void,
    onError: (error: Error) => void,
  ): () => void {
    const db = isFirebaseConfiguredForProject() ? getFirestoreDb() : null;
    if (!db) {
      onNext([]);
      return () => undefined;
    }
    return onSnapshot(
      query(collection(db, 'evidenceRequests'), where('playerId', '==', playerId), limit(100)),
      (snapshot) => onNext(snapshot.docs.map((item) => parseStoredRequest(item.id, item.data()))),
      onError,
    );
  }

  public async listVerificationRequests(playerId: string): Promise<VerificationLike[]> {
    const db = isFirebaseConfiguredForProject() ? getFirestoreDb() : null;
    if (!db) {
      return [];
    }
    const snapshot = await getDocs(
      query(collection(db, 'verificationRequests'), where('requesterId', '==', playerId), limit(50)),
    );
    return snapshot.docs.map((item) => {
      const data = item.data();
      return {
        id: item.id,
        status: asString(data.status),
        evidence: asString(data.evidence),
        createdAt: asString(data.createdAt),
      };
    });
  }

  public async declineEvidenceRequest(requestId: string): Promise<void> {
    const db = getFirestoreDb();
    if (!db) {
      throw new Error('Firestore is not initialized.');
    }
    await updateDoc(doc(db, 'evidenceRequests', requestId), {
      status: 'declined',
      updatedAt: new Date().toISOString(),
    });
  }

  public async fulfillEvidenceRequest(
    requestId: string,
    attachments: EvidenceAttachment[],
    note: string,
  ): Promise<void> {
    const callable = createCallableFunction<{ requestId: string; attachments: EvidenceAttachment[]; note: string }>(
      'fulfillEvidenceRequest',
    );
    if (!callable) {
      throw new Error('Request responses are unavailable offline.');
    }
    await callable({ requestId, attachments, note });
  }
}
