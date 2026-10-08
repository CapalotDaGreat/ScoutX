import { createCallableFunction } from '@/firebase/callableFunctions';

export type AdminVerificationRequest = {
  id: string;
  entityType: string;
  entityId: string;
  requesterId: string;
  requesterName: string;
  status: string;
  evidence: string;
  createdAt: string;
};

export type ModerationCasePriority = 'urgent' | 'high' | 'normal';

export type ModerationCase = {
  id: string;
  targetType: string;
  targetId: string;
  targetOwnerId: string | null;
  reasons: string[];
  reportIds: string[];
  priority: ModerationCasePriority;
  state: string;
  decision: string | null;
  decidedBy: string | null;
  createdAt: string;
  /** For reported external links: the stored link, never the page behind it. */
  targetContext?: { providerId: string; url: string } | null;
};

export type StaffAction = 'dismiss' | 'restrict' | 'hide' | 'remove' | 'warn' | 'suspend' | 'disable' | 'escalate';

export async function fetchVerificationQueue(): Promise<AdminVerificationRequest[]> {
  const callable = createCallableFunction<Record<string, never>>('listAdminReviewQueue');
  if (!callable) {
    return [];
  }
  const result = await callable({});
  const data = result.data as { verificationRequests?: AdminVerificationRequest[] };
  return data.verificationRequests ?? [];
}

export async function fetchModerationQueue(): Promise<ModerationCase[]> {
  const callable = createCallableFunction<Record<string, never>>('listModerationQueue');
  if (!callable) {
    return [];
  }
  const result = await callable({});
  const data = result.data as { cases?: ModerationCase[] };
  return data.cases ?? [];
}

function requireCallable<T>(name: string) {
  const callable = createCallableFunction<T>(name);
  if (!callable) {
    throw new Error('Moderation functions are not configured.');
  }
  return callable;
}

export async function resolveVerificationRequest(input: {
  requestId: string;
  status: 'approved' | 'rejected';
  reviewerNote: string;
}): Promise<void> {
  await requireCallable<typeof input>('resolveVerificationRequest')(input);
}

export async function applyModerationAction(input: {
  caseId: string;
  action: StaffAction;
  reason: string;
  durationDays?: number;
}): Promise<void> {
  await requireCallable<typeof input>('applyModerationAction')(input);
}

export async function resolveAppeal(input: {
  caseId: string;
  outcome: 'upheld' | 'overturned';
  reason: string;
}): Promise<void> {
  await requireCallable<typeof input>('resolveAppeal')(input);
}
