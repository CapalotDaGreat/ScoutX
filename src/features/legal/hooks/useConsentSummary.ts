import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { type ConsentSummary } from '@/features/legal/consentModel';
import { ConsentRepository } from '@/features/legal/repositories/ConsentRepository';

/** `undefined` while loading, or for guests (who have nothing to record). */
export function useConsentSummary(): ConsentSummary | undefined {
  const { status, user, isGuest } = useAuth();
  const uid = status === 'authenticated' && !isGuest ? (user?.uid ?? null) : null;
  const [summary, setSummary] = useState<{ uid: string; value: ConsentSummary } | null>(null);

  useEffect(() => {
    if (!uid) return undefined;
    return ConsentRepository.subscribe(
      uid,
      (value) => setSummary({ uid, value }),
      () => setSummary({ uid, value: {} }),
    );
  }, [uid]);

  return uid && summary?.uid === uid ? summary.value : undefined;
}
