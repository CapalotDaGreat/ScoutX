import { createCallableFunction } from '@/firebase/callableFunctions';
import { parseUsageSummary, type UsageSummary } from '@/features/premium/types';

export async function fetchUsageSummary(): Promise<UsageSummary> {
  const callable = createCallableFunction<Record<string, never>>('getUsageSummary');
  if (!callable) throw new Error('PitchProof needs a connection to the server to show your plan.');
  const result = await callable({});
  const summary = parseUsageSummary(result.data);
  if (!summary) throw new Error('Your plan could not be loaded. Please try again.');
  return summary;
}
