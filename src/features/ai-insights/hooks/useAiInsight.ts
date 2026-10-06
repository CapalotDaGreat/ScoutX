import { useCallback, useEffect, useRef, useState } from 'react';
import { useAiInsights } from '@/features/ai-insights/context/AiInsightsProvider';
import {
  type AiInsightContext,
  type AiInsightMap,
  type AiInsightType,
} from '@/features/ai-insights/types';
import { toUserMessage } from '@/utils/userFacingError';

export type UseAiInsightOptions = {
  enabled?: boolean;
  autoGenerate?: boolean;
};

export type UseAiInsightResult<T extends AiInsightType> = {
  insight: AiInsightMap[T] | null;
  isLoading: boolean;
  error: string | null;
  isLive: boolean;
  providerLabel: string;
  regenerate: () => Promise<void>;
};

export function useAiInsight<T extends AiInsightType>(
  insightType: T,
  context: AiInsightContext | null,
  options: UseAiInsightOptions = {},
): UseAiInsightResult<T> {
  const { enabled = true, autoGenerate = true } = options;
  const { service, provider } = useAiInsights();
  const [insight, setInsight] = useState<AiInsightMap[T] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const regenerate = useCallback(async () => {
    if (!context || !enabled) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);
    setError(null);

    try {
      const result = await service.generateInsight(insightType, context);
      if (requestIdRef.current === requestId) {
        setInsight(result);
      }
    } catch (err) {
      if (requestIdRef.current === requestId) {
        const message = toUserMessage(err, 'Failed to generate AI insight.');
        setError(message);
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [context, enabled, insightType, service]);

  useEffect(() => {
    if (!autoGenerate || !enabled || !context) {
      return;
    }
    void regenerate();
  }, [autoGenerate, context, enabled, regenerate]);

  return {
    insight,
    isLoading,
    error,
    isLive: service.isLiveProvider(),
    providerLabel: provider.metadata.label,
    regenerate,
  };
}
