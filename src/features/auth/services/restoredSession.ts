type AuthRole = 'guest' | 'player' | 'scout' | 'coach' | 'club';

const ASSIGNED_ROLES = new Set<AuthRole>(['player', 'scout', 'coach', 'club']);

export type ProfileRead =
  | { status: 'found'; role: AuthRole | undefined }
  | { status: 'missing' }
  | { status: 'unreadable' };

export type RestoredSessionDecision =
  | { action: 'emit'; role: AuthRole | undefined; pendingRoleSelection: boolean }
  | { action: 'hold-offline' };

/** A profile read that failed because the device could not reach Firestore. Never a guess about the account. */
export function isUnreadableProfileError(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code: unknown }).code === 'string'
    ? (error as { code: string }).code.toLowerCase()
    : '';
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return code === 'unavailable'
    || code.endsWith('/unavailable')
    || code === 'deadline-exceeded'
    || message.includes('offline')
    || message.includes('network')
    || message.includes('unavailable');
}

/**
 * A restored sign-in whose profile cannot be read is not a new account. Sending that person to role
 * selection would let them overwrite a role the server already has (B-25).
 */
export function decideRestoredSession(input: {
  anonymous: boolean;
  claimRole: AuthRole | undefined;
  read: ProfileRead;
}): RestoredSessionDecision {
  if (input.anonymous) {
    return { action: 'emit', role: 'guest', pendingRoleSelection: false };
  }
  if (input.read.status === 'found') {
    const role = input.read.role;
    const assigned = role !== undefined && ASSIGNED_ROLES.has(role);
    return {
      action: 'emit',
      role,
      pendingRoleSelection: role !== 'guest' && !assigned,
    };
  }
  if (input.claimRole && ASSIGNED_ROLES.has(input.claimRole)) {
    return { action: 'emit', role: input.claimRole, pendingRoleSelection: false };
  }
  if (input.read.status === 'unreadable') {
    return { action: 'hold-offline' };
  }
  return { action: 'emit', role: undefined, pendingRoleSelection: true };
}
