import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { createCallableOptions } from '../callableOptions';
import { MATCH_COLLECTION } from './frameAnalysis';
import { VIDEO_CONSENT_COLLECTION } from './videoConsent';

/**
 * Player feedback on a finished analysis. The stored analysis is never edited: each correction
 * is an append-only record (actor, time, target, action, reason) in
 * matchAnalysisJobs/{jobId}/corrections. Corrections never turn into confirmed statistics, and
 * they are not used to train any model.
 */
export const CORRECTIONS_SUBCOLLECTION = 'corrections';
export const MAX_CORRECTIONS_PER_JOB = 300;

export const CORRECTION_TARGET_KINDS = ['possible_event', 'event', 'observation', 'identity_frame'] as const;
export type CorrectionTargetKind = (typeof CORRECTION_TARGET_KINDS)[number];

export const CORRECTION_ACTIONS = ['confirm', 'dispute', 'dismiss_false_event', 'is_me', 'not_me', 'withdraw'] as const;
export type CorrectionAction = (typeof CORRECTION_ACTIONS)[number];

export const CORRECTION_REASONS = ['not_me', 'did_not_happen', 'wrong_type', 'wrong_time', 'other'] as const;
export type CorrectionReason = (typeof CORRECTION_REASONS)[number];

const ALLOWED_ACTIONS: Record<CorrectionTargetKind, readonly CorrectionAction[]> = {
  possible_event: ['confirm', 'dispute', 'dismiss_false_event', 'withdraw'],
  event: ['confirm', 'dispute', 'dismiss_false_event', 'withdraw'],
  observation: ['confirm', 'dispute', 'withdraw'],
  identity_frame: ['is_me', 'not_me', 'withdraw'],
};

export type CorrectionRequest = {
  jobId: string;
  targetKind: CorrectionTargetKind;
  targetId: string;
  action: CorrectionAction;
  reason: CorrectionReason | null;
  note: string | null;
};

export type CorrectionRecord = CorrectionRequest & {
  id: string;
  actorId: string;
  createdAt: string;
  reportVersion: number | null;
  /** Always false: feedback is stored for the player's own report, never used as training data. */
  usedForTraining: false;
};

const JOB_ID = /^[A-Za-z0-9_-]{6,80}$/;
const TARGET_ID = /^[A-Za-z0-9_.:-]{1,80}$/;

const oneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (values as readonly string[]).includes(value);

export function parseCorrectionRequest(data: unknown): CorrectionRequest | null {
  if (!data || typeof data !== 'object') return null;
  const input = data as Record<string, unknown>;
  if (typeof input.jobId !== 'string' || !JOB_ID.test(input.jobId)) return null;
  if (!oneOf(CORRECTION_TARGET_KINDS, input.targetKind)) return null;
  if (typeof input.targetId !== 'string' || !TARGET_ID.test(input.targetId)) return null;
  if (!oneOf(CORRECTION_ACTIONS, input.action) || !ALLOWED_ACTIONS[input.targetKind].includes(input.action)) return null;
  const reason = input.reason == null ? null : oneOf(CORRECTION_REASONS, input.reason) ? input.reason : undefined;
  if (reason === undefined) return null;
  const note = typeof input.note === 'string' ? input.note.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 280) || null : null;
  return { jobId: input.jobId, targetKind: input.targetKind, targetId: input.targetId, action: input.action, reason, note };
}

type ReportShape = {
  possibleEvents?: Array<{ id?: unknown }>;
  events?: Array<{ eventId?: unknown }>;
  evidence?: Array<{ id?: unknown }>;
};

/** A correction must point at something the player was actually shown in this analysis. */
export function correctionTargetExists(
  report: ReportShape | null | undefined,
  frames: Array<{ id?: unknown; index?: unknown }> | undefined,
  kind: CorrectionTargetKind,
  id: string,
): boolean {
  switch (kind) {
    case 'possible_event':
      return (report?.possibleEvents ?? []).some((item) => item.id === id);
    case 'event':
      return (report?.events ?? []).some((item) => item.eventId === id);
    case 'observation':
      return (report?.evidence ?? []).some((item) => item.id === id);
    case 'identity_frame':
      return (frames ?? []).some((frame) => (frame.id ?? `frame_${String(frame.index)}`) === id);
  }
}

export const correctionTargetKey = (kind: CorrectionTargetKind, id: string) => `${kind}:${id}`;

/** Latest non-withdrawn correction per target, by creation time then id. */
export function latestCorrections<T extends Pick<CorrectionRecord, 'targetKind' | 'targetId' | 'action' | 'createdAt' | 'id'>>(
  records: T[],
): Map<string, T> {
  const sorted = [...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const latest = new Map<string, T>();
  for (const record of sorted) {
    const key = correctionTargetKey(record.targetKind, record.targetId);
    if (record.action === 'withdraw') latest.delete(key);
    else latest.set(key, record);
  }
  return latest;
}

export async function submitCorrection(
  db: Firestore,
  uid: string,
  request: CorrectionRequest,
  now: Date = new Date(),
): Promise<{ correctionId: string; deduplicated: boolean }> {
  const jobRef = db.collection(MATCH_COLLECTION).doc(request.jobId);
  const job = await jobRef.get();
  if (!job.exists || job.get('playerId') !== uid) throw new HttpsError('not-found', 'Match analysis job not found.');
  if (job.get('status') !== 'complete' || !job.get('report')) {
    throw new HttpsError('failed-precondition', 'Feedback is possible once the analysis is complete.', { reason: 'not_complete' });
  }
  const consent = await db.collection(VIDEO_CONSENT_COLLECTION).doc(request.jobId).get();
  if (consent.exists && (consent.get('uid') !== uid || consent.get('revokedAt') != null)) {
    throw new HttpsError('failed-precondition', 'Consent for this analysis was withdrawn.', { reason: 'consent_withdrawn' });
  }
  if (!correctionTargetExists(job.get('report') as ReportShape, job.get('frames'), request.targetKind, request.targetId)) {
    throw new HttpsError('invalid-argument', 'This item is not part of the analysis.', { reason: 'unknown_target' });
  }

  const corrections = jobRef.collection(CORRECTIONS_SUBCOLLECTION);
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(corrections.orderBy('createdAt', 'desc').limit(MAX_CORRECTIONS_PER_JOB));
    const records = existing.docs.map((doc) => ({ ...(doc.data() as CorrectionRecord), id: doc.id }));
    const key = correctionTargetKey(request.targetKind, request.targetId);
    const current = latestCorrections(records).get(key) ?? null;
    if (request.action === 'withdraw' ? current === null : current?.action === request.action && current.reason === request.reason) {
      const last = records.find((record) => correctionTargetKey(record.targetKind, record.targetId) === key);
      return { correctionId: last?.id ?? '', deduplicated: true };
    }
    if (existing.size >= MAX_CORRECTIONS_PER_JOB) {
      throw new HttpsError('resource-exhausted', 'Too much feedback on this analysis.', { reason: 'limit_reached' });
    }
    const ref = corrections.doc();
    const versions = job.get('report.versions') as { analysisVersion?: unknown } | undefined;
    const record: CorrectionRecord = {
      ...request,
      id: ref.id,
      actorId: uid,
      createdAt: now.toISOString(),
      reportVersion: typeof versions?.analysisVersion === 'number' ? versions.analysisVersion : null,
      usedForTraining: false,
    };
    tx.create(ref, record);
    return { correctionId: ref.id, deduplicated: false };
  });
}

export const submitAnalysisCorrection = onCall(createCallableOptions(), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const parsed = parseCorrectionRequest(request.data);
  if (!parsed) throw new HttpsError('invalid-argument', 'Invalid feedback.');
  return submitCorrection(getFirestore(), uid, parsed);
});
