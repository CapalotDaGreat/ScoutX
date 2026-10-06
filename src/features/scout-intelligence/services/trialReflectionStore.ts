import { collection, doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import type { TrialReflection } from '@/features/scout-intelligence/types';

export async function loadTrialReflection(
  ownerId: string,
  trialId: string,
): Promise<TrialReflection | null> {
  const db = getFirestoreDb();
  if (!db) {
    return null;
  }
  const snap = await getDoc(doc(db, 'players', ownerId, 'trialReflections', trialId));
  if (!snap.exists()) {
    return null;
  }
  const data = snap.data();
  return {
    trialId,
    ownerId,
    wentWell: typeof data.wentWell === 'string' ? data.wentWell : '',
    improve: typeof data.improve === 'string' ? data.improve : '',
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
  };
}

export async function saveTrialReflection(reflection: TrialReflection): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    return;
  }
  await setDoc(doc(collection(db, 'players', reflection.ownerId, 'trialReflections'), reflection.trialId), reflection);
}
