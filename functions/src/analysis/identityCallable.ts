import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, type Firestore, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { createCallableOptions } from '../callableOptions';
import { MATCH_COLLECTION, emptyStats, isGoalkeeperJob, type MatchJobDoc, type PendingCoaching } from './frameAnalysis';
import { buildSections, type ReportSection } from './reportSections';
import { normalizeTechniqueAssessment, parseSelfReportedStars } from './technique';
import { VIDEO_CONSENT_COLLECTION, VIDEO_CONSENT_VERSION } from './videoConsent';

export const MAX_IDENTITY_FRAMES = 6;

export function clearIdentityArtifacts(tx: Transaction, ref: DocumentReference, parts: unknown, stagingParts?: unknown): void {
  tx.delete(ref.collection('identityEvidence').doc('current'));
  tx.delete(ref.collection('identityCoordination').doc('current'));
  tx.delete(ref.collection('identityEvidenceStaging').doc('current'));
  for (const group of [parts, stagingParts]) if (Array.isArray(group) && group.length <= 64) {
    for (const id of group) if (typeof id === 'string' && /^part_[a-f0-9]{16}_[0-9]{1,2}$/.test(id)) {
      tx.delete(ref.collection('identityEvidence').doc(id));
    }
  }
}

type IdentityRequest = { jobId: string; decision: 'confirmed' | 'rejected'; frameIds: string[]; expectedGeneration?: number; expectedAnchorRevision?: number };

export function parseIdentityRequest(data: unknown): IdentityRequest | null {
  if (!data || typeof data !== 'object') return null;
  const input = data as Record<string, unknown>;
  if (typeof input.jobId !== 'string' || !/^[A-Za-z0-9_-]{6,80}$/.test(input.jobId)) return null;
  if (input.decision !== 'confirmed' && input.decision !== 'rejected') return null;
  for (const key of ['expectedGeneration', 'expectedAnchorRevision']) {
    if (input[key] !== undefined && (!Number.isSafeInteger(input[key]) || Number(input[key]) < 0)) return null;
  }
  const frameIds = Array.isArray(input.frameIds)
    ? [...new Set(input.frameIds.filter((id): id is string => typeof id === 'string' && /^frame_[0-9]{1,6}$/.test(id)))]
    : [];
  if (input.decision === 'confirmed' && (frameIds.length === 0 || frameIds.length > MAX_IDENTITY_FRAMES)) return null;
  return { jobId: input.jobId, decision: input.decision, frameIds: input.decision === 'confirmed' ? frameIds : [],
    ...(input.expectedGeneration !== undefined ? { expectedGeneration: Number(input.expectedGeneration) } : {}),
    ...(input.expectedAnchorRevision !== undefined ? { expectedAnchorRevision: Number(input.expectedAnchorRevision) } : {}),
  };
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

const INSUFFICIENT_IDENTITY_DIMENSIONS = {
  videoQuality: 'Insufficient', playerIdentity: 'Insufficient', cameraCoverage: 'Insufficient',
  trackingStability: 'Insufficient', eventConfidence: 'Insufficient', overallCoverage: 'Insufficient',
};

export function invalidatedTargetData(report?: Record<string, unknown> | null): Record<string, unknown> {
  return {
    experimentalIdentityCoordination: null,
    events: [], availability: [], confidenceDimensions: { ...INSUFFICIENT_IDENTITY_DIMENSIONS },
    ...(report ? { report: markIdentityRejected(report) } : {}),
  };
}

export function markIdentityRejected(report: Record<string, unknown>): Record<string, unknown> {
  const sections = Array.isArray(report.sections) ? (report.sections as ReportSection[]) : [];
  return {
    ...report,
    identityRejected: true,
    confidenceDimensions: { ...INSUFFICIENT_IDENTITY_DIMENSIONS },
    headline: 'Target identity rejected - a new review is required',
    strengths: [], improvements: [], coachingNotes: '', opportunities: [], decisionMoments: [],
    evidence: [], events: [], possibleEvents: [], moments: [], coachingMoments: [], segmentSummaries: [],
    eventCounts: null, estimatedStats: emptyStats(), clip: null, segments: [], availability: [],
    techniqueAssessment: normalizeTechniqueAssessment(null, new Set(), false, parseSelfReportedStars(null)),
    coverage: { visiblePct: 0, likelyOffCameraPct: 0, unknownPct: 100, confidenceLabel: 'Insufficient', note: 'Target identity was rejected. Dependent observations require a new review.' },
    sampledCoverage: null,
    tacticalSummary: '',
    sections: sections.map((section) => ({ ...section, availability: 'INSUFFICIENT_EVIDENCE', reason: 'identity_unconfirmed' })),
  };
}

export async function applyIdentityDecision(db: Firestore, uid: string, request: IdentityRequest): Promise<{ state: string; released: boolean }> {
  const ref = db.collection(MATCH_COLLECTION).doc(request.jobId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const consent = await tx.get(db.collection(VIDEO_CONSENT_COLLECTION).doc(request.jobId));
    const priorEvidence = await tx.get(ref.collection('identityEvidence').doc('current'));
    const priorStaging = await tx.get(ref.collection('identityEvidenceStaging').doc('current'));
    if (!snap.exists) throw new HttpsError('not-found', 'Match analysis job not found.');
    const job = snap.data() as MatchJobDoc & { pendingCoaching?: PendingCoaching | null };
    if (job.playerId !== uid) throw new HttpsError('permission-denied', 'You can only confirm your own analysis.');
    if (!consent.exists || consent.get('uid') !== uid || consent.get('revokedAt') !== null
      || consent.get('policyVersion') !== VIDEO_CONSENT_VERSION) {
      throw new HttpsError('failed-precondition', 'Current video consent is required.');
    }
    const revision = snap.get('experimentalTargetIdentity.revision') ?? 0;
    if ((revision > 0 && (request.expectedGeneration === undefined || request.expectedAnchorRevision === undefined))
      || (request.expectedGeneration !== undefined && request.expectedGeneration !== (job.pipelineGeneration ?? 0))
      || (request.expectedAnchorRevision !== undefined && request.expectedAnchorRevision !== revision)) {
      throw new HttpsError('aborted', 'The target selection changed. Reload before confirming identity.');
    }
    const rejectionIsCurrent = snap.get('identityRejection.generation') === (job.pipelineGeneration ?? 0)
      && snap.get('identityRejection.targetRevision') === revision;
    if (request.decision === 'confirmed' && (job.identityConfirmation?.state === 'rejected' || rejectionIsCurrent)) {
      throw new HttpsError('failed-precondition', 'A rejected identity requires a new target review or analysis.');
    }
    const known = new Set((job.frames ?? []).map((frame) => frame.id || `frame_${frame.index}`));
    if (request.frameIds.some((id) => !known.has(id))) {
      throw new HttpsError('invalid-argument', 'Pick frames from this analysis.');
    }
    const now = new Date().toISOString();
    const identityConfirmation = request.decision === 'confirmed'
      ? { state: 'confirmed', frameIds: request.frameIds, confirmedAt: now }
      : { state: 'rejected', frameIds: [], confirmedAt: null };
    const update: Record<string, unknown> = { identityConfirmation, pendingCoaching: null, updatedAt: now };
    if (request.decision === 'rejected') {
      clearIdentityArtifacts(tx, ref, priorEvidence.get('payloadParts'), priorStaging.get('payloadParts'));
      Object.assign(update, invalidatedTargetData(job.report));
      update.pipelineGeneration = (job.pipelineGeneration ?? 0) + 1;
      update.identityRejection = { generation: update.pipelineGeneration, targetRevision: revision };
      update.lease = null;
      if (job.status !== 'complete') {
        update.cancelRequested = true;
        update.status = 'cancelled';
        update.pipelineState = 'cancelled';
      }
    }
    let released = false;
    if (job.status === 'complete' && job.report) {
      if (request.decision === 'confirmed') {
        update.report = releasePendingCoaching(job.report, job.pendingCoaching ?? null, job);
        released = Boolean(job.pendingCoaching);
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
