import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { getFirestoreDb, isFirebaseConfiguredForProject } from '@/config/firebase';
import { createCallableFunction } from '@/firebase/callableFunctions';
import { MATCH_ANALYSIS_COLLECTION } from '@/features/match-analysis/constants';
import { createSecureId } from '@/utils/secureId';

export * from '@/features/match-analysis/services/trackingPresentation';
import type { TrackingAnswer, TrackingDoc, TrackingProgressDoc } from '@/features/match-analysis/services/trackingPresentation';

/** Live progress facts of the progressive analysis (null when none was started). */
export function subscribeTrackingProgress(jobId: string, onChange: (doc: TrackingProgressDoc | null) => void,
  onError?: (e: Error) => void): Unsubscribe {
  const db = getFirestoreDb();
  if (!db || !isFirebaseConfiguredForProject()) {
    onChange(null);
    return () => undefined;
  }
  return onSnapshot(doc(db, MATCH_ANALYSIS_COLLECTION, jobId, 'tracking', 'progress'),
    (snap) => onChange(snap.exists() ? (snap.data() as TrackingProgressDoc) : null), onError);
}

export type PlayerAnalysisStart = { status: 'started' | 'running' | 'complete' | 'blocked'; generation: number; segments: number;
  blocked?: TrackingProgressDoc['blocked'] };

/** Starts or resumes the progressive analysis (idempotent; finished parts are never re-processed). */
export async function startPlayerAnalysis(jobId: string): Promise<PlayerAnalysisStart> {
  const callable = createCallableFunction<{ jobId: string }>('startPlayerAnalysis');
  if (!callable) throw new Error('Cloud Functions unavailable.');
  const result = await callable({ jobId });
  return result.data as PlayerAnalysisStart;
}

export function subscribeTracking(jobId: string, onChange: (doc: TrackingDoc | null) => void, onError?: (e: Error) => void): Unsubscribe {
  const db = getFirestoreDb();
  if (!db || !isFirebaseConfiguredForProject()) {
    onChange(null);
    return () => undefined;
  }
  return onSnapshot(doc(db, MATCH_ANALYSIS_COLLECTION, jobId, 'tracking', 'current'),
    (snap) => onChange(snap.exists() ? (snap.data() as TrackingDoc) : null), onError);
}

export async function answerTrackingQuestion(jobId: string, questionId: string, answer: TrackingAnswer): Promise<void> {
  const callable = createCallableFunction<{ jobId: string; questionId: string; answer: TrackingAnswer; operationId: string }>('answerTrackingQuestion');
  if (!callable) throw new Error('Cloud Functions unavailable.');
  await callable({ jobId, questionId, answer, operationId: createSecureId('op', 16) });
}

export async function undoTrackingAnswer(jobId: string): Promise<void> {
  const callable = createCallableFunction<{ jobId: string }>('undoTrackingAnswer');
  if (!callable) throw new Error('Cloud Functions unavailable.');
  await callable({ jobId });
}

export type VideoSourceInspection = {
  provider: 'veo' | 'direct_https' | 'unsupported';
  status: 'ready' | 'requires_export' | 'partner_access_required' | 'invalid' | 'unreachable' | 'not_video' | 'too_large';
  reason: string;
  metadata: Record<string, string | number | null>;
  steps?: string[];
  maxVideoBytes: number;
};

export async function inspectVideoSource(url: string): Promise<VideoSourceInspection> {
  const callable = createCallableFunction<{ url: string }>('inspectVideoSource');
  if (!callable) throw new Error('Cloud Functions unavailable.');
  const result = await callable({ url });
  return result.data as VideoSourceInspection;
}

export type LinkImportStart = { uploadId: string; state: string; bytes: number; host: string; reused: boolean };

/** Starts the server-side import of a verified direct video link into the job's quarantine. */
export async function startLinkImport(jobId: string, url: string): Promise<LinkImportStart> {
  const callable = createCallableFunction<{ jobId: string; url: string }>('startLinkImport');
  if (!callable) throw new Error('Cloud Functions unavailable.');
  const result = await callable({ jobId, url });
  return result.data as LinkImportStart;
}
