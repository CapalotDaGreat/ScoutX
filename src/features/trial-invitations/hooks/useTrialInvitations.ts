import { useCallback, useEffect, useMemo, useState } from 'react';
import { TrialInvitationRepository } from '@/features/trial-invitations/repositories/TrialInvitationRepository';
import { getMockTrialsForPlayer, getMockTrialsForScoutPlayer } from '@/features/trial-invitations/services/mockTrialInvitations';
import {
  type TrialInvitation,
  type TrialInvitationDraft,
  type TrialNotification,
} from '@/features/trial-invitations/types';
import { useAuth } from '@/features/auth/store/AuthProvider';

export function usePlayerTrialInvitations() {
  const { user } = useAuth();
  const playerId = user?.id ?? '';
  const playerName = user?.name ?? 'Player';
  const [trials, setTrials] = useState<TrialInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const repository = useMemo(() => TrialInvitationRepository.getInstance(), []);

  useEffect(() => {
    if (!playerId) {
      setTrials([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsubscribe = repository.subscribeToPlayerTrials(
      playerId,
      (nextTrials) => {
        setTrials(nextTrials.length > 0 ? nextTrials : getMockTrialsForPlayer(playerId));
        setIsLoading(false);
      },
      (err) => {
        setError(err.message);
        setTrials(getMockTrialsForPlayer(playerId));
        setIsLoading(false);
      },
    );
    return unsubscribe;
  }, [playerId, repository]);

  const acceptTrial = useCallback(
    async (invitation: TrialInvitation, note?: string) => {
      setIsSaving(true);
      setError(null);
      try {
        return await repository.acceptInvitation(invitation, playerId, playerName, note);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to accept trial.';
        setError(message);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [playerId, playerName, repository],
  );

  const declineTrial = useCallback(
    async (invitation: TrialInvitation, note?: string) => {
      setIsSaving(true);
      setError(null);
      try {
        return await repository.declineInvitation(invitation, playerId, playerName, note);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to decline trial.';
        setError(message);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [playerId, playerName, repository],
  );

  return { trials, isLoading, isSaving, error, acceptTrial, declineTrial };
}

export function useScoutTrialInvitations(playerId: string, playerName: string) {
  const { user } = useAuth();
  const scoutId = user?.id ?? '';
  const scoutName = user?.name ?? 'Scout';
  const [trials, setTrials] = useState<TrialInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const repository = useMemo(() => TrialInvitationRepository.getInstance(), []);

  useEffect(() => {
    if (!scoutId || !playerId) {
      setTrials([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsubscribe = repository.subscribeToScoutPlayerTrials(
      scoutId,
      playerId,
      (nextTrials) => {
        setTrials(
          nextTrials.length > 0 ? nextTrials : getMockTrialsForScoutPlayer(scoutId, playerId),
        );
        setIsLoading(false);
      },
      (err) => {
        setError(err.message);
        setTrials(getMockTrialsForScoutPlayer(scoutId, playerId));
        setIsLoading(false);
      },
    );
    return unsubscribe;
  }, [playerId, repository, scoutId]);

  const createTrial = useCallback(
    async (draft: TrialInvitationDraft) => {
      setIsSaving(true);
      setError(null);
      try {
        return await repository.createInvitation(
          scoutId,
          scoutName,
          playerId,
          playerName,
          draft,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create trial.';
        setError(message);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [playerId, playerName, repository, scoutId, scoutName],
  );

  const rescheduleTrial = useCallback(
    async (invitation: TrialInvitation, draft: TrialInvitationDraft) => {
      setIsSaving(true);
      setError(null);
      try {
        return await repository.rescheduleInvitation(invitation, scoutId, scoutName, draft);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to reschedule trial.';
        setError(message);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [repository, scoutId, scoutName],
  );

  const cancelTrial = useCallback(
    async (invitation: TrialInvitation, note?: string) => {
      setIsSaving(true);
      setError(null);
      try {
        return await repository.cancelInvitation(invitation, scoutId, scoutName, note);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to cancel trial.';
        setError(message);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [repository, scoutId, scoutName],
  );

  return { trials, isLoading, isSaving, error, createTrial, rescheduleTrial, cancelTrial };
}

export function useTrialNotifications() {
  const { user } = useAuth();
  const recipientId = user?.id ?? '';
  const [notifications, setNotifications] = useState<TrialNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const repository = useMemo(() => TrialInvitationRepository.getInstance(), []);

  useEffect(() => {
    if (!recipientId) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsubscribe = repository.subscribeToNotifications(recipientId, (next) => {
      setNotifications(next);
      setIsLoading(false);
    });
    return unsubscribe;
  }, [recipientId, repository]);

  const markRead = useCallback(
    async (notificationId: string) => {
      await repository.markNotificationRead(recipientId, notificationId);
    },
    [recipientId, repository],
  );

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications],
  );

  return { notifications, unreadCount, isLoading, markRead };
}
