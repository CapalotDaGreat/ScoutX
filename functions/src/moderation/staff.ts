import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { createCallableOptions } from '../callableOptions';
import { isRecentAuth, validReason, type StaffRole } from './model';

export const adminUserIdsSecret = defineSecret('ADMIN_USER_IDS');

export function parseAdminUserIds(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(raw.split(',').map((item) => item.trim()).filter(Boolean));
}

export function staffRoleOf(token: Record<string, unknown> | undefined): StaffRole | null {
  const role = token?.staffRole;
  return role === 'moderator' || role === 'admin' ? role : null;
}

type StaffAuth = { uid: string; role: StaffRole };

/**
 * Staff access comes from the `staffRole` custom claim. Moderators handle reports; admin-only
 * and destructive operations additionally need `minimum: 'admin'` / `recentAuth`.
 */
export function assertStaff(
  request: CallableRequest<unknown>,
  minimum: StaffRole,
  options: { recentAuth?: boolean } = {},
): StaffAuth {
  const uid = request.auth?.uid;
  const role = staffRoleOf(request.auth?.token as Record<string, unknown> | undefined);
  if (!uid || !role || (minimum === 'admin' && role !== 'admin')) {
    throw new HttpsError('permission-denied', 'Staff access required.');
  }
  if (options.recentAuth && !isRecentAuth(request.auth?.token.auth_time)) {
    throw new HttpsError('failed-precondition', 'Sign in again to confirm this action.');
  }
  return { uid, role };
}

export type AuditEntry = {
  actorId: string;
  actorRole: StaffRole | 'system' | 'bootstrap';
  action: string;
  targetType: string;
  targetId: string;
  previousState: unknown;
  newState: unknown;
  reason: string;
  caseId?: string | null;
};

/** Append-only; clients can neither read nor write adminAuditLog. */
export async function writeAuditLog(db: Firestore, entry: AuditEntry): Promise<void> {
  await db.collection('adminAuditLog').add({
    ...entry,
    previousState: entry.previousState ?? null,
    newState: entry.newState ?? null,
    caseId: entry.caseId ?? null,
    at: new Date().toISOString(),
    createdAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Grants or revokes a staff role. Only accounts listed in the ADMIN_USER_IDS secret may call
 * it, so staff access always traces back to an operator-controlled allowlist.
 */
export const setStaffRole = onCall(
  createCallableOptions({ secrets: [adminUserIdsSecret] }),
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid || !parseAdminUserIds(adminUserIdsSecret.value()).has(uid)) {
      throw new HttpsError('permission-denied', 'Operator access required.');
    }
    if (!isRecentAuth(request.auth?.token.auth_time)) {
      throw new HttpsError('failed-precondition', 'Sign in again to confirm this action.');
    }
    const data = (request.data ?? {}) as { targetUid?: unknown; staffRole?: unknown; reason?: unknown };
    const targetUid = typeof data.targetUid === 'string' ? data.targetUid : '';
    const staffRole = data.staffRole === 'moderator' || data.staffRole === 'admin' ? data.staffRole : null;
    if (!targetUid || (data.staffRole !== null && staffRole === null)) {
      throw new HttpsError('invalid-argument', 'targetUid and staffRole (moderator, admin or null) are required.');
    }
    if (!validReason(data.reason)) {
      throw new HttpsError('invalid-argument', 'A reason of at least 5 characters is required.');
    }
    const auth = getAuth();
    const user = await auth.getUser(targetUid);
    const claims = { ...(user.customClaims ?? {}) };
    const previous = staffRoleOf(claims);
    if (staffRole) claims.staffRole = staffRole;
    else delete claims.staffRole;
    await auth.setCustomUserClaims(targetUid, claims);
    await auth.revokeRefreshTokens(targetUid);
    await writeAuditLog(getFirestore(), {
      actorId: uid,
      actorRole: 'bootstrap',
      action: 'set_staff_role',
      targetType: 'user',
      targetId: targetUid,
      previousState: previous,
      newState: staffRole,
      reason: data.reason,
    });
    return { targetUid, staffRole };
  },
);
