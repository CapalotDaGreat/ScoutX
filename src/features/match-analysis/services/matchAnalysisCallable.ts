import { createCallableFunction } from '@/firebase/callableFunctions';
import type { AskThisMatchCitation } from '@/features/match-analysis/services/askThisMatchService';
import type { AnalysisMode, ProcessingMode } from '@/features/match-analysis/services/analysisMode';
import type { VideoConsentChoices } from '@/features/match-analysis/types';

export type AnalyzeMatchFootageRequest = {
  jobId: string;
  idempotencyKey?: string;
};

export type CoordinateIdentityRequest = { jobId: string; expectedGeneration: number; expectedAnchorRevision: number };

/** Metadata only; approval, consent, provenance and revision checks remain server-owned. */
export async function requestCoordinateAnalysisTarget(request: CoordinateIdentityRequest): Promise<void> {
  const callable = createCallableFunction<CoordinateIdentityRequest>('coordinateAnalysisTarget');
  if (!callable) throw new Error('Cloud Functions unavailable.');
  await callable(request);
}

export type AnalyzeMatchFootageResponse = {
  jobId: string;
  /** `queued` when the server restarted key-frame extraction instead of analysing directly. */
  status: 'complete' | 'queued';
};

export async function requestCancelMatchAnalysis(jobId: string): Promise<{ jobId: string; status: string }> {
  const callable = createCallableFunction<{ jobId: string }>('cancelMatchAnalysis');
  if (!callable) {
    throw new Error('Cloud Functions unavailable.');
  }
  const result = await callable({ jobId });
  return result.data as { jobId: string; status: string };
}

export async function requestMatchFootageAnalysis(
  jobId: string,
  idempotencyKey?: string,
): Promise<AnalyzeMatchFootageResponse> {
  const callable = createCallableFunction<AnalyzeMatchFootageRequest>('analyzeMatchFootage');
  if (!callable) {
    throw new Error('Cloud Functions unavailable.');
  }

  const result = await callable({ jobId, idempotencyKey });
  return result.data as AnalyzeMatchFootageResponse;
}

export type RecordVideoConsentRequest = {
  jobId: string;
  acknowledgements: { processing: true; rights: true; retention: true; provider: true };
  retainSource: boolean;
  keepForRetry: boolean;
  evidenceClips: boolean;
};

export type RecordVideoConsentResponse = {
  jobId: string;
  analysisMode: AnalysisMode;
  processingMode: ProcessingMode;
  providers: string[];
};

/** Only called after the player ticked every acknowledgement on the consent sheet. */
export async function requestRecordVideoConsent(
  jobId: string,
  choices: VideoConsentChoices,
): Promise<RecordVideoConsentResponse> {
  const callable = createCallableFunction<RecordVideoConsentRequest>('recordVideoProcessingConsent');
  if (!callable) {
    throw new Error('Cloud Functions unavailable.');
  }
  const result = await callable({
    jobId,
    acknowledgements: { processing: true, rights: true, retention: true, provider: true },
    retainSource: choices.retainSource,
    keepForRetry: choices.keepForRetry,
    evidenceClips: choices.evidenceClips,
  });
  return result.data as RecordVideoConsentResponse;
}

export async function requestRevokeVideoConsent(jobId: string): Promise<{ jobId: string; revokedAt: string }> {
  const callable = createCallableFunction<{ jobId: string }>('revokeVideoProcessingConsent');
  if (!callable) {
    throw new Error('Cloud Functions unavailable.');
  }
  const result = await callable({ jobId });
  return result.data as { jobId: string; revokedAt: string };
}

export type ConfirmIdentityRequest = {
  jobId: string;
  decision: 'confirmed' | 'rejected';
  frameIds: string[];
  expectedGeneration?: number;
  expectedAnchorRevision?: number;
};

export async function requestConfirmAnalysisIdentity(request: ConfirmIdentityRequest): Promise<{ state: string; released: boolean }> {
  const callable = createCallableFunction<ConfirmIdentityRequest>('confirmAnalysisIdentity');
  if (!callable) {
    throw new Error('Cloud Functions unavailable.');
  }
  const result = await callable(request);
  return result.data as { state: string; released: boolean };
}

export type AskThisMatchRequest = {
  jobId: string;
  question: string;
};

export type AskThisMatchResponse = {
  state: 'answered' | 'insufficient';
  answer: string;
  citations: AskThisMatchCitation[];
};

export async function requestAskThisMatch(
  jobId: string,
  question: string,
): Promise<AskThisMatchResponse> {
  const callable = createCallableFunction<AskThisMatchRequest>('askThisMatch');
  if (!callable) {
    throw new Error('Cloud Functions unavailable.');
  }
  const result = await callable({ jobId, question });
  return result.data as AskThisMatchResponse;
}
