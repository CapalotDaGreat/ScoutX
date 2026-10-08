import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { createCallableOptions } from '../callableOptions';
import { MATCH_COLLECTION, isGoalkeeperJob, type MatchJobDoc, type PendingCoaching } from './frameAnalysis';
import { buildSections, type ReportSection } from './reportSections';

export const MAX_IDENTITY_FRAMES = 6;

type IdentityRequest = { jobId: string; decision: 'confirmed' | 'rejected'; frameIds: string[] };

export function parseIdentityRequest(data: unknown): IdentityRequest | null {
  if (!data || typeof data !== 'object') return null;
  const input = data as Record<string, unknown>;
  if (typeof input.jobId !== 'string' || !/^[A-Za-z0-9_-]{6,80}$/.test(input.jobId)) return null;
  if (input.decision !== 'confirmed' && input.decision !== 'rejected') return null;
  const frameIds = Array.isArray(input.frameIds)
    ? [...new Set(input.frameIds.filter((id): id is string => typeof id === 'string' && /^frame_[0-9]{1,6}$/.test(id)))]
    : [];
  if (input.decision === 'confirmed' && (frameIds.length === 0 || frameIds.length > MAX_IDENTITY_FRAMES)) return null;
  return { jobId: input.jobId, decision: input.decision, frameIds: input.decision === 'confirmed' ? frameIds : [] };
}

/** Merges held-back coaching into the report once the player confirmed which person they are. */
export function releasePendingCoaching(report: Record<string, unknown>, pending: PendingCoaching | null, job: MatchJobDoc): Record<string, unknown> {
  const next: Record<string, unknown> = { ...report };
  if (pending) {
    next.strengths = pending.strengths;
    next.improvements = pending.improvements;
    next.coachingNotes = pending.coachingNotes;
    if (pending.techniqueAssessment) next.techniqueAssessment = pending.techniqueAssessment;
    if (pending.opportunities.length) next.opportunities = pending.opportunities;
    if (pending.decisionMoments.length) next.decisionMoments = pending.decisionMoments;
    if (pending.clipCoaching && report.clip && typeof report.clip === 'object') {
      next.clip = { ...(report.clip as Record<string, unknown>), ...pending.clipCoaching, identityBasis: 'confirmed' };
    }
  }
  const evidence = Array.isArray(report.evidence) ? (report.evidence as Array<{ kind?: string }>) : [];
  const technique = next.techniqueAssessment as { ratedCount?: number } | undefined;
  const clip = next.clip as { decision?: unknown; goalkeeper?: unknown } | undefined;
  const decisions = Array.isArray(next.decisionMoments) ? next.decisionMoments.length : clip?.decision ? 1 : 0;
  next.sections = buildSections({
    identityConfirmed: true,
    targetSeenFrames: evidence.filter((item) => item.kind === 'observation').length,
    ratedTechniqueCount: technique?.ratedCount ?? 0,
    decisionMoments: decisions,
    isGoalkeeper: isGoalkeeperJob(job),
    goalkeeperNotes: clip?.goalkeeper ? 1 : 0,
    validatedEventCount: 0,
  });
  return next;
}

export function markIdentityRejected(report: Record<string, unknown>): Record<string, unknown> {
  const sections = Array.isArray(report.sections) ? (report.sections as ReportSection[]) : [];
  return {
    ...report,
    identityRejected: true,
    sections: sections.map((section) =>
      section.id === 'identity' ? { ...section, availability: 'INSUFFICIENT_EVIDENCE', reason: 'target_not_seen' } : section,
    ),
  };
}

export async function applyIdentityDecision(db: Firestore, uid: string, request: IdentityRequest): Promise<{ state: string; released: boolean }> {
  const ref = db.collection(MATCH_COLLECTION).doc(request.jobId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Match analysis job not found.');
    const job = snap.data() as MatchJobDoc & { pendingCoaching?: PendingCoaching | null };
    if (job.playerId !== uid) throw new HttpsError('permission-denied', 'You can only confirm your own analysis.');
    const known = new Set((job.frames ?? []).map((frame) => frame.id || `frame_${frame.index}`));
    if (request.frameIds.some((id) => !known.has(id))) {
      throw new HttpsError('invalid-argument', 'Pick frames from this analysis.');
    }
    const now = new Date().toISOString();
    const identityConfirmation = request.decision === 'confirmed'
      ? { state: 'confirmed', frameIds: request.frameIds, confirmedAt: now }
      : { state: 'rejected', frameIds: [], confirmedAt: null };
    const update: Record<string, unknown> = { identityConfirmation, pendingCoaching: null, updatedAt: now };
    let released = false;
    if (job.status === 'complete' && job.report) {
      if (request.decision === 'confirmed') {
        update.report = releasePendingCoaching(job.report, job.pendingCoaching ?? null, job);
        released = Boolean(job.pendingCoaching);
      } else {
        update.report = markIdentityRejected(job.report);
      }
    }
    tx.update(ref, update);
    return { state: identityConfirmation.state, released };
  });
}

export const confirmAnalysisIdentity = onCall(createCallableOptions(), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const parsed = parseIdentityRequest(request.data);
  if (!parsed) throw new HttpsError('invalid-argument', `Pick between 1 and ${MAX_IDENTITY_FRAMES} frames that show you.`);
  return applyIdentityDecision(getFirestore(), uid, parsed);
});
