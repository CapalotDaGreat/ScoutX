import { createCallableFunction } from '@/firebase/callableFunctions';

export type AnalyzeMatchFootageRequest = {
  jobId: string;
};

export type AnalyzeMatchFootageResponse = {
  jobId: string;
  status: 'complete' | 'failed' | 'processing';
  error?: string;
};

export async function requestMatchFootageAnalysis(
  jobId: string,
): Promise<AnalyzeMatchFootageResponse> {
  const callable = createCallableFunction<AnalyzeMatchFootageRequest>('analyzeMatchFootage');
  if (!callable) {
    throw new Error('Cloud Functions unavailable.');
  }

  const result = await callable({ jobId });
  return result.data as AnalyzeMatchFootageResponse;
}
