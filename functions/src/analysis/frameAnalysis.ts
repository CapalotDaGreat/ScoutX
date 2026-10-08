import { HttpsError } from 'firebase-functions/v2/https';
import { type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { assertAiConsent } from '../ai/consentGate';
import { callChat } from '../ai/openRouter';
import { buildPrompt } from '../ai/promptBuilder';
import { resolveModel } from '../ai/providerConfig';
import { cleanModelText, cleanTextList, extractJsonObject } from '../ai/outputValidator';
import { computeCoverage } from './coverage';
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
    notes?: string;
  };
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
  | 'video_rejected';

const ERROR_TEXT: Record<AnalysisErrorCode, string> = {
  frames_insufficient: 'Not enough readable frames to analyze.',
  model_unavailable: 'The analysis service is unavailable. Try again later.',
  model_output_invalid: 'AI response could not be parsed.',
  ai_consent_required: 'AI analysis is turned off in the Privacy Center.',
  extraction_failed: 'Key frames could not be extracted from this video.',
  queue_unavailable: 'Analysis could not be queued. Try again later.',
  video_rejected: 'The video did not pass validation.',
};

export async function failJob(
  db: Firestore,
  jobId: string,
  code: AnalysisErrorCode,
  stages?: StageRecord[],
  activeStage?: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db.collection(MATCH_COLLECTION).doc(jobId).set(
    {
      status: 'failed',
      pipelineState: 'failed',
      errorCode: code,
      error: ERROR_TEXT[code],
      lease: null,
      updatedAt: now,
      ...(stages && activeStage ? { pipelineStages: updateStage(stages, activeStage, 'failed', now, { retryable: true }) } : {}),
    },
    { merge: true },
  );
}

function emptyStats(): Record<string, number | boolean | null> {
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

async function readOwnedFrameAsDataUrl(uid: string, jobId: string, storagePath: unknown): Promise<string | null> {
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
    logger.warn('Failed to read frame', { jobId, message: error instanceof Error ? error.message : 'unknown' });
    return null;
  }
}

async function acquireJobLease(
  db: Firestore,
  uid: string,
  jobId: string,
  requestId: string,
  idempotencyKey: string | undefined,
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
    if (job.playerId !== uid) throw new HttpsError('permission-denied', 'You can only analyze your own footage.');
    if (job.cancelRequested) throw new HttpsError('aborted', 'Analysis was cancelled.');
    if (job.status === 'complete') throw new HttpsError('already-exists', 'This analysis is already complete.');
    if (idempotencyKey && job.idempotencyKey && job.idempotencyKey !== idempotencyKey) {
      throw new HttpsError('failed-precondition', 'Idempotency key does not match this job.');
    }

    const status = (job.status as JobStatus) || 'queued';
    if (!canTransitionJob(status, 'processing') && status !== 'processing') {
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
      `Video duration seconds: ${job.measuredDurationSec ?? job.durationSec}`,
      'Frame timeline guide:',
      ...frames.map((frame, index) => `Image ${index + 1} (frameId=${frame.id}): ${frame.timestampSec}s into the recording`),
      identityConfirmed ? 'Identity was confirmed by the player for selected frames.' : 'Identity is not confirmed.',
      strongFoot
        ? `The player reports their strong foot as ${strongFoot}. weakFoot judges the OTHER foot only.`
        : 'The strong foot is unknown; only rate weakFoot if the frames show both feet being used.',
    ],
    userMetadata: {
      targeting: {
        jerseyNumber: job.targeting.jerseyNumber,
        kitPrimaryColor: job.targeting.kitPrimaryColor,
        kitSecondaryColor: job.targeting.kitSecondaryColor,
        teamSide: job.targeting.teamSide ?? 'unknown',
        notes: job.targeting.notes ?? '',
      },
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
}): Promise<{ jobId: string; status: 'complete' }> {
  const { db, uid, jobId, requestId } = params;
  const jobRef = db.collection(MATCH_COLLECTION).doc(jobId);
  const existing = await jobRef.get();
  if (!existing.exists) throw new HttpsError('not-found', 'Match analysis job not found.');
  if (existing.get('playerId') !== uid) throw new HttpsError('permission-denied', 'You can only analyze your own footage.');
  if (existing.get('status') === 'complete') throw new HttpsError('already-exists', 'This analysis is already complete.');
  try {
    await assertAiConsent([uid], db);
  } catch (error) {
    await failJob(db, jobId, 'ai_consent_required');
    throw error;
  }

  const job = await acquireJobLease(db, uid, jobId, requestId, params.idempotencyKey);
  const stages = parseStages(job.pipelineStages);
  const durationSec = job.measuredDurationSec ?? job.durationSec ?? 0;

  const validFrames = (Array.isArray(job.frames) ? job.frames : []).filter(
    (frame) => typeof frame?.timestampSec === 'number' && Number.isFinite(frame.timestampSec),
  );
  const imageContents: Array<{ type: 'image_url'; image_url: { url: string } }> = [];
  const frameSamples: Array<{ id: string; timestampSec: number }> = [];
  for (const frame of pickFramesForModel(validFrames)) {
    const dataUrl = await readOwnedFrameAsDataUrl(uid, jobId, frame.storagePath);
    if (dataUrl) {
      imageContents.push({ type: 'image_url', image_url: { url: dataUrl } });
      frameSamples.push({ id: frame.id || `frame_${frame.index}`, timestampSec: frame.timestampSec });
    }
  }

  if (imageContents.length < MIN_ANALYSIS_FRAMES) {
    await failJob(db, jobId, 'frames_insufficient', stages, 'player-identification');
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
      message: error instanceof Error ? error.message : 'unknown',
    });
  }

  const model = resolveModel('vision');
  const prompt = buildFramePrompt({ job, frames: frameSamples, identityConfirmed, selfReported });
  const result = await callChat({
    apiKey: params.apiKey,
    model,
    title: 'PitchProof Match Analysis',
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: [{ type: 'text', text: prompt.user }, ...imageContents] },
    ],
  });
  if (!result.ok) {
    await failJob(db, jobId, 'model_unavailable', stages, 'player-identification');
    throw new HttpsError('unavailable', ERROR_TEXT.model_unavailable, { reason: 'model_unavailable' });
  }

  let raw: Record<string, unknown>;
  try {
    raw = extractJsonObject(result.content);
  } catch {
    logger.error('Match analysis output was not a JSON object', { jobId });
    await failJob(db, jobId, 'model_output_invalid', stages, 'player-identification');
    throw new HttpsError('internal', ERROR_TEXT.model_output_invalid, { reason: 'model_output_invalid' });
  }

  const now = new Date().toISOString();
  let finalStages = updateStage(stages, 'player-identification', 'complete', now);
  finalStages = updateStage(finalStages, 'identity-confirmation', identityConfirmed ? 'complete' : 'pending', now);
  for (const id of ['coaching-synthesis', 'validation', 'final-report']) {
    finalStages = updateStage(finalStages, id, 'complete', now);
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
  const cancelled = await db.runTransaction(async (tx) => {
    const latest = await tx.get(jobRef);
    if (latest.get('cancelRequested') === true) {
      tx.set(jobRef, { lease: null, updatedAt: now }, { merge: true });
      return true;
    }
    tx.set(
      jobRef,
      {
        status: 'complete',
        pipelineState: 'completed',
        report,
        events: [],
        completedAt: report.generatedAt,
        updatedAt: now,
        error: null,
        errorCode: null,
        lease: null,
        pipelineStages: finalStages,
      },
      { merge: true },
    );
    return false;
  });
  if (cancelled) throw new HttpsError('aborted', 'Analysis was cancelled.');
  return { jobId, status: 'complete' };
}

export function pipelineStateOf(job: Pick<MatchJobDoc, 'pipelineState' | 'status'>) {
  return parsePipelineState(job.pipelineState, job.status);
}
