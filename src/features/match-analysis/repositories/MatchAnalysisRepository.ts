import {
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  where,
  limit,
  getDocs,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirestoreDb, isFirebaseConfiguredForProject } from '@/config/firebase';
import { MATCH_ANALYSIS_COLLECTION } from '@/features/match-analysis/constants';
import {
  type MatchAnalysisJob,
} from '@/features/match-analysis/types';

function jobsCollection() {
  const db = getFirestoreDb();
  if (!db) {
    throw new Error('Firestore is not initialized.');
  }
  return collection(db, MATCH_ANALYSIS_COLLECTION);
}

export async function createMatchAnalysisJob(job: MatchAnalysisJob): Promise<void> {
  if (!isFirebaseConfiguredForProject()) {
    return;
  }
  const payload = Object.fromEntries(
    Object.entries(job).filter(([, value]) => value !== undefined),
  );
  await setDoc(doc(jobsCollection(), job.id), payload);
}

export async function updateMatchAnalysisJob(
  jobId: string,
  patch: Partial<MatchAnalysisJob>,
): Promise<void> {
  if (!isFirebaseConfiguredForProject()) {
    return;
  }
  const ref = doc(jobsCollection(), jobId);
  const existing = await getDoc(ref);
  const base = (existing.data() ?? {}) as Record<string, unknown>;
  const payload: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    // Firestore rejects undefined values; an explicit undefined in the patch clears the field.
    payload[key] = value === undefined ? deleteField() : value;
  }
  payload.updatedAt = new Date().toISOString();
  await setDoc(ref, payload, { merge: true });
}

export async function getMatchAnalysisJob(jobId: string): Promise<MatchAnalysisJob | null> {
  if (!isFirebaseConfiguredForProject()) {
    return null;
  }
  const snap = await getDoc(doc(jobsCollection(), jobId));
  if (!snap.exists()) {
    return null;
  }
  return snap.data() as MatchAnalysisJob;
}

export function subscribeMatchAnalysisJob(
  jobId: string,
  onChange: (job: MatchAnalysisJob | null) => void,
): Unsubscribe {
  if (!isFirebaseConfiguredForProject()) {
    onChange(null);
    return () => undefined;
  }
  return onSnapshot(doc(jobsCollection(), jobId), (snap) => {
    onChange(snap.exists() ? (snap.data() as MatchAnalysisJob) : null);
  });
}

export async function listRecentMatchAnalysisJobs(
  playerId: string,
  max = 10,
): Promise<MatchAnalysisJob[]> {
  if (!isFirebaseConfiguredForProject()) {
    return [];
  }
  const q = query(jobsCollection(), where('playerId', '==', playerId), limit(40));
  const snap = await getDocs(q);
  return snap.docs
    .map((item) => item.data() as MatchAnalysisJob)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, max);
}
