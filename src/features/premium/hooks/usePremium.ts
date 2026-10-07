import { useCallback, useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { fetchUsageSummary } from '@/features/premium/services/usageService';
import type { UsageSummary } from '@/features/premium/types';

export type UsePremiumResult = {
  summary: UsageSummary | null;
  loading: boolean;
  error: unknown;
  refresh: () => Promise<void>;
};

/** Loads the server's usage summary and refreshes it whenever the server entitlement changes. */
export function usePremium(): UsePremiumResult {
  const { user, isGuest } = useAuth();
  const uid = user && !isGuest ? user.uid : null;
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(uid !== null);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      setSummary(await fetchUsageSummary());
      setError(null);
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setSummary(null);
      setLoading(false);
      return undefined;
    }
    const db = getFirestoreDb();
    if (!db) {
      void refresh();
      return undefined;
    }
    // The first snapshot also triggers the initial load.
    return onSnapshot(
      doc(db, 'entitlements', uid),
      () => void refresh(),
      () => void refresh(),
    );
  }, [uid, refresh]);

  return { summary, loading, error, refresh };
}
