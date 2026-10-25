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

/** Fields the app may set when creating a job; status, stages, frames from extraction and results are server-owned. */
const CREATE_KEYS = [
  'id',
  'playerId',
  'status',
  'targeting',
  'match',
  'durationSec',
  'fileSizeBytes',
  'frames',
  'identityConfirmation',
  'identityCandidates',
  'idempotencyKey',
  'analysisIntent',
  'clipContext',
  'createdAt',
  'updatedAt',
] as const satisfies ReadonlyArray<keyof MatchAnalysisJob>;

/** Fields the app may change later: identity confirmation, GPS sync and short-clip device frames. */
export type MatchAnalysisJobClientPatch = Partial<
  Pick<MatchAnalysisJob, 'identityConfirmation' | 'identityCandidates' | 'frames' | 'videoSync'>
>;

export async function createMatchAnalysisJob(job: MatchAnalysisJob): Promise<void> {
  if (!isFirebaseConfiguredForProject()) {
    return;
  }
  const payload = Object.fromEntries(
    CREATE_KEYS.map((key) => [key, job[key]]).filter(([, value]) => value !== undefined),
  );
  await setDoc(doc(jobsCollection(), job.id), payload);
}

export async function updateMatchAnalysisJob(jobId: string, patch: MatchAnalysisJobClientPatch): Promise<void> {
  if (!isFirebaseConfiguredForProject()) {
    return;
  }
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    // Firestore rejects undefined values; an explicit undefined in the patch clears the field.
    payload[key] = value === undefined ? deleteField() : value;
  }
  payload.updatedAt = new Date().toISOString();
  await setDoc(doc(jobsCollection(), jobId), payload, { merge: true });
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
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!isFirebaseConfiguredForProject()) {
    onChange(null);
    return () => undefined;
  }
  return onSnapshot(doc(jobsCollection(), jobId), (snap) => {
    onChange(snap.exists() ? (snap.data() as MatchAnalysisJob) : null);
  }, onError);
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
