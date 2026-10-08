import { useEffect } from 'react';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { identifyPurchaser, isPurchasingAvailable } from '@/features/premium/services/purchasesService';

/** Keeps the RevenueCat App User ID equal to the signed-in Firebase uid (logOut on sign-out). */
export function PurchasesIdentitySync() {
  const { user, isGuest } = useAuth();
  const uid = user && !isGuest ? user.uid : null;

  useEffect(() => {
    if (!isPurchasingAvailable()) return;
    identifyPurchaser(uid).catch(() => {
      // Purchases stay unavailable until the next attempt; the plan screen shows the error.
    });
  }, [uid]);

  return null;
}
