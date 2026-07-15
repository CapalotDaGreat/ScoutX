import { isProductionApp } from '@/config/appMode';

export type AiProviderId = 'mock' | 'openrouter';

// Expo only inlines static process.env.EXPO_PUBLIC_* references (not env[key]).

export type AiConfig = {
  providerId: AiProviderId;
  useCloudFunction: boolean;
  openRouterApiKey: string | null;
  openRouterModel: string;
  openRouterBaseUrl: string;
  requestTimeoutMs: number;
};

function resolveUseCloudFunction(): boolean {
  if (isProductionApp()) {
    return true;
  }

  const explicit = process.env.EXPO_PUBLIC_USE_CLOUD_AI?.trim().toLowerCase();
  if (explicit === 'true') {
    return true;
  }
  if (explicit === 'false') {
    return false;
  }
  return !process.env.EXPO_PUBLIC_OPENROUTER_API_KEY?.trim();
}

function resolveProviderId(): AiProviderId {
  if (isProductionApp()) {
    return 'mock';
  }

  const explicit = process.env.EXPO_PUBLIC_AI_PROVIDER;
  if (explicit === 'mock' || explicit === 'openrouter') {
    return explicit;
  }

  const apiKey = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY?.trim();
  return apiKey ? 'openrouter' : 'mock';
}

export function getAiConfig(): AiConfig {
  const isProd = isProductionApp();
  const apiKey = isProd ? '' : process.env.EXPO_PUBLIC_OPENROUTER_API_KEY?.trim() ?? '';

  return {
    providerId: resolveProviderId(),
    useCloudFunction: resolveUseCloudFunction(),
    openRouterApiKey: apiKey.length > 0 ? apiKey : null,
    openRouterModel:
      process.env.EXPO_PUBLIC_OPENROUTER_MODEL?.trim() || 'google/gemma-2-9b-it:free',
    openRouterBaseUrl:
      process.env.EXPO_PUBLIC_OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1',
    requestTimeoutMs: 45_000,
  };
}

export function isAiConfigured(): boolean {
  const config = getAiConfig();
  if (config.useCloudFunction) {
    return true;
  }
  return config.providerId === 'openrouter' && Boolean(config.openRouterApiKey);
}
