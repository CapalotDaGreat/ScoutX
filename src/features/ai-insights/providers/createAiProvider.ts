import { getAiConfig } from '@/config/ai';
import { isProductionApp } from '@/config/appMode';
import { CloudFunctionAiProvider } from '@/features/ai-insights/providers/cloudFunctionAiProvider';
import { MockAiProvider } from '@/features/ai-insights/providers/mockAiProvider';
import { OpenRouterAiProvider } from '@/features/ai-insights/providers/openRouterProvider';
import { type AiProvider } from '@/features/ai-insights/providers/types';

export function createAiProvider(): AiProvider {
  const config = getAiConfig();

  if (config.useCloudFunction) {
    const cloudProvider = new CloudFunctionAiProvider();
    if (cloudProvider.isAvailable()) {
      return cloudProvider;
    }
  }

  if (isProductionApp()) {
    return new MockAiProvider();
  }

  if (config.providerId === 'openrouter') {
    const openRouter = new OpenRouterAiProvider();
    if (openRouter.isAvailable()) {
      return openRouter;
    }
  }

  return new MockAiProvider();
}
