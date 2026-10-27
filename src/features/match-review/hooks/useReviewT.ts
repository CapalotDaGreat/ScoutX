import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type ReviewT = (key: string, options?: Record<string, unknown>) => string;

/**
 * Translator for keys composed from validated unions (coach topic x kind, drill ids, answer
 * keys). The compile-time key check cannot follow template keys, so tests/unit/matchReviewKeys
 * asserts that every key these services can produce exists in the English locale.
 */
export function useReviewT(): ReviewT {
  const { t } = useAppTranslation('matchAnalysis');
  return t as unknown as ReviewT;
}
