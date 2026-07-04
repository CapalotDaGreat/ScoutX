import { getAiConfig } from '@/config/ai';
import { MockAiProvider } from '@/features/ai-insights/providers/mockAiProvider';
import { OpenRouterAiProvider } from '@/features/ai-insights/providers/openRouterProvider';
import { type AiProvider } from '@/features/ai-insights/providers/types';

export function createAiProvider(): AiProvider {
  const config = getAiConfig();

  if (config.providerId === 'openrouter') {
    const openRouter = new OpenRouterAiProvider();
    if (openRouter.isAvailable()) {
      return openRouter;
    }
  }

  return new MockAiProvider();
}
