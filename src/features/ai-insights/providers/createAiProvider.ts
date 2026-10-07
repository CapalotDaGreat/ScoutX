import { getAiConfig } from '@/config/ai';
import { isProductionApp, useMockData } from '@/config/appMode';
import { CloudFunctionAiProvider } from '@/features/ai-insights/providers/cloudFunctionAiProvider';
import { MockAiProvider } from '@/features/ai-insights/providers/mockAiProvider';
import { type AiProvider } from '@/features/ai-insights/providers/types';
import { UnavailableAiProvider } from '@/features/ai-insights/providers/unavailableAiProvider';

export function createAiProvider(): AiProvider {
  const config = getAiConfig();

  if (config.useCloudFunction) {
    const cloudProvider = new CloudFunctionAiProvider();
    if (cloudProvider.isAvailable()) {
      return cloudProvider;
    }
  }

  if (isProductionApp()) {
    return new UnavailableAiProvider();
  }

  return useMockData() ? new MockAiProvider() : new UnavailableAiProvider();
}
