import { isProductionApp } from '@/config/appMode';

// Expo only inlines static process.env.EXPO_PUBLIC_* references (not env[key]).

/**
 * AI always runs through Cloud Functions, which hold the OpenRouter secret, enforce consent,
 * zero-data-retention routing and output validation. There is no direct client model path.
 */
export type AiConfig = {
  useCloudFunction: boolean;
  requestTimeoutMs: number;
};

function resolveUseCloudFunction(): boolean {
  if (isProductionApp()) {
    return true;
  }
  return process.env.EXPO_PUBLIC_USE_CLOUD_AI?.trim().toLowerCase() !== 'false';
}

export function getAiConfig(): AiConfig {
  return {
    useCloudFunction: resolveUseCloudFunction(),
    requestTimeoutMs: 45_000,
  };
}

export function isAiConfigured(): boolean {
  return getAiConfig().useCloudFunction;
}
