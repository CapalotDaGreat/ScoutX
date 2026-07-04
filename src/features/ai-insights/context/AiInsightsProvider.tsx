import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { createAiProvider } from '@/features/ai-insights/providers/createAiProvider';
import { type AiProvider } from '@/features/ai-insights/providers/types';
import { AiInsightsService } from '@/features/ai-insights/services/aiInsightsService';

type AiInsightsContextValue = {
  service: AiInsightsService;
  provider: AiProvider;
};

const AiInsightsContext = createContext<AiInsightsContextValue | null>(null);

export type AiInsightsProviderProps = {
  children: ReactNode;
  provider?: AiProvider;
};

export function AiInsightsProvider({ children, provider }: AiInsightsProviderProps) {
  const value = useMemo(() => {
    const resolvedProvider = provider ?? createAiProvider();
    const service = AiInsightsService.configure(resolvedProvider);
    return { service, provider: resolvedProvider };
  }, [provider]);

  return (
    <AiInsightsContext.Provider value={value}>{children}</AiInsightsContext.Provider>
  );
}

export function useAiInsights(): AiInsightsContextValue {
  const context = useContext(AiInsightsContext);
  if (!context) {
    throw new Error('useAiInsights must be used within AiInsightsProvider');
  }
  return context;
}
