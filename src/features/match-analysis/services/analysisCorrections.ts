import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import { MATCH_ANALYSIS_COLLECTION } from '@/features/match-analysis/constants';
import { createCallableFunction } from '@/firebase/callableFunctions';

import { parseCorrection, type AnalysisCorrection, type SubmitCorrectionRequest } from './correctionModel';

export * from './correctionModel';

export async function requestSubmitCorrection(request: SubmitCorrectionRequest): Promise<{ correctionId: string; deduplicated: boolean }> {
  const callable = createCallableFunction<SubmitCorrectionRequest>('submitAnalysisCorrection');
  if (!callable) throw new Error('Cloud Functions unavailable.');
  const result = await callable(request);
  return result.data as { correctionId: string; deduplicated: boolean };
}

export function subscribeCorrections(
  jobId: string,
  onData: (records: AnalysisCorrection[]) => void,
  onError: (error: Error) => void,
): () => void {
  const db = getFirestoreDb();
  if (!db) {
    onData([]);
    return () => undefined;
  }
  return onSnapshot(
    query(collection(db, MATCH_ANALYSIS_COLLECTION, jobId, 'corrections'), orderBy('createdAt', 'asc')),
    (snapshot) =>
      onData(snapshot.docs.map((doc) => parseCorrection(doc.id, doc.data())).filter((item): item is AnalysisCorrection => item !== null)),
    onError,
  );
}
