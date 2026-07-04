export type AiProviderId = 'mock' | 'openrouter';

const env = process.env as Record<string, string | undefined>;

export type AiConfig = {
  providerId: AiProviderId;
  openRouterApiKey: string | null;
  openRouterModel: string;
  openRouterBaseUrl: string;
  requestTimeoutMs: number;
};

function resolveProviderId(): AiProviderId {
  const explicit = env.EXPO_PUBLIC_AI_PROVIDER;
  if (explicit === 'mock' || explicit === 'openrouter') {
    return explicit;
  }

  const apiKey = env.EXPO_PUBLIC_OPENROUTER_API_KEY?.trim();
  return apiKey ? 'openrouter' : 'mock';
}

export function getAiConfig(): AiConfig {
  const apiKey = env.EXPO_PUBLIC_OPENROUTER_API_KEY?.trim() ?? '';

  return {
    providerId: resolveProviderId(),
    openRouterApiKey: apiKey.length > 0 ? apiKey : null,
    openRouterModel: env.EXPO_PUBLIC_OPENROUTER_MODEL?.trim() || 'google/gemma-2-9b-it:free',
    openRouterBaseUrl:
      env.EXPO_PUBLIC_OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1',
    requestTimeoutMs: 45_000,
  };
}

export function isAiConfigured(): boolean {
  const config = getAiConfig();
  return config.providerId === 'openrouter' && Boolean(config.openRouterApiKey);
}
