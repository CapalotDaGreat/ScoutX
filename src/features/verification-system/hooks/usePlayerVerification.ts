import { useCallback, useEffect, useState } from 'react';
import {
  fetchPlayerVerificationState,
  submitPlayerVerificationRequest,
} from '@/features/verification-system/services/verificationService';
import { type EntityVerificationState } from '@/features/verification-system/types';

export type UsePlayerVerificationResult = {
  state: EntityVerificationState | null;
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  canRequest: boolean;
  requestVerification: (evidence?: string) => Promise<void>;
  reload: () => Promise<void>;
};

const DEFAULT_EVIDENCE =
  'Player requested Football Passport verification via ScoutX.';

export function usePlayerVerification(playerId: string | undefined): UsePlayerVerificationResult {
  const [state, setState] = useState<EntityVerificationState | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(playerId));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!playerId) {
      setState(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const next = await fetchPlayerVerificationState(playerId);
      setState(next);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load verification status.');
    } finally {
      setIsLoading(false);
    }
  }, [playerId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const canRequest = Boolean(playerId) && state?.level === 'none';

  const requestVerification = useCallback(
    async (evidence = DEFAULT_EVIDENCE) => {
      if (!playerId || !canRequest) {
        return;
      }

      setIsSubmitting(true);
      setError(null);

      try {
        await submitPlayerVerificationRequest(playerId, 'Player', evidence);
        await reload();
      } catch (submitError) {
        setError(
          submitError instanceof Error ? submitError.message : 'Unable to submit verification request.',
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [canRequest, playerId, reload],
  );

  return {
    state,
    isLoading,
    isSubmitting,
    error,
    canRequest,
    requestVerification,
    reload,
  };
}
