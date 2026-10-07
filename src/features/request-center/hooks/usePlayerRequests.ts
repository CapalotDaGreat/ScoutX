import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { usePlayerTrialInvitations } from '@/features/trial-invitations/hooks/useTrialInvitations';
import { RequestCenterRepository } from '@/features/request-center/repositories/RequestCenterRepository';
import {
  buildRequestCenter,
  requestsNeedingAttention,
  type VerificationLike,
} from '@/features/request-center/services/requestCenterService';
import type { EvidenceAttachment, StoredEvidenceRequest } from '@/features/request-center/types';
import { toUserMessage } from '@/utils/userFacingError';

export function usePlayerRequests() {
  const { user, isGuest } = useAuth();
  const playerId = isGuest ? null : user?.id ?? null;
  const { trials, isLoading: trialsLoading } = usePlayerTrialInvitations();
  const [evidenceRequests, setEvidenceRequests] = useState<StoredEvidenceRequest[]>([]);
  const [verifications, setVerifications] = useState<VerificationLike[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playerId) {
      setEvidenceRequests([]);
      setIsLoading(false);
      return undefined;
    }
    setIsLoading(true);
    const repository = RequestCenterRepository.getInstance();
    const unsubscribe = repository.subscribeToEvidenceRequests(
      playerId,
      (next) => {
        setEvidenceRequests(next);
        setIsLoading(false);
      },
      (err) => {
        setError(toUserMessage(err, 'Could not load your requests.'));
        setIsLoading(false);
      },
    );
    void repository
      .listVerificationRequests(playerId)
      .then(setVerifications)
      .catch(() => setVerifications([]));
    return unsubscribe;
  }, [playerId]);

  const requests = useMemo(
    () => buildRequestCenter({ evidenceRequests, trials, verifications }),
    [evidenceRequests, trials, verifications],
  );
  const attention = useMemo(() => requestsNeedingAttention(requests), [requests]);

  const decline = useCallback(async (requestId: string) => {
    await RequestCenterRepository.getInstance().declineEvidenceRequest(requestId);
  }, []);

  const fulfill = useCallback(async (requestId: string, attachments: EvidenceAttachment[], note: string) => {
    await RequestCenterRepository.getInstance().fulfillEvidenceRequest(requestId, attachments, note);
  }, []);

  return {
    requests,
    attention,
    isLoading: isLoading || trialsLoading,
    error,
    decline,
    fulfill,
  };
}
