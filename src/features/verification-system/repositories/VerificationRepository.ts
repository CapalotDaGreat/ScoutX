import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import {
  type EntityVerificationState,
  type VerificationRequest,
  type VerificationRequestDraft,
} from '@/features/verification-system/types';

const REQUESTS_COLLECTION = 'verificationRequests';
const STATES_COLLECTION = 'verificationStates';

function createRequestId(): string {
  return `verification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyState(entityId: string, entityType: VerificationRequest['entityType']): EntityVerificationState {
  return {
    entityId,
    entityType,
    level: 'none',
    verifiedAt: null,
  };
}

export class VerificationRepository {
  private static instance: VerificationRepository | null = null;

  private constructor() {}

  public static getInstance(): VerificationRepository {
    if (!this.instance) {
      this.instance = new VerificationRepository();
    }
    return this.instance;
  }

  public async fetchVerificationState(
    entityId: string,
    entityType: VerificationRequest['entityType'],
  ): Promise<EntityVerificationState> {
    const db = getFirestoreDb();
    if (!db) {
      return emptyState(entityId, entityType);
    }

    const snapshot = await getDoc(doc(db, STATES_COLLECTION, `${entityType}-${entityId}`));
    if (!snapshot.exists()) {
      return emptyState(entityId, entityType);
    }

    const data = snapshot.data();
    const level =
      data.level === 'basic' || data.level === 'verified' ? data.level : 'none';

    return {
      entityId,
      entityType,
      level,
      verifiedAt: typeof data.verifiedAt === 'string' ? data.verifiedAt : null,
    };
  }

  public async submitVerificationRequest(
    requesterId: string,
    draft: VerificationRequestDraft,
  ): Promise<VerificationRequest> {
    const db = getFirestoreDb();
    const now = new Date().toISOString();
    const request: VerificationRequest = {
      id: createRequestId(),
      entityType: draft.entityType,
      entityId: draft.entityId,
      requesterId,
      requesterName: draft.requesterName,
      status: 'pending',
      evidence: draft.evidence,
      reviewerNote: null,
      createdAt: now,
      updatedAt: now,
    };

    if (!db) {
      return request;
    }

    await setDoc(doc(db, REQUESTS_COLLECTION, request.id), request);
    await setDoc(
      doc(db, STATES_COLLECTION, `${draft.entityType}-${draft.entityId}`),
      {
        entityId: draft.entityId,
        entityType: draft.entityType,
        level: 'basic',
        verifiedAt: null,
        updatedAt: now,
      },
      { merge: true },
    );

    return request;
  }
}
