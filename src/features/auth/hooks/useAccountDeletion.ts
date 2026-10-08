import { useCallback, useState } from 'react';
import { AccountDeletionError, deleteCurrentAccount } from '@/features/auth/services/accountService';
import {
  classifyReauthError,
  currentReauthMethods,
  reauthenticate,
  type ReauthFailure,
  type ReauthMethod,
} from '@/features/auth/services/reauthService';

export type AccountDeletionPhase = 'idle' | 'deleting' | 'reauth' | 'reauthenticating';
export type AccountDeletionUiError = 'failed' | Exclude<ReauthFailure, 'cancelled'>;

/**
 * Request → server recent-sign-in check → (sign in again if asked) → server deletion and
 * verification → signed out. Nothing is deleted on the device unless the server confirms.
 */
export function useAccountDeletion(uid: string | null | undefined) {
  const [phase, setPhase] = useState<AccountDeletionPhase>('idle');
  const [error, setError] = useState<AccountDeletionUiError | null>(null);

  const run = useCallback(async () => {
    if (!uid) return;
    setPhase('deleting');
    setError(null);
    try {
      await deleteCurrentAccount(uid);
      setPhase('idle');
    } catch (err) {
      if (err instanceof AccountDeletionError && err.kind === 'recent_login_required') {
        setPhase('reauth');
        return;
      }
      setError('failed');
      setPhase('idle');
    }
  }, [uid]);

  const confirmReauth = useCallback(
    async (method: ReauthMethod, password?: string) => {
      setPhase('reauthenticating');
      setError(null);
      try {
        await reauthenticate(method, password);
      } catch (err) {
        const kind = classifyReauthError(err);
        setError(kind === 'cancelled' ? null : kind);
        setPhase('reauth');
        return;
      }
      await run();
    },
    [run],
  );

  const cancelReauth = useCallback(() => {
    setPhase('idle');
    setError(null);
  }, []);

  return {
    phase,
    error,
    busy: phase === 'deleting' || phase === 'reauthenticating',
    methods: phase === 'reauth' || phase === 'reauthenticating' ? currentReauthMethods() : [],
    run,
    confirmReauth,
    cancelReauth,
  };
}
