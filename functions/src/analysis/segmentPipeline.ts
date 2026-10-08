import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { assertAiConsent } from '../ai/consentGate';
import { callChat } from '../ai/openRouter';
import { isFootageProcessingApproved, resolveModel } from '../ai/providerConfig';
import { extractJsonObject } from '../ai/outputValidator';
import { readableSourceFor } from '../uploads/mediaSource';
import { computeCoverage } from './coverage';
import { cvEventsValidated } from './cvConfig';
import { buildCvRequest, reportWindowsFromCv, type CvSegmentResult } from './cvContract';
import { getCvSegmentClient } from './cvWorker';
import {
  MATCH_COLLECTION,
  acquireJobLease,
  emptyStats,
  failJob,
  finishJob,
  isGoalkeeperJob,
  pipelineStateOf,
  readOwnedFrameAsDataUrl,
  targetingMetadata,
  type AnalysisErrorCode,
  type JobFrame,
  type MatchJobDoc,
  type PendingCoaching,
} from './frameAnalysis';
import { isAnalysisMode, parseIntent, selectAnalysisMode } from './mode';
import { buildSections, buildVersions } from './reportSections';
import {
  buildSegmentPrompt,
  buildSynthesisPrompt,
  normalizeSegmentReview,
  normalizeSynthesis,
  type PossibleEvent,
  type SegmentObservation,
  type SegmentReview,
} from './segmentReview';
import { parseStages, setCvStageResult, updateStage } from './stages';
import { normalizeTechniqueAssessment, parseSelfReportedStars } from './technique';
import { getTaskDispatcher, parseAnalysisTask, type AnalysisTask, type TaskDispatcher } from './taskDispatcher';
import { assertVideoConsent } from './videoConsent';
import { logSafeError } from '../logging/redact';

const openRouterApiKey = defineSecret('OPENROUTER_API_KEY');
const TASK_MAX_ATTEMPTS = 3;
/** Evidence kept in a report is bounded; each item keeps exactly one owner-private frame. */
export const MAX_REPORT_OBSERVATIONS = 60;
/** A tracked event only counts when the worker is validated and this sure of it. */
export const CV_EVENT_MIN_CONFIDENCE = 0.7;

type SegmentProgress = { total: number; reviewed: number[]; failed: number[] };
type ReviewJob = MatchJobDoc & {
  segmentReview?: SegmentProgress;
  identityCandidates?: unknown[];
  errorCode?: string;
};

async function passesGates(db: Firestore, job: ReviewJob, jobId: string): Promise<boolean> {
  const fail = async (code: AnalysisErrorCode) => {
    await failJob(db, jobId, code);
    return false;
  };
  if (!isFootageProcessingApproved()) return fail('ai_privacy_configuration_required');
  try {
    await assertAiConsent([job.playerId], db);
  } catch {
    return fail('ai_consent_required');
  }
  try {
    await assertVideoConsent(db, job.playerId, jobId);
  } catch {
    return fail('video_consent_required');
  }
  return true;
}

function segmentFrames(job: MatchJobDoc, segmentIndex: number): JobFrame[] {
  const low = segmentIndex * 100;
  return (job.frames ?? [])
    .filter((frame) => frame.index >= low && frame.index < low + 100 && Number.isFinite(frame.timestampSec))
    .sort((a, b) => a.timestampSec - b.timestampSec);
}

async function runCvForSegment(db: Firestore, jobId: string, job: MatchJobDoc, segmentIndex: number): Promise<void> {
  const client = getCvSegmentClient();
  const segment = job.extractionSegments?.[segmentIndex];
  if (!client || !segment || !job.videoStoragePath) return;
  const ref = db.collection(MATCH_COLLECTION).doc(jobId).collection('cvSegments').doc(String(segmentIndex));
  if ((await ref.get()).exists) return;
  const source = await readableSourceFor(job.videoStoragePath, 30 * 60 * 1000);
  const result = await client.analyzeSegment(
    buildCvRequest({ jobId, segment, source: { url: source.url, headers: source.headers }, targeting: targetingMetadata(job) }),
  );
  await ref.set(result ? { ...result, generation: job.pipelineGeneration ?? 0 } : { failed: true, generation: job.pipelineGeneration ?? 0 });
}

/**
 * Reviews one segment's frames (and, when a validated worker is configured, its tracking
 * result). Idempotent per segment; the last settled segment queues the synthesis.
 */
export async function processReviewTask(
  db: Firestore,
  task: Extract<AnalysisTask, { kind: 'review_segment' }>,
  options: { finalAttempt: boolean; apiKey: string; dispatcher?: TaskDispatcher },
): Promise<'reviewed' | 'failed' | 'skipped'> {
  const jobRef = db.collection(MATCH_COLLECTION).doc(task.jobId);
  const snap = await jobRef.get();
  if (!snap.exists) return 'skipped';
  const job = snap.data() as ReviewJob;
  const progress = job.segmentReview;
  if (job.pipelineGeneration !== task.generation || job.cancelRequested || pipelineStateOf(job) !== 'analyzing') return 'skipped';
  if (!progress || progress.reviewed.includes(task.segmentIndex) || progress.failed.includes(task.segmentIndex)) return 'skipped';
  if (!(await passesGates(db, job, task.jobId))) return 'failed';
  if (!options.apiKey) {
    await failJob(db, task.jobId, 'model_unavailable');
    return 'failed';
  }

  try {
    await runCvForSegment(db, task.jobId, job, task.segmentIndex);
  } catch (error) {
    logger.warn('CV worker segment failed', { jobId: task.jobId, ...logSafeError(error) });
  }

  const frames = segmentFrames(job, task.segmentIndex);
  const images: Array<{ type: 'image_url'; image_url: { url: string } }> = [];
  const samples: Array<{ id: string; timestampSec: number }> = [];
  for (const frame of frames) {
    const dataUrl = await readOwnedFrameAsDataUrl(job.playerId, task.jobId, frame.storagePath);
    if (!dataUrl) continue;
    images.push({ type: 'image_url', image_url: { url: dataUrl } });
    samples.push({ id: frame.id || `frame_${frame.index}`, timestampSec: frame.timestampSec });
  }

  let review: SegmentReview | null = null;
  if (images.length > 0) {
    const segment = job.extractionSegments?.[task.segmentIndex];
    const model = resolveModel('vision');
    const prompt = buildSegmentPrompt({
      segmentIndex: task.segmentIndex,
      startSec: segment?.startSec ?? 0,
      endSec: segment?.endSec ?? 0,
      frames: samples,
      targeting: targetingMetadata(job),
    });
    const result = await callChat({
      apiKey: options.apiKey,
      model,
      title: 'PitchProof Segment Review',
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: [{ type: 'text', text: prompt.user }, ...images] },
      ],
    });
    if (!result.ok && !options.finalAttempt) {
      throw new HttpsError('unavailable', 'Segment review is temporarily unavailable.', { reason: 'model_unavailable' });
    }
    if (result.ok) {
      try {
        review = normalizeSegmentReview({
          raw: extractJsonObject(result.content),
          segmentIndex: task.segmentIndex,
          frames: samples,
          modelId: model,
          now: new Date().toISOString(),
        });
      } catch {
        logger.warn('Segment review output was not a JSON object', { jobId: task.jobId, segment: task.segmentIndex });
      }
    }
  }

  if (review) {
    await jobRef.collection('segmentReviews').doc(String(task.segmentIndex)).set({ ...review, generation: task.generation });
  }
  const settled = await db.runTransaction(async (tx) => {
    const latestSnap = await tx.get(jobRef);
    const latest = latestSnap.data() as ReviewJob | undefined;
    if (!latest || latest.pipelineGeneration !== task.generation || !latest.segmentReview) return false;
    const current = latest.segmentReview;
    if (current.reviewed.includes(task.segmentIndex) || current.failed.includes(task.segmentIndex)) return false;
    const next: SegmentProgress = {
      total: current.total,
      reviewed: review ? [...current.reviewed, task.segmentIndex] : current.reviewed,
      failed: review ? current.failed : [...current.failed, task.segmentIndex],
    };
    const update: Record<string, unknown> = { segmentReview: next, updatedAt: new Date().toISOString() };
    // Early "Is this you?": the first frames where the reviewer saw the nominated player.
    if (review && (latest.identityCandidates ?? []).length === 0) {
      const sightings = review.frameStates.filter((state) => state.targetVisible === 'yes').slice(0, 6);
      if (sightings.length > 0) {
        const times = new Map(samples.map((sample) => [sample.id, sample.timestampSec]));
        update.identityCandidates = sightings.map((state) => ({
          frameId: state.frameId,
          timestampSec: times.get(state.frameId) ?? 0,
          note: 'Possible sighting of the nominated player',
        }));
      }
    }
    tx.update(jobRef, update);
    return next.reviewed.length + next.failed.length >= next.total;
  });
  if (settled) {
    await (options.dispatcher ?? getTaskDispatcher()).enqueue({ kind: 'synthesize_report', jobId: task.jobId, generation: task.generation });
  }
  return review ? 'reviewed' : 'failed';
}

function cvPossibleEvents(results: CvSegmentResult[]): Array<PossibleEvent & { source: 'cv_worker'; confidence: number; frameTimesSec: number[] }> {
  const validated = cvEventsValidated();
  return results.flatMap((result) =>
    result.events.map((event, index) => ({
      id: `cv${result.segmentIndex}_e${index + 1}`,
      type: event.type,
      frameIds: [],
      frameTimesSec: event.frameTimesSec,
      timestampSec: event.startSec,
      note: '',
      confidence: event.confidence,
      source: 'cv_worker' as const,
      status: (validated && result.identity.state === 'CONFIRMED_VISIBLE' && event.confidence >= CV_EVENT_MIN_CONFIDENCE
        ? 'validated'
        : 'needs_review') as PossibleEvent['status'],
    })),
  );
}

/**
 * Builds the report from structured segment observations only (the text model never sees the
 * video). Coaching is held back until the player confirms their identity.
 */
export async function processSynthesisTask(
  db: Firestore,
  task: Extract<AnalysisTask, { kind: 'synthesize_report' }>,
  options: { finalAttempt: boolean; apiKey: string },
): Promise<'complete' | 'failed' | 'skipped'> {
  const jobRef = db.collection(MATCH_COLLECTION).doc(task.jobId);
  const snap = await jobRef.get();
  if (!snap.exists) return 'skipped';
  const pre = snap.data() as ReviewJob;
  const state = pipelineStateOf(pre);
  const retrying = state === 'failed' && pre.errorCode === 'model_unavailable';
  if (pre.pipelineGeneration !== task.generation || pre.cancelRequested || (state !== 'analyzing' && !retrying)) return 'skipped';
  const progress = pre.segmentReview;
  if (!progress || progress.reviewed.length + progress.failed.length < progress.total) return 'skipped';
  if (!(await passesGates(db, pre, task.jobId))) return 'failed';
  if (!options.apiKey) {
    await failJob(db, task.jobId, 'model_unavailable');
    return 'failed';
  }

  let job: MatchJobDoc;
  try {
    job = await acquireJobLease(db, pre.playerId, task.jobId, `task:${task.jobId}:${task.generation}:synth`, undefined);
  } catch (error) {
    logger.warn('Synthesis lease refused', { jobId: task.jobId, ...logSafeError(error) });
    return 'failed';
  }
  const stages = parseStages(job.pipelineStages);
  const durationSec = job.measuredDurationSec ?? job.durationSec ?? 0;
  const mode = isAnalysisMode(job.analysisMode)
    ? job.analysisMode
    : selectAnalysisMode(durationSec, parseIntent(job.analysisIntent)) ?? 'FULL_MATCH';

  const reviews = (await jobRef.collection('segmentReviews').get()).docs
    .map((doc) => doc.data() as SegmentReview & { generation?: number })
    .filter((review) => review.generation === task.generation)
    .sort((a, b) => a.segmentIndex - b.segmentIndex);
  const cvResults = (await jobRef.collection('cvSegments').get()).docs
    .map((doc) => doc.data() as CvSegmentResult & { failed?: boolean; generation?: number })
    .filter((result) => !result.failed && result.generation === task.generation);

  const allObservations: SegmentObservation[] = reviews.flatMap((review) => review.observations);
  const observations = allObservations
    .sort((a, b) => (a.confidence === b.confidence ? a.timestampSec - b.timestampSec : a.confidence === 'medium' ? -1 : 1))
    .slice(0, MAX_REPORT_OBSERVATIONS)
    .sort((a, b) => a.timestampSec - b.timestampSec);
  const seenFrames = reviews.flatMap((review) => review.frameStates.filter((item) => item.targetVisible === 'yes'));
  const identityConfirmed = job.identityConfirmation?.state === 'confirmed';

  let selfReported = parseSelfReportedStars(null);
  try {
    selfReported = parseSelfReportedStars((await db.collection('profiles').doc(job.playerId).get()).get('identity'));
  } catch {
    // Self-reported stars are optional context.
  }

  const reasoningModel = resolveModel('text');
  let raw: Record<string, unknown> = {};
  if (observations.length > 0) {
    const prompt = buildSynthesisPrompt({
      observations,
      durationSec,
      sampledFrames: (job.frames ?? []).length,
      targetSeenFrames: seenFrames.length,
      targeting: targetingMetadata(job),
    });
    const result = await callChat({
      apiKey: options.apiKey,
      model: reasoningModel,
      title: 'PitchProof Match Synthesis',
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
    });
    if (!result.ok) {
      await failJob(db, task.jobId, 'model_unavailable', stages, 'coaching-synthesis');
      if (!options.finalAttempt) throw new HttpsError('unavailable', 'Synthesis is temporarily unavailable.', { reason: 'model_unavailable' });
      return 'failed';
    }
    try {
      raw = extractJsonObject(result.content);
    } catch {
      await failJob(db, task.jobId, 'model_output_invalid', stages, 'coaching-synthesis');
      return 'failed';
    }
  }

  const synthesis = normalizeSynthesis(raw, observations);
  const citedFrames = new Set(observations.map((item) => item.frameId));
  const technique = normalizeTechniqueAssessment(raw.techniqueAssessment, citedFrames, identityConfirmed, selfReported);
  const possibleEvents = [
    ...reviews.flatMap((review) => review.possibleEvents).map((event) => ({ ...event, source: 'segment_review' as const })),
    ...cvPossibleEvents(cvResults),
  ].sort((a, b) => a.timestampSec - b.timestampSec);
  const validatedEventCount = possibleEvents.filter((event) => event.status === 'validated').length;

  const now = new Date().toISOString();
  let finalStages = updateStage(stages, 'player-identification', 'complete', now);
  finalStages = updateStage(finalStages, 'identity-confirmation', identityConfirmed ? 'complete' : 'pending', now);
  for (const id of ['coaching-synthesis', 'validation', 'final-report']) finalStages = updateStage(finalStages, id, 'complete', now);
  if (cvResults.length > 0) {
    const allComplete = (key: 'tracking' | 'events' | 'pitch') => cvResults.every((result) => result.stages[key] === 'complete');
    finalStages = setCvStageResult(finalStages, 'player-tracking', allComplete('tracking') ? 'complete' : 'failed', now, 'From the computer-vision worker.');
    finalStages = setCvStageResult(finalStages, 'event-detection', allComplete('events') ? 'complete' : 'unavailable', now,
      validatedEventCount > 0 ? 'Validated tracker events.' : 'Tracker events are suggestions until the worker is validated.');
  }

  const sampledFrames = (job.frames ?? []).map((frame) => ({ id: frame.id || `frame_${frame.index}`, timestampSec: frame.timestampSec }));
  const coverage = computeCoverage({
    durationSec,
    segments: job.extractionSegments ?? [],
    sampledFrames,
    citedFrameIds: [...citedFrames],
    identityConfirmed,
    probe: job.videoProbe ?? null,
  });
  const cvVisibleSec = cvResults.reduce((sum, result) => sum + result.coverage.targetVisibleSec, 0);
  const evidence = observations.map((item) => ({
    id: item.id,
    kind: 'observation',
    label: item.label,
    detail: item.detail,
    category: item.category,
    confidence: item.confidence === 'medium' ? 0.5 : 0.3,
    timestampSec: item.timestampSec,
    source: 'segment-review',
    frameIds: [item.frameId],
  }));
  const decisionMoments = synthesis.decisionMoments;
  const report: Record<string, unknown> = {
    headline: synthesis.headline || (observations.length > 0 ? 'Segment review complete' : 'Not enough evidence yet'),
    strengths: identityConfirmed ? synthesis.strengths.map((item) => item.text) : [],
    improvements: identityConfirmed ? synthesis.improvements.map((item) => item.text) : [],
    coachingNotes: identityConfirmed ? synthesis.coachingNotes : '',
    opportunities: identityConfirmed ? synthesis.opportunities : [],
    decisionMoments: identityConfirmed ? decisionMoments : [],
    estimatedStats: emptyStats(),
    techniqueAssessment: technique,
    coverage: {
      visiblePct: cvResults.length > 0 && durationSec > 0 ? Math.round((cvVisibleSec / durationSec) * 100) : 0,
      likelyOffCameraPct: 0,
      unknownPct: cvResults.length > 0 && durationSec > 0 ? Math.max(0, 100 - Math.round((cvVisibleSec / durationSec) * 100)) : 100,
      confidenceLabel: coverage.sampledCoverage.confidenceLabel,
      note: cvResults.length > 0
        ? 'Visible time comes from the computer-vision tracker; the rest is unknown.'
        : 'Coverage is based on how many reviewed frames showed the nominated player. Time between frames is unknown without tracking.',
    },
    sampledCoverage: coverage.sampledCoverage,
    evidence,
    possibleEvents,
    eventCounts: validatedEventCount > 0
      ? Object.fromEntries(
        [...new Set(possibleEvents.filter((event) => event.status === 'validated').map((event) => event.type))].map((type) => [
          type,
          { count: possibleEvents.filter((event) => event.status === 'validated' && event.type === type).length, provenance: 'cv_worker' },
        ]),
      )
      : null,
    events: [],
    coachingMoments: [],
    moments: evidence.slice(0, 8).map((item) => ({ timestampSec: item.timestampSec, label: item.label, detail: item.detail })),
    segmentSummaries: reviews.map((review) => ({
      segmentIndex: review.segmentIndex,
      summary: review.summary,
      observationCount: review.observations.length,
      targetSeenFrames: review.frameStates.filter((item) => item.targetVisible === 'yes').length,
    })),
    pipelineStages: finalStages,
    segments: [],
    availability: cvResults.length > 0 ? reportWindowsFromCv(cvResults, durationSec) : coverage.availability,
    confidenceDimensions: coverage.confidenceDimensions,
    analysisMode: mode,
    versions: buildVersions({
      previous: job.report,
      mode,
      visionModel: reviews[0]?.modelId ?? resolveModel('vision'),
      reasoningModel: observations.length > 0 ? reasoningModel : null,
      cvWorkerVersion: cvResults[0]?.workerVersion ?? null,
    }),
    sections: buildSections({
      identityConfirmed,
      targetSeenFrames: seenFrames.length,
      ratedTechniqueCount: technique.ratedCount,
      decisionMoments: identityConfirmed ? decisionMoments.length : 0,
      isGoalkeeper: isGoalkeeperJob(job),
      goalkeeperNotes: observations.filter((item) => item.category === 'goalkeeping').length,
      validatedEventCount,
    }),
    tacticalSummary: 'Tactical shape and off-ball movement need continuous tracking, which this report does not have.',
    confidence: null,
    methodology:
      'Each part of the video was reviewed separately from extracted key frames, and the summary was written only from those frame-bound observations. Possible events are suggestions to check, never counted.',
    modelId: reviews[0]?.modelId ?? resolveModel('vision'),
    generatedAt: now,
  };
  const pendingCoaching: PendingCoaching | null = identityConfirmed || observations.length === 0
    ? null
    : {
      strengths: synthesis.strengths.map((item) => item.text),
      improvements: synthesis.improvements.map((item) => item.text),
      coachingNotes: synthesis.coachingNotes,
      techniqueAssessment: normalizeTechniqueAssessment(raw.techniqueAssessment, citedFrames, true, selfReported) as unknown as Record<string, unknown>,
      opportunities: synthesis.opportunities,
      decisionMoments,
      clipCoaching: null,
    };
  try {
    await finishJob(db, task.jobId, { report, stages: finalStages, pendingCoaching, now });
  } catch (error) {
    if (error instanceof HttpsError && error.code === 'aborted') return 'skipped';
    throw error;
  }
  return 'complete';
}

const TASK_RETRY = { maxAttempts: TASK_MAX_ATTEMPTS, minBackoffSeconds: 30, maxBackoffSeconds: 600 };

export const reviewMatchSegment = onTaskDispatched(
  {
    retryConfig: TASK_RETRY,
    rateLimits: { maxConcurrentDispatches: 6 },
    secrets: [openRouterApiKey],
    memory: '1GiB',
    timeoutSeconds: 900,
  },
  async (request) => {
    const task = parseAnalysisTask(request.data);
    if (!task || task.kind !== 'review_segment') return;
    await processReviewTask(getFirestore(), task, {
      finalAttempt: request.retryCount >= TASK_MAX_ATTEMPTS - 1,
      apiKey: openRouterApiKey.value(),
    });
  },
);

export const synthesizeMatchReport = onTaskDispatched(
  {
    retryConfig: TASK_RETRY,
    rateLimits: { maxConcurrentDispatches: 4 },
    secrets: [openRouterApiKey],
    memory: '1GiB',
    timeoutSeconds: 300,
  },
  async (request) => {
    const task = parseAnalysisTask(request.data);
    if (!task || task.kind !== 'synthesize_report') return;
    await processSynthesisTask(getFirestore(), task, {
      finalAttempt: request.retryCount >= TASK_MAX_ATTEMPTS - 1,
      apiKey: openRouterApiKey.value(),
    });
  },
);
