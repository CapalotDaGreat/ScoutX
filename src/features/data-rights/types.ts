/** Mirrors functions/src/dataRights/deletion.ts. */
export const DELETION_STEPS = [
  'requested',
  'access_revoked',
  'jobs_cancelled',
  'primary_deleted',
  'media_deleted',
  'derived_deleted',
  'verified',
  'completed',
] as const;
export type DeletionStep = (typeof DELETION_STEPS)[number];

export type DeletionProgress = { step: DeletionStep; status: 'in_progress' | 'failed' };

export const EXPORT_STATUSES = ['queued', 'building', 'ready', 'failed', 'expired'] as const;
export type ExportStatus = (typeof EXPORT_STATUSES)[number];

export type DataExportJob = {
  id: string;
  status: ExportStatus;
  requestedAt: string;
  expiresAt: string | null;
  downloadUrl: string | null;
  storagePath: string | null;
  sizeBytes: number | null;
};

/** Mirrors functions/src/dataRights/privacyRequests.ts. */
export const PRIVACY_REQUEST_TYPES = ['access', 'correction', 'deletion', 'portability', 'objection', 'withdrawal'] as const;
export type PrivacyRequestType = (typeof PRIVACY_REQUEST_TYPES)[number];

export const PRIVACY_REQUEST_STATUSES = ['received', 'in_progress', 'completed', 'rejected'] as const;
export type PrivacyRequestStatus = (typeof PRIVACY_REQUEST_STATUSES)[number];

export type PrivacyRequest = {
  id: string;
  type: PrivacyRequestType;
  status: PrivacyRequestStatus;
  createdAt: string;
  deadlineAt: string;
  resolution: string | null;
};

function oneOf<T extends string>(list: readonly T[], value: unknown): T | null {
  return typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

export function parseDeletionProgress(data: Record<string, unknown> | undefined): DeletionProgress | null {
  const step = oneOf(DELETION_STEPS, data?.step);
  if (!step) return null;
  return { step, status: data?.status === 'failed' ? 'failed' : 'in_progress' };
}

/** 0..1 share of the deletion steps that are finished. */
export function deletionFraction(step: DeletionStep): number {
  return DELETION_STEPS.indexOf(step) / (DELETION_STEPS.length - 1);
}

export function parseExportJob(id: string, data: Record<string, unknown> | undefined): DataExportJob | null {
  const status = oneOf(EXPORT_STATUSES, data?.status);
  const requestedAt = str(data?.requestedAt);
  if (!status || !requestedAt) return null;
  return {
    id,
    status,
    requestedAt,
    expiresAt: str(data?.expiresAt),
    downloadUrl: str(data?.downloadUrl),
    storagePath: str(data?.storagePath),
    sizeBytes: typeof data?.sizeBytes === 'number' ? data.sizeBytes : null,
  };
}

export function parsePrivacyRequest(id: string, data: Record<string, unknown> | undefined): PrivacyRequest | null {
  const type = oneOf(PRIVACY_REQUEST_TYPES, data?.type);
  const status = oneOf(PRIVACY_REQUEST_STATUSES, data?.status);
  const createdAt = str(data?.createdAt);
  const deadlineAt = str(data?.deadlineAt);
  if (!type || !status || !createdAt || !deadlineAt) return null;
  return { id, type, status, createdAt, deadlineAt, resolution: str(data?.resolution) };
}

export function reasonOf(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('details' in error)) return null;
  const details = (error as { details: unknown }).details;
  return details && typeof details === 'object' && typeof (details as { reason?: unknown }).reason === 'string'
    ? (details as { reason: string }).reason
    : null;
}
