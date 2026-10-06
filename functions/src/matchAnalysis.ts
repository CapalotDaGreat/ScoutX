import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { createCallableOptions } from './callableOptions';
import { canAcquireLease, canTransitionJob, type JobStatus } from './analysis/stateMachine';
import { normalizeObservations } from './analysis/validation';
import {
  ANALYSIS_DAILY_QUOTA,
  ANALYSIS_LEASE_MS,
  ANALYSIS_MAX_ATTEMPTS,
  CV_UNAVAILABLE_REASON,
  isCvWorkerStage,
} from './analysis/workerContract';

const openRouterApiKey = defineSecret('OPENROUTER_API_KEY');

const MATCH_COLLECTION = 'matchAnalysisJobs';
const QUOTA_COLLECTION = 'analysisQuotas';

type MatchJobDoc = {
  playerId: string;
  status: JobStatus | string;
  targeting: {
    jerseyNumber: string;
    kitPrimaryColor: string;
    kitSecondaryColor: string;
    teamSide?: string;
    notes?: string;
  };
  match: {
    opponent: string;
    competition: string;
    date: string;
    result?: string;
  };
  durationSec: number;
  frames: Array<{
    id?: string;
    index: number;
    timestampSec: number;
    storagePath: string;
    downloadUrl: string;
  }>;
  idempotencyKey?: string;
  lease?: { holder: string; until: string };
  attempts?: number;
  cancelRequested?: boolean;
  identityConfirmation?: { state?: string };
};

type OpenRouterChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

function extractJsonFromModelText(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const parsed = JSON.parse(candidate) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI response was not a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
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

function honestPipelineStages(identityConfirmed: boolean): Array<Record<string, unknown>> {
  return [
    { id: 'video-ingestion', label: 'Preparing video', status: 'complete' },
    {
      id: 'match-segmentation',
      label: 'Finding match segments',
      status: 'unavailable',
      note: CV_UNAVAILABLE_REASON,
    },
    {
      id: 'player-identification',
      label: 'Identifying players in sampled frames',
      status: 'complete',
    },
    {
      id: 'identity-confirmation',
      label: 'Confirm this is you',
      status: identityConfirmed ? 'complete' : 'pending',
    },
    {
      id: 'player-tracking',
      label: 'Continuous player tracking',
      status: 'unavailable',
      note: CV_UNAVAILABLE_REASON,
    },
    {
      id: 'event-detection',
      label: 'Computer-vision event detection',
      status: 'unavailable',
      note: CV_UNAVAILABLE_REASON,
    },
    {
      id: 'tactical-context',
      label: 'Tactical phase and pitch mapping',
      status: 'unavailable',
      note: CV_UNAVAILABLE_REASON,
    },
    {
      id: 'role-analysis',
      label: 'Role execution from tracking',
      status: 'unavailable',
      note: CV_UNAVAILABLE_REASON,
    },
    {
      id: 'cross-event-reasoning',
      label: 'Connecting detected events',
      status: 'unavailable',
      note: 'No validated event stream exists until event detection is available.',
    },
    { id: 'coaching-synthesis', label: 'Building coaching feedback', status: 'complete' },
    { id: 'validation', label: 'Validating evidence', status: 'complete' },
    { id: 'final-report', label: 'Finalizing report', status: 'complete' },
  ];
}

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function normalizeReport(
  raw: Record<string, unknown>,
  modelId: string,
  durationSec: number,
  frameIds: string[],
  identityConfirmed: boolean,
): Record<string, unknown> {
  const knownFrameIds = new Set(frameIds);
  const observations = normalizeObservations(raw.observations ?? raw.evidence, knownFrameIds, durationSec);

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

  const coachingNotes =
    typeof raw.coachingNotes === 'string' && identityConfirmed && evidence.some((item) => item.kind === 'observation')
      ? raw.coachingNotes
      : '';

  const strengths = identityConfirmed ? asStringArray(raw.strengths).slice(0, 6) : [];
  const improvements = identityConfirmed ? asStringArray(raw.improvements).slice(0, 6) : [];

  const identifiedFrameCount = new Set(observations.map((item) => item.frameId)).size;
  let overallCoverage: 'Excellent' | 'Good' | 'Limited' | 'Insufficient' = 'Insufficient';
  if (identifiedFrameCount >= 8) {
    overallCoverage = 'Good';
  } else if (identifiedFrameCount >= 3) {
    overallCoverage = 'Limited';
  }

  return {
    headline:
      typeof raw.headline === 'string' && raw.headline.trim()
        ? raw.headline
        : identifiedFrameCount > 0
          ? 'Sampled-frame review complete'
          : 'Not enough evidence yet',
    strengths,
    improvements,
    coachingNotes,
    estimatedStats: emptyStats(),
    coverage: {
      visiblePct: 0,
      likelyOffCameraPct: 0,
      unknownPct: 100,
      confidenceLabel: overallCoverage,
      note: 'Coverage is based on how many sampled frames cited the nominated player. Percentages of the full match are unknown without tracking.',
    },
    sampledCoverage: {
      sampledFrameCount: frameIds.length,
      identifiedFrameCount,
      confidenceLabel: overallCoverage,
    },
    evidence,
    events: [],
    coachingMoments: [],
    moments: evidence
      .filter((item) => item.kind === 'observation')
      .slice(0, 8)
      .map((item) => ({
        timestampSec: item.timestampSec,
        label: item.label,
        detail: item.detail,
      })),
    pipelineStages: honestPipelineStages(identityConfirmed).map((stage) => {
      if (typeof stage.id === 'string' && isCvWorkerStage(stage.id)) {
        return { ...stage, status: 'unavailable', note: CV_UNAVAILABLE_REASON };
      }
      return stage;
    }),
    segments: [],
    availability: [],
    confidenceDimensions: {
      videoQuality: frameIds.length >= 6 ? 'Limited' : 'Insufficient',
      playerIdentity: identityConfirmed ? 'Limited' : 'Insufficient',
      cameraCoverage: overallCoverage,
      trackingStability: 'Insufficient',
      eventConfidence: 'Insufficient',
      overallCoverage,
    },
    tacticalSummary:
      'Tracking, pitch maps and event detection are unavailable. Coaching is limited to observations bound to sampled frames.',
    confidence: null,
    methodology:
      'Vision model reviewed sampled still frames only. Countable match stats stay unknown until a computer-vision worker produces validated events.',
    modelId,
    generatedAt: new Date().toISOString(),
  };
}

const MAX_FRAME_BYTES = 1.8 * 1024 * 1024;

async function readOwnedFrameAsDataUrl(
  uid: string,
  jobId: string,
  storagePath: unknown,
): Promise<string | null> {
  const prefix = `profiles/${uid}/matchFootage/${jobId}/frames/`;
  if (
    typeof storagePath !== 'string' ||
    !storagePath.startsWith(prefix) ||
    storagePath.includes('..')
  ) {
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
    logger.warn('Failed to read frame', {
      jobId,
      message: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
}

async function acquireJobLease(
  uid: string,
  jobId: string,
  requestId: string,
  idempotencyKey: string | undefined,
): Promise<MatchJobDoc> {
  const db = getFirestore();
  const jobRef = db.collection(MATCH_COLLECTION).doc(jobId);
  const quotaRef = db.collection(QUOTA_COLLECTION).doc(uid);
  const now = new Date();
  const nowMs = now.getTime();
  const day = utcDay(now);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Match analysis job not found.');
    }
    const job = snap.data() as MatchJobDoc;
    if (job.playerId !== uid) {
      throw new HttpsError('permission-denied', 'You can only analyze your own footage.');
    }
    if (job.cancelRequested) {
      throw new HttpsError('aborted', 'Analysis was cancelled.');
    }
    if (job.status === 'complete') {
      throw new HttpsError('already-exists', 'This analysis is already complete.');
    }
    if (idempotencyKey && job.idempotencyKey && job.idempotencyKey !== idempotencyKey) {
      throw new HttpsError('failed-precondition', 'Idempotency key does not match this job.');
    }

    const status = (job.status as JobStatus) || 'queued';
    if (!canTransitionJob(status, 'processing') && status !== 'processing') {
      throw new HttpsError('failed-precondition', `Job cannot move from ${status} to processing.`);
    }
    if (!canAcquireLease(job.lease, requestId, nowMs)) {
      throw new HttpsError('aborted', 'Another analysis run holds this job.');
    }

    const attempts = typeof job.attempts === 'number' ? job.attempts : 0;
    if (attempts >= ANALYSIS_MAX_ATTEMPTS) {
      throw new HttpsError('resource-exhausted', 'Retry limit reached for this job.');
    }

    const quotaSnap = await tx.get(quotaRef);
    const quota = quotaSnap.data() as { day?: string; count?: number } | undefined;
    const count = quota?.day === day && typeof quota.count === 'number' ? quota.count : 0;
    if (count >= ANALYSIS_DAILY_QUOTA) {
      throw new HttpsError('resource-exhausted', 'Daily match-analysis quota reached.');
    }

    tx.set(
      jobRef,
      {
        status: 'processing',
        attempts: attempts + 1,
        lease: { holder: requestId, until: new Date(nowMs + ANALYSIS_LEASE_MS).toISOString() },
        updatedAt: now.toISOString(),
        error: null,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      },
      { merge: true },
    );
    tx.set(quotaRef, { day, count: count + 1, updatedAt: now.toISOString() }, { merge: true });
    return job;
  });
}

export const analyzeMatchFootage = onCall(
  createCallableOptions({
    secrets: [openRouterApiKey],
    timeoutSeconds: 300,
    memory: '1GiB',
  }),
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const payloadIn = (request.data as { jobId?: string; idempotencyKey?: string } | null) ?? {};
    const jobId = payloadIn.jobId;
    if (!jobId || typeof jobId !== 'string') {
      throw new HttpsError('invalid-argument', 'jobId is required.');
    }
    const idempotencyKey =
      typeof payloadIn.idempotencyKey === 'string' ? payloadIn.idempotencyKey : undefined;
    const requestId = `${request.auth.uid}:${jobId}:${Date.now()}`;

    const apiKey = openRouterApiKey.value();
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'OpenRouter API key is not configured.');
    }

    const jobRef = getFirestore().collection(MATCH_COLLECTION).doc(jobId);
    let job: MatchJobDoc;
    try {
      job = await acquireJobLease(request.auth.uid, jobId, requestId, idempotencyKey);
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Could not acquire analysis lease.');
    }

    const model =
      process.env.OPENROUTER_VISION_MODEL?.trim() ||
      process.env.OPENROUTER_MODEL?.trim() ||
      'google/gemini-2.0-flash-001';
    const baseUrl = process.env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1';

    const candidateFrames = (Array.isArray(job.frames) ? job.frames : []).slice(0, 18);
    const imageContents: Array<{ type: 'image_url'; image_url: { url: string } }> = [];
    const frameSamples: Array<{ id: string; timestampSec: number }> = [];

    for (const [index, frame] of candidateFrames.entries()) {
      if (typeof frame?.timestampSec !== 'number' || !Number.isFinite(frame.timestampSec)) {
        continue;
      }
      const dataUrl = await readOwnedFrameAsDataUrl(request.auth.uid, jobId, frame.storagePath);
      if (dataUrl) {
        const id = typeof frame.id === 'string' && frame.id ? frame.id : `frame_${frame.index ?? index}`;
        imageContents.push({ type: 'image_url', image_url: { url: dataUrl } });
        frameSamples.push({ id, timestampSec: frame.timestampSec });
      }
    }

    if (imageContents.length < 3) {
      await jobRef.set(
        {
          status: 'failed',
          error: 'Not enough readable frames to analyze.',
          lease: null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      throw new HttpsError('failed-precondition', 'Not enough readable frames to analyze.');
    }

    const frameIndexGuide = frameSamples
      .map((frame, index) => `Image ${index + 1} (frameId=${frame.id}): ${frame.timestampSec}s into the recording`)
      .join('\n');

    const identityConfirmed = job.identityConfirmation?.state === 'confirmed';

    const systemPrompt = [
      'You are ScoutX Match Analyst.',
      'You ONLY describe what is visible in the provided still frames.',
      'Never fabricate player actions, identity, position, movement, match events, or countable stats.',
      'Do not count passes, shots, tackles, or minutes.',
      'If the jersey is unreadable or the player is not in the frame, say so.',
      'Every observation MUST cite a frameId from the timeline guide.',
      'Return STRICT JSON only.',
    ].join(' ');

    const userText = [
      'Review sampled still frames for ONE nominated player.',
      `Target jersey number: #${job.targeting.jerseyNumber}`,
      `Kit colors: primary ${job.targeting.kitPrimaryColor}, secondary ${job.targeting.kitSecondaryColor}`,
      `Team side hint: ${job.targeting.teamSide ?? 'unknown'}`,
      `Match: vs ${job.match.opponent} (${job.match.competition}) on ${job.match.date}`,
      `Video duration seconds: ${job.durationSec}`,
      job.targeting.notes ? `Player notes: ${job.targeting.notes}` : '',
      '',
      'Frame timeline guide:',
      frameIndexGuide,
      '',
      'Tasks:',
      '1) For each frame, report whether the nominated jersey is visible.',
      '2) Describe only visible actions, bound to frameId.',
      '3) Do not estimate match stats or a rating.',
      identityConfirmed ? '4) Identity was confirmed by the player for selected frames.' : '4) Identity is not confirmed.',
      '',
      'JSON schema:',
      JSON.stringify({
        headline: 'string',
        strengths: ['string'],
        improvements: ['string'],
        coachingNotes: 'string',
        observations: [{
          frameId: 'frame_0',
          timestampSec: 0,
          kind: 'observation',
          label: 'string',
          detail: 'string',
        }],
      }),
    ]
      .filter(Boolean)
      .join('\n');

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://scoutx.app',
        'X-Title': 'ScoutX Match Analysis',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [{ type: 'text', text: userText }, ...imageContents],
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    });

    const payload = (await response.json()) as OpenRouterChatResponse;
    if (!response.ok) {
      logger.error('OpenRouter vision request failed', { status: response.status, payload });
      await jobRef.set(
        {
          status: 'failed',
          error: payload.error?.message ?? `Vision request failed (${response.status})`,
          lease: null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      throw new HttpsError(
        'internal',
        payload.error?.message ?? `Vision request failed (${response.status}).`,
      );
    }

    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      await jobRef.set(
        {
          status: 'failed',
          error: 'Empty vision model response',
          lease: null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      throw new HttpsError('internal', 'Vision model returned an empty response.');
    }

    try {
      const report = normalizeReport(
        extractJsonFromModelText(content),
        model,
        typeof job.durationSec === 'number' ? job.durationSec : 0,
        frameSamples.map((frame) => frame.id),
        identityConfirmed,
      );
      await jobRef.set(
        {
          status: 'complete',
          report,
          events: [],
          completedAt: report.generatedAt,
          updatedAt: new Date().toISOString(),
          error: null,
          lease: null,
          pipelineStages: report.pipelineStages,
        },
        { merge: true },
      );

      return {
        jobId,
        status: 'complete' as const,
      };
    } catch (error) {
      logger.error('Failed to parse match analysis JSON', { error, content });
      await jobRef.set(
        {
          status: 'failed',
          error: 'AI response could not be parsed',
          lease: null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      throw new HttpsError('internal', 'AI response could not be parsed.');
    }
  },
);
