import { useCallback, useEffect, useState } from 'react';
import {
  recordAnonymousSession,
  shouldShowAccountUpgradePrompt,
  snoozeAccountUpgradePrompt,
} from '@/features/auth/services/anonymousUsageService';
import { useAuth } from '@/features/auth/store/AuthProvider';

export function useAccountUpgradePrompt() {
  const { isGuest, user } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const uid = user?.uid;
    if (!isGuest || !uid || !user?.isAnonymous) {
      setVisible(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      await recordAnonymousSession(uid);
      const shouldShow = await shouldShowAccountUpgradePrompt(uid);
      if (!cancelled) {
        setVisible(shouldShow);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isGuest, user?.isAnonymous, user?.uid]);

  const dismiss = useCallback(async () => {
    if (user?.uid) {
      await snoozeAccountUpgradePrompt(user.uid);
    }
    setVisible(false);
  }, [user?.uid]);

  return {
    visible,
    dismiss,
  };
}
