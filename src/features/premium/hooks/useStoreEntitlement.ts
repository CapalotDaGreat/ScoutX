import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { NO_STORE_ENTITLEMENT, type StoreEntitlement } from '@/features/premium/services/purchaseModel';
import {
  getStoreEntitlement,
  isPurchasingAvailable,
  subscribeStoreEntitlement,
} from '@/features/premium/services/purchasesService';

export type UseStoreEntitlementResult = {
  /** What the App Store reports for `pitchproven`. For display; the server decides access. */
  entitlement: StoreEntitlement;
  loading: boolean;
  error: unknown;
  refresh: () => Promise<void>;
};

export function useStoreEntitlement(): UseStoreEntitlementResult {
  const { user, isGuest } = useAuth();
  const uid = user && !isGuest && isPurchasingAvailable() ? user.uid : null;
  const [entitlement, setEntitlement] = useState<StoreEntitlement>(NO_STORE_ENTITLEMENT);
  const [loading, setLoading] = useState(uid !== null);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      setEntitlement(await getStoreEntitlement(uid));
      setError(null);
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setEntitlement(NO_STORE_ENTITLEMENT);
      setLoading(false);
      return undefined;
    }
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    void refresh();
    subscribeStoreEntitlement(uid, setEntitlement)
      .then((stop) => {
        if (cancelled) stop();
        else unsubscribe = stop;
      })
      .catch(setError);
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [uid, refresh]);

  return { entitlement, loading, error, refresh };
}
