import { createAiProvider } from '@/features/ai-insights/providers/createAiProvider';
import { type AiProvider } from '@/features/ai-insights/providers/types';
import { serializeInsightContext } from '@/features/ai-insights/services/aiContextService';
import {
  type AiCompletionRequest,
  type AiInsightContext,
  type AiInsightMap,
  type AiInsightType,
} from '@/features/ai-insights/types';

export class AiInsightsService {
  private static instance: AiInsightsService | null = null;

  private constructor(private readonly provider: AiProvider) {}

  public static getInstance(provider?: AiProvider): AiInsightsService {
    if (!this.instance) {
      this.instance = new AiInsightsService(provider ?? createAiProvider());
    }
    return this.instance;
  }

  public static configure(provider: AiProvider): AiInsightsService {
    this.instance = new AiInsightsService(provider);
    return this.instance;
  }

  get providerMetadata() {
    return this.provider.metadata;
  }

  isLiveProvider(): boolean {
    return this.provider.metadata.isLive && this.provider.isAvailable();
  }

  async generateInsight<T extends AiInsightType>(
    insightType: T,
    context: AiInsightContext,
  ): Promise<AiInsightMap[T]> {
    const contextJson = serializeInsightContext(context);
    const request: AiCompletionRequest = {
      insightType,
      contextJson,
    };

    return this.provider.completeStructured(request);
  }
}
