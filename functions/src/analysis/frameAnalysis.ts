import { HttpsError } from 'firebase-functions/v2/https';
import { type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { assertAiConsent } from '../ai/consentGate';
import { callChat } from '../ai/openRouter';
import { buildPrompt } from '../ai/promptBuilder';
import { isFootageProcessingApproved, resolveModel } from '../ai/providerConfig';
import { cleanModelText, cleanTextList, extractJsonObject } from '../ai/outputValidator';
import { computeCoverage } from './coverage';
import { buildClipPrompt, normalizeClipReport } from './clipAnalysis';
import {
  MODE_LIMITS,
  SHORT_CLIP_SAMPLING,
  isAnalysisMode,
  isClipContext,
  parseIntent,
  processingModeFor,
  selectAnalysisMode,
  type AnalysisMode,
} from './mode';
import { buildSections, buildVersions } from './reportSections';
import { assertVideoConsent } from './videoConsent';
import { pickFramesForModel, type SegmentRecord } from './segments';
import { parseStages, updateStage, type StageRecord } from './stages';
import { canAcquireLease, canTransitionJob, parsePipelineState, type JobStatus } from './stateMachine';
import { normalizeObservations } from './validation';
import {
  MIN_TECHNIQUE_FRAMES,
  normalizeTechniqueAssessment,
  parseSelfReportedStars,
  type SelfReportedStars,
} from './technique';
import {
  ANALYSIS_DAILY_QUOTA,
  ANALYSIS_LEASE_MS,
  ANALYSIS_MAX_ATTEMPTS,
  dailyQuotaCount,
  isDailyQuotaReached,
} from './workerContract';
import { logSafeError } from '../logging/redact';
import { positionEvaluationInstructions } from './positionFramework';

export const MATCH_COLLECTION = 'matchAnalysisJobs';
const QUOTA_COLLECTION = 'analysisQuotas';
const MAX_FRAME_BYTES = 1.8 * 1024 * 1024;
export const MIN_ANALYSIS_FRAMES = 3;

export type JobFrame = {
  id?: string;
  index: number;
  timestampSec: number;
  storagePath: string;
  downloadUrl?: string;
  source?: 'server' | 'device';
};

export type MatchJobDoc = {
  playerId: string;
  status: JobStatus | string;
  pipelineState?: string;
  pipelineGeneration?: number;
  targeting: {
    jerseyNumber: string;
    kitPrimaryColor: string;
    kitSecondaryColor: string;
    teamSide?: string;
    teamName?: string;
    position?: string;
    notes?: string;
  };
  analysisMode?: string;
  analysisIntent?: string;
  processingMode?: string;
  clipContext?: string;
  report?: Record<string, unknown> | null;
  match: { opponent: string; competition: string; date: string; result?: string };
  durationSec: number;
  measuredDurationSec?: number;
  videoStoragePath?: string;
  videoProbe?: { width?: number; height?: number } | null;
  frames: JobFrame[];
  extractionSegments?: SegmentRecord[];
  pipelineStages?: StageRecord[];
  idempotencyKey?: string;
  lease?: { holder: string; until: string } | null;
  attempts?: number;
  cancelRequested?: boolean;
  identityConfirmation?: { state?: string };
};

/** Stable reason codes the app maps to translated messages. */
export type AnalysisErrorCode =
  | 'frames_insufficient'
  | 'model_unavailable'
  | 'model_output_invalid'
  | 'ai_consent_required'
  | 'extraction_failed'
  | 'queue_unavailable'
  | 'video_rejected'
  | 'ai_privacy_configuration_required'
  | 'video_consent_required';

const ERROR_TEXT: Record<AnalysisErrorCode, string> = {
  frames_insufficient: 'Not enough readable frames to analyze.',
  model_unavailable: 'The analysis service is unavailable. Try again later.',
  model_output_invalid: 'AI response could not be parsed.',
  ai_consent_required: 'AI analysis is turned off in the Privacy Center.',
  extraction_failed: 'Key frames could not be extracted from this video.',
  queue_unavailable: 'Analysis could not be queued. Try again later.',
  video_rejected: 'The video did not pass validation.',
  ai_privacy_configuration_required: 'Video analysis is not available yet.',
  video_consent_required: 'Confirm how your video is processed before analysis starts.',
};

export async function failJob(
  db: Firestore,
  jobId: string,
  code: AnalysisErrorCode,
  stages?: StageRecord[],
  activeStage?: string,
  expectedGeneration?: number,
): Promise<void> {
  const now = new Date().toISOString();
  const ref = db.collection(MATCH_COLLECTION).doc(jobId);
  await db.runTransaction(async (tx) => {
    const latest = await tx.get(ref);
    if (!latest.exists || latest.get('cancelRequested') === true
      || (expectedGeneration !== undefined && (latest.get('pipelineGeneration') ?? 0) !== expectedGeneration)) return;
    tx.set(ref, {
      status: 'failed',
      pipelineState: 'failed',
      errorCode: code,
      error: ERROR_TEXT[code],
      lease: null,
      updatedAt: now,
      ...(stages && activeStage ? { pipelineStages: updateStage(stages, activeStage, 'failed', now, { retryable: true }) } : {}),
    }, { merge: true });
  });
}

export function emptyStats(): Record<string, number | boolean | null> {
  return {
    minutesPlayed: null,
    goals: null,
    assists: null,
    shots: null,
    shotsOnTarget: null,
    passesAttempted: null,
    passesCompleted: null,
    passCompletionPct: null,
    keyPasses: null,
    tackles: null,
    duelsWon: null,
    duelsLost: null,
    foulsCommitted: null,
    yellowCards: null,
    redCards: null,
    matchRating: null,
    cleanSheet: null,
  };
}

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function normalizeReport(params: {
  raw: Record<string, unknown>;
  modelId: string;
  durationSec: number;
  frames: Array<{ id: string; timestampSec: number }>;
  identityConfirmed: boolean;
  selfReported: SelfReportedStars;
  segments: SegmentRecord[];
  probe: MatchJobDoc['videoProbe'];
  stages: StageRecord[];
}): Record<string, unknown> {
  const { raw, durationSec, identityConfirmed } = params;
  const knownFrameIds = new Set(params.frames.map((frame) => frame.id));
  const observations = normalizeObservations(raw.observations ?? raw.evidence, knownFrameIds, durationSec);
  const techniqueAssessment = normalizeTechniqueAssessment(
    raw.techniqueAssessment,
    knownFrameIds,
    identityConfirmed,
    params.selfReported,
  );

  const evidence = observations.map((item, index) => ({
    id: `obs_${index + 1}`,
    kind: item.kind,
    label: item.label,
    detail: item.detail,
    confidence: item.kind === 'observation' ? 0.5 : 0,
    timestampSec: item.timestampSec,
    source: 'sampled-frame',
    frameIds: [item.frameId],
  }));
  const hasObservation = evidence.some((item) => item.kind === 'observation');

  const coachingNotes = identityConfirmed && hasObservation ? cleanModelText(raw.coachingNotes, 1200) : '';
  const strengths = identityConfirmed ? cleanTextList(raw.strengths) : [];
  const improvements = identityConfirmed ? cleanTextList(raw.improvements) : [];

  const coverage = computeCoverage({
    durationSec,
    segments: params.segments,
    sampledFrames: params.frames,
    citedFrameIds: observations.filter((item) => item.kind === 'observation').map((item) => item.frameId),
    identityConfirmed,
    probe: params.probe ?? null,
  });
  const identified = coverage.sampledCoverage.identifiedFrameCount;

  return {
    headline:
      cleanModelText(raw.headline, 140) ||
      (identified > 0 ? 'Sampled-frame review complete' : 'Not enough evidence yet'),
    strengths,
    improvements,
    coachingNotes,
    estimatedStats: emptyStats(),
    techniqueAssessment,
    coverage: {
      visiblePct: 0,
      likelyOffCameraPct: 0,
      unknownPct: 100,
      confidenceLabel: coverage.sampledCoverage.confidenceLabel,
      note: 'Coverage is based on how many sampled frames cited the nominated player. Percentages of the full match are unknown without tracking.',
    },
    sampledCoverage: coverage.sampledCoverage,
    evidence,
    events: [],
    coachingMoments: [],
    moments: evidence
      .filter((item) => item.kind === 'observation')
      .slice(0, 8)
      .map((item) => ({ timestampSec: item.timestampSec, label: item.label, detail: item.detail })),
    pipelineStages: params.stages,
    segments: [],
    availability: coverage.availability,
    confidenceDimensions: coverage.confidenceDimensions,
    tacticalSummary:
      'Tracking, pitch maps and event detection are unavailable. Coaching is limited to observations bound to sampled frames.',
    confidence: null,
    methodology:
      'Key frames were extracted from the full video and a vision model reviewed a spread of them. Countable match stats stay unknown until a computer-vision worker produces validated events.',
    modelId: params.modelId,
    generatedAt: new Date().toISOString(),
  };
}

export async function readOwnedFrameAsDataUrl(uid: string, jobId: string, storagePath: unknown): Promise<string | null> {
  const prefix = `profiles/${uid}/matchFootage/${jobId}/frames/`;
  if (typeof storagePath !== 'string' || !storagePath.startsWith(prefix) || storagePath.includes('..')) {
    return null;
  }
  try {
    const file = getStorage().bucket().file(storagePath);
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size ?? 0);
    if (!size || size > MAX_FRAME_BYTES || !String(metadata.contentType ?? '').startsWith('image/')) {
      return null;
    }
    const [buffer] = await file.download();
    return `data:image/jpeg;base64,${buffer.toString('base64')}`;
  } catch (error) {
    logger.warn('Failed to read frame', { jobId, ...logSafeError(error) });
    return null;
  }
}

export async function acquireJobLease(
  db: Firestore,
  uid: string,
  jobId: string,
  requestId: string,
  idempotencyKey: string | undefined,
  expectedGeneration?: number,
): Promise<MatchJobDoc> {
  const jobRef = db.collection(MATCH_COLLECTION).doc(jobId);
  const quotaRef = db.collection(QUOTA_COLLECTION).doc(uid);
  const now = new Date();
  const nowMs = now.getTime();
  const day = utcDay(now);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Match analysis job not found.');
    const job = snap.data() as MatchJobDoc;
    if (expectedGeneration !== undefined && (job.pipelineGeneration ?? 0) !== expectedGeneration) {
      throw new HttpsError('aborted', 'Analysis was superseded.');
    }
    if (job.playerId !== uid) throw new HttpsError('permission-denied', 'You can only analyze your own footage.');
    if (job.cancelRequested) throw new HttpsError('aborted', 'Analysis was cancelled.');
    if (job.status === 'complete') throw new HttpsError('already-exists', 'This analysis is already complete.');
    if (idempotencyKey && job.idempotencyKey && job.idempotencyKey !== idempotencyKey) {
      throw new HttpsError('failed-precondition', 'Idempotency key does not match this job.');
    }

    const status = (job.status as JobStatus) || 'queued';
    // Consented device-frame clips never upload a video, so they go straight from uploading.
    const deviceClip = status === 'uploading' && job.processingMode === 'device_frames';
    if (!deviceClip && !canTransitionJob(status, 'processing') && status !== 'processing') {
      throw new HttpsError('failed-precondition', `Job cannot move from ${status} to processing.`);
    }
    if (!canAcquireLease(job.lease ?? undefined, requestId, nowMs)) {
      throw new HttpsError('aborted', 'Another analysis run holds this job.');
    }

    const attempts = typeof job.attempts === 'number' ? job.attempts : 0;
    if (attempts >= ANALYSIS_MAX_ATTEMPTS) throw new HttpsError('resource-exhausted', 'Retry limit reached for this job.');

    const quotaSnap = await tx.get(quotaRef);
    const quota = quotaSnap.data() as { day?: string; count?: number } | undefined;
    const count = dailyQuotaCount(quota?.day, quota?.count, day);
    if (isDailyQuotaReached(count, ANALYSIS_DAILY_QUOTA)) {
      throw new HttpsError('resource-exhausted', 'Daily match-analysis quota reached.');
    }

    const stages = updateStage(parseStages(job.pipelineStages), 'player-identification', 'active', now.toISOString());
    tx.set(
      jobRef,
      {
        status: 'processing',
        pipelineState: 'analyzing',
        pipelineStages: stages,
        attempts: attempts + 1,
        lease: { holder: requestId, until: new Date(nowMs + ANALYSIS_LEASE_MS).toISOString() },
        updatedAt: now.toISOString(),
        error: null,
        errorCode: null,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      },
      { merge: true },
    );
    tx.set(quotaRef, { day, count: count + 1, updatedAt: now.toISOString() }, { merge: true });
    return { ...job, pipelineStages: stages };
  });
}

export const TARGET_POSITIONS = [
  'goalkeeper', 'defender', 'midfielder', 'forward', 'unknown',
  'GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST',
] as const;

/** The target specification exactly as the player typed it; it reaches the model only as data. */
export function targetingMetadata(job: Pick<MatchJobDoc, 'targeting'>): Record<string, unknown> {
  const targeting = job.targeting ?? ({} as MatchJobDoc['targeting']);
  return {
    jerseyNumber: targeting.jerseyNumber ?? '',
    kitPrimaryColor: targeting.kitPrimaryColor ?? '',
    kitSecondaryColor: targeting.kitSecondaryColor ?? '',
    teamSide: targeting.teamSide ?? 'unknown',
    teamName: targeting.teamName ?? '',
    position: (TARGET_POSITIONS as readonly string[]).includes(String(targeting.position)) ? targeting.position : 'unknown',
    notes: targeting.notes ?? '',
  };
}

export function isGoalkeeperJob(job: Pick<MatchJobDoc, 'targeting'>): boolean {
  return job.targeting?.position === 'goalkeeper' || job.targeting?.position === 'GK';
}

/**
 * Coaching the model wrote about "the nominated player" before the player confirmed which
 * person they are. It is stored apart from the report and only released by
 * confirmAnalysisIdentity; a rejection discards it.
 */
export type PendingCoaching = {
  strengths: string[];
  improvements: string[];
  coachingNotes: string;
  techniqueAssessment: Record<string, unknown> | null;
  opportunities: unknown[];
  decisionMoments: unknown[];
  clipCoaching: Record<string, unknown> | null;
};

/** Writes the finished report unless the job was cancelled meanwhile. */
export async function finishJob(
  db: Firestore,
  jobId: string,
  params: { report: Record<string, unknown>; stages: StageRecord[]; pendingCoaching: PendingCoaching | null; now: string; expectedGeneration?: number },
): Promise<void> {
  const jobRef = db.collection(MATCH_COLLECTION).doc(jobId);
  const cancelled = await db.runTransaction(async (tx) => {
    const latest = await tx.get(jobRef);
    if (!latest.exists || (params.expectedGeneration !== undefined
      && (latest.get('pipelineGeneration') ?? 0) !== params.expectedGeneration)) return true;
    if (latest.get('cancelRequested') === true) {
      tx.set(jobRef, { lease: null, updatedAt: params.now }, { merge: true });
      return true;
    }
    const previous = latest.get('report') as Record<string, unknown> | undefined;
    const previousVersion = (previous?.versions as { analysisVersion?: unknown } | undefined)?.analysisVersion;
    if (previous && typeof previousVersion === 'number') {
      tx.set(jobRef.collection('reports').doc(String(previousVersion)), { report: previous, archivedAt: params.now });
    }
    tx.set(
      jobRef,
      {
        status: 'complete',
        pipelineState: 'completed',
        report: params.report,
        pendingCoaching: params.pendingCoaching,
        events: [],
        completedAt: params.report.generatedAt,
        updatedAt: params.now,
        error: null,
        errorCode: null,
        lease: null,
        pipelineStages: params.stages,
      },
      { merge: true },
    );
    return false;
  });
  if (cancelled) throw new HttpsError('aborted', 'Analysis was cancelled or superseded.');
}

const SYSTEM_RULES = [
  'You are PitchProof Match Analyst.',
  'You ONLY describe what is visible in the provided still frames.',
  'Never fabricate player actions, identity, position, movement, match events, or countable stats.',
  'Do not count passes, shots, tackles, or minutes.',
  'If the jersey is unreadable or the player is not in the frame, say so.',
  'Every observation MUST cite a frameId from the timeline guide.',
];

export function buildFramePrompt(params: {
  job: MatchJobDoc;
  frames: Array<{ id: string; timestampSec: number }>;
  identityConfirmed: boolean;
  selfReported: SelfReportedStars;
}): { system: string; user: string } {
  const { job, frames, identityConfirmed, selfReported } = params;
  const strongFoot = selfReported.strongFoot;
  return buildPrompt({
    system: SYSTEM_RULES,
    trusted: [
      'Review sampled still frames for ONE nominated player described in USER_METADATA.targeting.',
      ...positionEvaluationInstructions(targetingMetadata(job)),
      `Video duration seconds: ${job.measuredDurationSec ?? job.durationSec}`,
      'Frame timeline guide:',
      ...frames.map((frame, index) => `Image ${index + 1} (frameId=${frame.id}): ${frame.timestampSec}s into the recording`),
      identityConfirmed ? 'Identity was confirmed by the player for selected frames.' : 'Identity is not confirmed.',
      strongFoot
        ? `The player reports their strong foot as ${strongFoot}. weakFoot judges the OTHER foot only.`
        : 'The strong foot is unknown; only rate weakFoot if the frames show both feet being used.',
    ],
    userMetadata: {
      targeting: targetingMetadata(job),
      match: { opponent: job.match.opponent, competition: job.match.competition, date: job.match.date },
    },
    output: [
      'Tasks:',
      '1) For each frame, report whether the nominated jersey is visible.',
      '2) Describe only visible actions, bound to frameId.',
      '3) Do not estimate match stats or a match rating.',
      '4) techniqueAssessment: for weakFoot, skillMoves, firstTouch, passing, dribbling and shooting give stars on a 1-5 scale (EA FC style: 1 = clearly weak or avoided, 3 = competent, 5 = excellent).',
      `   Only give stars when at least ${MIN_TECHNIQUE_FRAMES} cited frames clearly show the nominated player performing that technique; otherwise set stars to null and say what footage is missing.`,
      '   Each tip is one concrete drill to improve that technique.',
      'JSON schema:',
      JSON.stringify({
        headline: 'string',
        strengths: ['string'],
        improvements: ['string'],
        coachingNotes: 'string',
        observations: [{ frameId: 'frame_0', timestampSec: 0, kind: 'observation', label: 'string', detail: 'string' }],
        techniqueAssessment: {
          weakFoot: { stars: 'number 1-5 or null', summary: 'string', tip: 'string', frameIds: ['frame_0'] },
          skillMoves: { stars: 'number 1-5 or null', summary: 'string', tip: 'string', frameIds: ['frame_0'] },
          firstTouch: { stars: 'number 1-5 or null', summary: 'string', tip: 'string', frameIds: ['frame_0'] },
          passing: { stars: 'number 1-5 or null', summary: 'string', tip: 'string', frameIds: ['frame_0'] },
          dribbling: { stars: 'number 1-5 or null', summary: 'string', tip: 'string', frameIds: ['frame_0'] },
          shooting: { stars: 'number 1-5 or null', summary: 'string', tip: 'string', frameIds: ['frame_0'] },
          overallSummary: 'string',
        },
      }),
    ],
  });
}

/**
 * Vision-model review of a job's sampled frames. Used by the pipeline worker after
 * extraction and by the callable for retries and the short-clip device fallback.
 */
export async function runFrameAnalysis(params: {
  db: Firestore;
  uid: string;
  jobId: string;
  requestId: string;
  idempotencyKey?: string;
  apiKey: string;
  expectedGeneration?: number;
}): Promise<{ jobId: string; status: 'complete' }> {
  const { db, uid, jobId, requestId } = params;
  const jobRef = db.collection(MATCH_COLLECTION).doc(jobId);
  const existing = await jobRef.get();
  if (!existing.exists) throw new HttpsError('not-found', 'Match analysis job not found.');
  if (params.expectedGeneration !== undefined && (existing.get('pipelineGeneration') ?? 0) !== params.expectedGeneration) {
    throw new HttpsError('aborted', 'Analysis was superseded.');
  }
  if (existing.get('playerId') !== uid) throw new HttpsError('permission-denied', 'You can only analyze your own footage.');
  if (existing.get('status') === 'complete') throw new HttpsError('already-exists', 'This analysis is already complete.');
  if (!isFootageProcessingApproved()) {
    await failJob(db, jobId, 'ai_privacy_configuration_required', undefined, undefined, existing.get('pipelineGeneration') ?? 0);
    throw new HttpsError('failed-precondition', ERROR_TEXT.ai_privacy_configuration_required, {
      reason: 'ai_privacy_configuration_required',
    });
  }
  try {
    await assertAiConsent([uid], db);
  } catch (error) {
    await failJob(db, jobId, 'ai_consent_required', undefined, undefined, existing.get('pipelineGeneration') ?? 0);
    throw error;
  }
  try {
    await assertVideoConsent(db, uid, jobId);
  } catch (error) {
    await failJob(db, jobId, 'video_consent_required', undefined, undefined, existing.get('pipelineGeneration') ?? 0);
    throw error;
  }

  const job = await acquireJobLease(db, uid, jobId, requestId, params.idempotencyKey, params.expectedGeneration);
  const stages = parseStages(job.pipelineStages);
  const durationSec = job.measuredDurationSec ?? job.durationSec ?? 0;
  // Jobs created before modes existed have no server-set mode; they keep the frame review.
  const explicitMode = isAnalysisMode(job.analysisMode) ? job.analysisMode : null;
  const mode: AnalysisMode = explicitMode
    ?? (selectAnalysisMode(Math.max(durationSec, MODE_LIMITS.shortClipMaxSec + 1), parseIntent(job.analysisIntent)) ?? 'MATCH_CLIP');
  const clipMode = explicitMode !== null && processingModeFor(explicitMode, durationSec) === 'device_frames';

  const validFrames = (Array.isArray(job.frames) ? job.frames : []).filter(
    (frame) => typeof frame?.timestampSec === 'number' && Number.isFinite(frame.timestampSec),
  );
  const imageContents: Array<{ type: 'image_url'; image_url: { url: string } }> = [];
  const frameSamples: Array<{ id: string; timestampSec: number }> = [];
  const picked = pickFramesForModel(validFrames, clipMode ? SHORT_CLIP_SAMPLING.maxFrames : undefined);
  for (const frame of picked) {
    const dataUrl = await readOwnedFrameAsDataUrl(uid, jobId, frame.storagePath);
    if (dataUrl) {
      imageContents.push({ type: 'image_url', image_url: { url: dataUrl } });
      frameSamples.push({ id: frame.id || `frame_${frame.index}`, timestampSec: frame.timestampSec });
    }
  }

  if (imageContents.length < MIN_ANALYSIS_FRAMES) {
    await failJob(db, jobId, 'frames_insufficient', stages, 'player-identification', job.pipelineGeneration ?? 0);
    throw new HttpsError('failed-precondition', ERROR_TEXT.frames_insufficient, { reason: 'frames_insufficient' });
  }

  const identityConfirmed = job.identityConfirmation?.state === 'confirmed';
  let selfReported = parseSelfReportedStars(null);
  try {
    const profileSnap = await db.collection('profiles').doc(uid).get();
    selfReported = parseSelfReportedStars(profileSnap.get('identity'));
  } catch (error) {
    logger.warn('Could not read profile identity for technique context', {
      jobId,
      ...logSafeError(error),
    });
  }

  const model = resolveModel('vision');
  const prompt = clipMode
    ? buildClipPrompt({
      frames: frameSamples,
      targeting: targetingMetadata(job),
      clipContext: isClipContext(job.clipContext) ? job.clipContext : 'auto',
      identityConfirmed,
    })
    : buildFramePrompt({ job, frames: frameSamples, identityConfirmed, selfReported });
  const result = await callChat({
    apiKey: params.apiKey,
    model,
    title: clipMode ? 'PitchProof Clip Analysis' : 'PitchProof Match Analysis',
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: [{ type: 'text', text: prompt.user }, ...imageContents] },
    ],
  });
  if (!result.ok) {
    await failJob(db, jobId, 'model_unavailable', stages, 'player-identification', job.pipelineGeneration ?? 0);
    throw new HttpsError('unavailable', ERROR_TEXT.model_unavailable, { reason: 'model_unavailable' });
  }

  let raw: Record<string, unknown>;
  try {
    raw = extractJsonObject(result.content);
  } catch {
    logger.error('Match analysis output was not a JSON object', { jobId });
    await failJob(db, jobId, 'model_output_invalid', stages, 'player-identification', job.pipelineGeneration ?? 0);
    throw new HttpsError('internal', ERROR_TEXT.model_output_invalid, { reason: 'model_output_invalid' });
  }

  const now = new Date().toISOString();
  let finalStages = updateStage(stages, 'player-identification', 'complete', now);
  finalStages = updateStage(finalStages, 'identity-confirmation', identityConfirmed ? 'complete' : 'pending', now);
  for (const id of ['coaching-synthesis', 'validation', 'final-report']) {
    finalStages = updateStage(finalStages, id, 'complete', now);
  }
  const versions = buildVersions({ previous: job.report, mode, visionModel: model });

  if (clipMode) {
    const built = buildClipJobReport({
      raw,
      frames: frameSamples,
      job,
      mode,
      durationSec,
      identityConfirmed,
      stages: finalStages,
      modelId: model,
      versions,
    });
    await finishJob(db, jobId, { report: built.report, stages: finalStages, pendingCoaching: built.pendingCoaching, now, expectedGeneration: job.pipelineGeneration ?? 0 });
    return { jobId, status: 'complete' };
  }

  const report = normalizeReport({
    raw,
    modelId: model,
    durationSec,
    frames: frameSamples,
    identityConfirmed,
    selfReported,
    segments: job.extractionSegments ?? [],
    probe: job.videoProbe ?? null,
    stages: finalStages,
  });
  const technique = report.techniqueAssessment as { ratedCount?: number } | undefined;
  const evidence = report.evidence as Array<{ kind: string }>;
  report.analysisMode = mode;
  report.versions = versions;
  report.sections = buildSections({
    identityConfirmed,
    targetSeenFrames: evidence.filter((item) => item.kind === 'observation').length,
    ratedTechniqueCount: technique?.ratedCount ?? 0,
    decisionMoments: 0,
    isGoalkeeper: isGoalkeeperJob(job),
    goalkeeperNotes: 0,
    validatedEventCount: 0,
  });
  const pendingCoaching = identityConfirmed
    ? null
    : pendingFrameCoaching(raw, new Set(frameSamples.map((frame) => frame.id)), selfReported, evidence.length > 0);
  await finishJob(db, jobId, { report, stages: finalStages, pendingCoaching, now, expectedGeneration: job.pipelineGeneration ?? 0 });
  return { jobId, status: 'complete' };
}

function pendingFrameCoaching(
  raw: Record<string, unknown>,
  knownFrameIds: Set<string>,
  selfReported: SelfReportedStars,
  hasEvidence: boolean,
): PendingCoaching | null {
  if (!hasEvidence) return null;
  const pending: PendingCoaching = {
    strengths: cleanTextList(raw.strengths),
    improvements: cleanTextList(raw.improvements),
    coachingNotes: cleanModelText(raw.coachingNotes, 1200),
    techniqueAssessment: normalizeTechniqueAssessment(raw.techniqueAssessment, knownFrameIds, true, selfReported) as unknown as Record<string, unknown>,
    opportunities: [],
    decisionMoments: [],
    clipCoaching: null,
  };
  return pending;
}

/** Short-clip report: the clip section plus the shared evidence, coverage and section fields. */
export function buildClipJobReport(params: {
  raw: Record<string, unknown>;
  frames: Array<{ id: string; timestampSec: number }>;
  job: MatchJobDoc;
  mode: AnalysisMode;
  durationSec: number;
  identityConfirmed: boolean;
  stages: StageRecord[];
  modelId: string;
  versions: ReturnType<typeof buildVersions>;
}): { report: Record<string, unknown>; pendingCoaching: PendingCoaching | null } {
  const isGoalkeeper = isGoalkeeperJob(params.job) || params.job.clipContext === 'save';
  const clip = normalizeClipReport({ raw: params.raw, frames: params.frames, identityConfirmed: true, isGoalkeeper });
  const coaching = {
    decision: clip.decision,
    whatWorked: clip.whatWorked,
    improve: clip.improve,
    drill: clip.drill,
    goalkeeper: clip.goalkeeper,
  };
  const hasCoaching = Boolean(clip.decision || clip.drill || clip.goalkeeper || clip.whatWorked.length || clip.improve.length);
  const visibleClip = params.identityConfirmed
    ? { ...clip, identityBasis: 'confirmed' as const }
    : { ...clip, identityBasis: 'nominated_description' as const, decision: null, whatWorked: [], improve: [], drill: null, goalkeeper: null };

  const evidence = [
    ...clip.observable.map((item, index) => ({
      id: `obs_${index + 1}`,
      kind: 'observation',
      label: 'Observed',
      detail: item.text,
      confidence: clip.confidence === 'medium' ? 0.5 : 0.3,
      timestampSec: item.timestampSec,
      source: 'device-frame-sequence',
      frameIds: item.frameIds,
    })),
    ...clip.technicalExecution.map((item, index) => ({
      id: `tech_${index + 1}`,
      kind: 'observation',
      label: item.aspect,
      detail: item.text,
      confidence: item.confidence === 'medium' ? 0.5 : 0.3,
      timestampSec: item.timestampSec,
      source: 'device-frame-sequence',
      frameIds: item.frameIds,
    })),
  ];
  const cited = evidence.flatMap((item) => item.frameIds);
  const coverage = computeCoverage({
    durationSec: params.durationSec,
    segments: [],
    sampledFrames: params.frames,
    citedFrameIds: cited,
    identityConfirmed: params.identityConfirmed,
    probe: params.job.videoProbe ?? null,
  });
  const report: Record<string, unknown> = {
    headline: clip.whatHappened?.text.slice(0, 140) || 'Not enough evidence in this clip',
    strengths: params.identityConfirmed ? clip.whatWorked.map((item) => item.text) : [],
    improvements: params.identityConfirmed ? clip.improve.map((item) => item.text) : [],
    coachingNotes: '',
    estimatedStats: emptyStats(),
    coverage: {
      visiblePct: 0,
      likelyOffCameraPct: 0,
      unknownPct: 100,
      confidenceLabel: coverage.sampledCoverage.confidenceLabel,
      note: 'Coverage is based only on the frames sampled from this clip.',
    },
    sampledCoverage: coverage.sampledCoverage,
    evidence,
    events: [],
    coachingMoments: [],
    moments: evidence.slice(0, 8).map((item) => ({ timestampSec: item.timestampSec, label: item.label, detail: item.detail })),
    pipelineStages: params.stages,
    segments: [],
    availability: coverage.availability,
    confidenceDimensions: coverage.confidenceDimensions,
    clip: visibleClip,
    analysisMode: params.mode,
    versions: params.versions,
    sections: buildSections({
      identityConfirmed: params.identityConfirmed,
      targetSeenFrames: clip.targetVisible === 'yes' ? cited.length : 0,
      ratedTechniqueCount: 0,
      decisionMoments: params.identityConfirmed && clip.decision ? 1 : 0,
      isGoalkeeper,
      goalkeeperNotes: params.identityConfirmed && clip.goalkeeper ? 1 : 0,
      validatedEventCount: 0,
    }),
    confidence: null,
    methodology: params.job.processingMode === 'device_frames'
      ? 'Frames were sampled from your clip on your phone; the video itself was not uploaded. A vision model described only what those frames show, and every point cites them.'
      : 'Key frames were extracted from your uploaded clip. A vision model described only what those frames show, and every point cites them.',
    modelId: params.modelId,
    generatedAt: new Date().toISOString(),
  };
  const pendingCoaching: PendingCoaching | null = !params.identityConfirmed && hasCoaching
    ? {
      strengths: clip.whatWorked.map((item) => item.text),
      improvements: clip.improve.map((item) => item.text),
      coachingNotes: '',
      techniqueAssessment: null,
      opportunities: [],
      decisionMoments: [],
      clipCoaching: coaching,
    }
    : null;
  return { report, pendingCoaching };
}

export function pipelineStateOf(job: Pick<MatchJobDoc, 'pipelineState' | 'status'>) {
  return parsePipelineState(job.pipelineState, job.status);
}
