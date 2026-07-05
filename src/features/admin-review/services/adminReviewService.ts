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

export type AdminContentReport = {
  id: string;
  reporterId: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string;
  createdAt: string;
  reviewed?: boolean;
};

export type AdminReviewQueue = {
  verificationRequests: AdminVerificationRequest[];
  contentReports: AdminContentReport[];
};

export async function fetchAdminReviewQueue(): Promise<AdminReviewQueue> {
  const callable = createCallableFunction<Record<string, never>>('listAdminReviewQueue');
  if (!callable) {
    return { verificationRequests: [], contentReports: [] };
  }

  const result = await callable({});
  return result.data as AdminReviewQueue;
}

export async function resolveVerificationRequest(input: {
  requestId: string;
  status: 'approved' | 'rejected';
  reviewerNote?: string;
}): Promise<void> {
  const callable = createCallableFunction<typeof input>('resolveVerificationRequest');
  if (!callable) {
    throw new Error('Admin review functions are not configured.');
  }
  await callable(input);
}

export async function archiveContentReport(input: {
  reportId: string;
  reviewerNote?: string;
}): Promise<void> {
  const callable = createCallableFunction<typeof input>('archiveContentReport');
  if (!callable) {
    throw new Error('Admin review functions are not configured.');
  }
  await callable(input);
}
