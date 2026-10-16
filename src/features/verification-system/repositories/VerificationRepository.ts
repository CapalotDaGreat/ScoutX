import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import {
  type EntityVerificationState,
  type VerificationRequest,
  type VerificationRequestDraft,
} from '@/features/verification-system/types';
import { createSecureId } from '@/utils/secureId';

const REQUESTS_COLLECTION = 'verificationRequests';
const STATES_COLLECTION = 'verificationStates';

function createRequestId(): string {
  return createSecureId('verification', 8, '-');
}

export function emptyVerificationDimensions(): EntityVerificationState['dimensions'] {
  return {
    identity: 'none',
    club: 'none',
    coach: 'none',
    performance: 'none',
    career: 'none',
  };
}

function emptyState(entityId: string, entityType: VerificationRequest['entityType']): EntityVerificationState {
  return {
    entityId,
    entityType,
    level: 'none',
    verifiedAt: null,
    dimensions: emptyVerificationDimensions(),
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
    const dimensions = emptyVerificationDimensions();
    const raw = data.dimensions && typeof data.dimensions === 'object' ? (data.dimensions as Record<string, unknown>) : {};
    for (const key of Object.keys(dimensions) as Array<keyof typeof dimensions>) {
      if (raw[key] === 'basic' || raw[key] === 'verified' || raw[key] === 'none') {
        dimensions[key] = raw[key];
      }
    }
    if (level === 'verified') {
      dimensions.identity = 'verified';
    }

    return {
      entityId,
      entityType,
      level,
      verifiedAt: typeof data.verifiedAt === 'string' ? data.verifiedAt : null,
      dimensions,
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
        dimensions: {
          ...emptyVerificationDimensions(),
          identity: 'basic',
        },
        updatedAt: now,
      },
      { merge: true },
    );

    return request;
  }
}
