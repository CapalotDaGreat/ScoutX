import { createCallableFunction } from '@/firebase/callableFunctions';
import { isFirebaseConfiguredForProject } from '@/config/firebase';
import { type AiProvider } from '@/features/ai-insights/providers/types';
import { parseAiInsightResponse } from '@/features/ai-insights/services/aiResponseParser';
import { type AiCompletionRequest, type AiInsightMap, type AiInsightType } from '@/features/ai-insights/types';

type GenerateAiInsightResponse = {
  insightType: string;
  payload: Record<string, unknown>;
  generatedAt: string;
};

export class CloudFunctionAiProvider implements AiProvider {
  readonly metadata = {
    id: 'cloud-function',
    label: 'ScoutX AI Coach',
    isLive: true,
  };

  isAvailable(): boolean {
    return isFirebaseConfiguredForProject();
  }

  async completeStructured<T extends AiInsightType>(
    request: AiCompletionRequest,
  ): Promise<AiInsightMap[T]> {
    const callable = createCallableFunction<{
      insightType: string;
      systemPrompt: string;
      userPrompt: string;
      contextJson: string;
    }>('generateAiInsight');

    if (!callable) {
      throw new Error('Cloud Functions are not configured.');
    }

    const result = await callable({
      insightType: request.insightType,
      systemPrompt: request.systemPrompt,
      userPrompt: request.userPrompt,
      contextJson: request.contextJson,
    });

    const data = result.data as GenerateAiInsightResponse;
    if (!data?.payload) {
      throw new Error('Cloud AI function returned an empty payload.');
    }

    return parseAiInsightResponse(data.payload, request.insightType) as AiInsightMap[T];
  }
}
