import { getAiConfig } from '@/config/ai';
import { type AiProvider } from '@/features/ai-insights/providers/types';
import {
  extractJsonFromModelText,
  parseAiInsightResponse,
} from '@/features/ai-insights/services/aiResponseParser';
import { type AiCompletionRequest, type AiInsightMap, type AiInsightType } from '@/features/ai-insights/types';

type OpenRouterChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

export class OpenRouterAiProvider implements AiProvider {
  readonly metadata = {
    id: 'openrouter',
    label: 'OpenRouter',
    isLive: true,
  };

  private readonly config = getAiConfig();

  isAvailable(): boolean {
    return Boolean(this.config.openRouterApiKey);
  }

  async completeStructured<T extends AiInsightType>(
    request: AiCompletionRequest,
  ): Promise<AiInsightMap[T]> {
    if (!this.config.openRouterApiKey) {
      throw new Error('OpenRouter API key is not configured.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

    try {
      const response = await fetch(`${this.config.openRouterBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://scoutx.app',
          'X-Title': 'ScoutX',
        },
        body: JSON.stringify({
          model: this.config.openRouterModel,
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
        }),
        signal: controller.signal,
      });

      const payload = (await response.json()) as OpenRouterChatResponse;

      if (!response.ok) {
        throw new Error(payload.error?.message ?? `OpenRouter request failed (${response.status}).`);
      }

      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('OpenRouter returned an empty response.');
      }

      const parsed = extractJsonFromModelText(content);
      return parseAiInsightResponse(parsed, request.insightType) as AiInsightMap[T];
    } finally {
      clearTimeout(timeout);
    }
  }
}
