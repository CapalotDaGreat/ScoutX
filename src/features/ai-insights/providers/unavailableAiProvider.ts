import { type AiProvider } from '@/features/ai-insights/providers/types';
import { type AiInsightMap, type AiInsightType } from '@/features/ai-insights/types';

/** Used in production when the AI backend is unreachable: fails honestly instead of faking insights. */
export class UnavailableAiProvider implements AiProvider {
  readonly metadata = {
    id: 'unavailable',
    label: 'PitchProof AI Coach',
    isLive: false,
  };

  isAvailable(): boolean {
    return false;
  }

  async completeStructured<T extends AiInsightType>(): Promise<AiInsightMap[T]> {
    throw new Error('AI insights are unavailable right now. Please try again later.');
  }
}
