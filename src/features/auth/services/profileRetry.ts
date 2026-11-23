import type { AuthUser } from '@/features/auth/types';

type ProfileResult = { user: AuthUser; profileOffline: boolean };

/** A listener update or newer retry supersedes every pending profile request. */
export function createProfileRetry(
  currentUid: () => string | null,
  apply: (result: ProfileResult) => void,
) {
  let revision = 0;
  return {
    invalidate() { revision += 1; },
    async retry(read: () => Promise<ProfileResult | null>) {
      const uid = currentUid();
      const request = ++revision;
      if (!uid) return;
      const next = await read();
      if (request !== revision || !next || next.user.uid !== uid || currentUid() !== uid) return;
      apply(next);
    },
  };
}
