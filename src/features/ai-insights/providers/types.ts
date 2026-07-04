import {
  type AiCompletionRequest,
  type AiInsight,
  type AiInsightMap,
  type AiInsightType,
  type AiProviderMetadata,
} from '@/features/ai-insights/types';

export interface AiProvider {
  readonly metadata: AiProviderMetadata;
  completeStructured<T extends AiInsightType>(
    request: AiCompletionRequest,
  ): Promise<AiInsightMap[T]>;
  isAvailable(): boolean;
}

export type AiProviderFactory = () => AiProvider;
