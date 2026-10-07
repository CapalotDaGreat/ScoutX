import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { readStaffRoleClaim, type StaffRole } from '@/features/auth/services/roleClaimService';

export function useStaffRole(): StaffRole | null {
  const { status, user, isGuest } = useAuth();
  const uid = status === 'authenticated' && !isGuest ? (user?.uid ?? null) : null;
  const [role, setRole] = useState<StaffRole | null>(null);

  useEffect(() => {
    setRole(null);
    if (!uid) return;
    let active = true;
    readStaffRoleClaim()
      .then((value) => {
        if (active) setRole(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [uid]);

  return role;
}
