import { createCallableFunction } from '@/firebase/callableFunctions';
import type { AskThisMatchCitation } from '@/features/match-analysis/services/askThisMatchService';

export type AnalyzeMatchFootageRequest = {
  jobId: string;
  idempotencyKey?: string;
};

export type AnalyzeMatchFootageResponse = {
  jobId: string;
  status: 'complete' | 'failed' | 'processing';
  error?: string;
};

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
