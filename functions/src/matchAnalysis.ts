import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { createCallableOptions } from './callableOptions';

const openRouterApiKey = defineSecret('OPENROUTER_API_KEY');

const MATCH_COLLECTION = 'matchAnalysisJobs';

type MatchJobDoc = {
  playerId: string;
  status: string;
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
    index: number;
    timestampSec: number;
    storagePath: string;
    downloadUrl: string;
  }>;
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

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function normalizePipelineStages(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [
      { id: 'video-ingestion', label: 'Preparing video', status: 'complete' },
      { id: 'match-segmentation', label: 'Finding match segments', status: 'pending' },
      { id: 'player-identification', label: 'Identifying players', status: 'pending' },
      { id: 'player-tracking', label: 'Tracking player', status: 'pending' },
      { id: 'event-detection', label: 'Analyzing movements', status: 'pending' },
      { id: 'tactical-context', label: 'Analyzing decisions', status: 'pending' },
      { id: 'role-analysis', label: 'Assessing role execution', status: 'pending' },
      { id: 'cross-event-reasoning', label: 'Connecting key events', status: 'pending' },
      { id: 'coaching-synthesis', label: 'Building coaching feedback', status: 'pending' },
      { id: 'validation', label: 'Validating evidence', status: 'pending' },
      { id: 'final-report', label: 'Finalizing report', status: 'pending' },
    ];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const row = item as Record<string, unknown>;
      return {
        id: typeof row.id === 'string' ? row.id : 'final-report',
        label: typeof row.label === 'string' ? row.label : 'Analysis stage',
        status:
          row.status === 'active' || row.status === 'complete' || row.status === 'failed'
            ? row.status
            : 'pending',
        note: typeof row.note === 'string' ? row.note : undefined,
      };
    })
    .filter(Boolean) as Array<Record<string, unknown>>;
}

function normalizeSegments(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const row = item as Record<string, unknown>;
      return {
        id: typeof row.id === 'string' ? row.id : 'segment',
        type: typeof row.type === 'string' ? row.type : 'unknown',
        label: typeof row.label === 'string' ? row.label : 'Match segment',
        startSec: Math.max(0, Math.round(asNumber(row.startSec))),
        endSec: Math.max(0, Math.round(asNumber(row.endSec))),
        confidence: Math.max(0, Math.min(1, asNumber(row.confidence, 0))),
        excludedFromPerformance: Boolean(row.excludedFromPerformance),
        note: typeof row.note === 'string' ? row.note : '',
      };
    })
    .filter(Boolean) as Array<Record<string, unknown>>;
}

function normalizeAvailability(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const row = item as Record<string, unknown>;
      return {
        id: typeof row.id === 'string' ? row.id : 'availability-window',
        startSec: Math.max(0, Math.round(asNumber(row.startSec))),
        endSec: Math.max(0, Math.round(asNumber(row.endSec))),
        state:
          row.state === 'confirmed_visible' ||
          row.state === 'likely_active_off_camera' ||
          row.state === 'confirmed_off_pitch'
            ? row.state
            : 'unknown',
        confidence: Math.max(0, Math.min(1, asNumber(row.confidence, 0))),
        label: typeof row.label === 'string' ? row.label : 'Availability',
        note: typeof row.note === 'string' ? row.note : '',
      };
    })
    .filter(Boolean) as Array<Record<string, unknown>>;
}

function clampTimestamp(value: unknown, durationSec: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.round(value);
  if (rounded < 0 || (durationSec > 0 && rounded > durationSec)) {
    return null;
  }
  return rounded;
}

/**
 * Missing model fields become explicit "unknown" values (0 / empty) rather than plausible
 * defaults, so the report never shows numbers the model did not produce.
 */
function normalizeReport(
  raw: Record<string, unknown>,
  modelId: string,
  durationSec: number,
): Record<string, unknown> {
  const statsRaw =
    raw.estimatedStats && typeof raw.estimatedStats === 'object' && !Array.isArray(raw.estimatedStats)
      ? (raw.estimatedStats as Record<string, unknown>)
      : {};

  const passesAttempted = Math.max(0, Math.round(asNumber(statsRaw.passesAttempted)));
  const passesCompleted = Math.max(
    0,
    Math.min(passesAttempted, Math.round(asNumber(statsRaw.passesCompleted))),
  );
  const passCompletionPct =
    passesAttempted > 0
      ? Math.round((passesCompleted / passesAttempted) * 100)
      : Math.max(0, Math.min(100, Math.round(asNumber(statsRaw.passCompletionPct))));

  const shots = Math.max(0, Math.round(asNumber(statsRaw.shots)));
  const shotsOnTarget = Math.max(
    0,
    Math.min(shots, Math.round(asNumber(statsRaw.shotsOnTarget))),
  );

  const moments = Array.isArray(raw.moments)
    ? raw.moments
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null;
          }
          const row = item as Record<string, unknown>;
          const timestampSec = clampTimestamp(row.timestampSec, durationSec);
          if (timestampSec === null) {
            return null;
          }
          return {
            timestampSec,
            label: typeof row.label === 'string' ? row.label : 'Moment',
            detail: typeof row.detail === 'string' ? row.detail : '',
          };
        })
        .filter(Boolean)
    : [];

  const coverageRaw =
    raw.coverage && typeof raw.coverage === 'object' && !Array.isArray(raw.coverage)
      ? (raw.coverage as Record<string, unknown>)
      : {};

  const evidence = Array.isArray(raw.evidence)
    ? raw.evidence
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null;
          }
          const row = item as Record<string, unknown>;
          return {
            kind:
              row.kind === 'inference' || row.kind === 'unknown' ? row.kind : 'observation',
            label: typeof row.label === 'string' ? row.label : 'Evidence',
            detail: typeof row.detail === 'string' ? row.detail : '',
            confidence: Math.max(0, Math.min(1, asNumber(row.confidence, 0))),
            timestampSec: clampTimestamp(row.timestampSec, durationSec) ?? undefined,
            source: typeof row.source === 'string' ? row.source : 'analysis',
          };
        })
        .filter(Boolean)
    : [];

  const coverage = {
    visiblePct: Math.max(0, Math.min(100, Math.round(asNumber(coverageRaw.visiblePct, 0)))),
    likelyOffCameraPct: Math.max(
      0,
      Math.min(100, Math.round(asNumber(coverageRaw.likelyOffCameraPct, 0))),
    ),
    unknownPct: Math.max(0, Math.min(100, Math.round(asNumber(coverageRaw.unknownPct, 100)))),
    confidenceLabel:
      coverageRaw.confidenceLabel === 'Excellent' ||
      coverageRaw.confidenceLabel === 'Good' ||
      coverageRaw.confidenceLabel === 'Limited' ||
      coverageRaw.confidenceLabel === 'Insufficient'
        ? coverageRaw.confidenceLabel
        : 'Limited',
    note:
      typeof coverageRaw.note === 'string'
        ? coverageRaw.note
        : 'Coverage and player availability are conservative estimates based on visible frames only.',
  };

  return {
    headline: typeof raw.headline === 'string' ? raw.headline : 'Match analysis complete',
    strengths: asStringArray(raw.strengths).slice(0, 6),
    improvements: asStringArray(raw.improvements).slice(0, 6),
    coachingNotes: typeof raw.coachingNotes === 'string' ? raw.coachingNotes : '',
    estimatedStats: {
      minutesPlayed: Math.max(
        0,
        Math.min(
          durationSec > 0 ? Math.ceil(durationSec / 60) : 150,
          Math.round(asNumber(statsRaw.minutesPlayed, 0)),
        ),
      ),
      goals: Math.max(0, Math.round(asNumber(statsRaw.goals))),
      assists: Math.max(0, Math.round(asNumber(statsRaw.assists))),
      shots,
      shotsOnTarget,
      passesAttempted,
      passesCompleted,
      passCompletionPct,
      keyPasses: Math.max(0, Math.round(asNumber(statsRaw.keyPasses))),
      tackles: Math.max(0, Math.round(asNumber(statsRaw.tackles))),
      duelsWon: Math.max(0, Math.round(asNumber(statsRaw.duelsWon))),
      duelsLost: Math.max(0, Math.round(asNumber(statsRaw.duelsLost))),
      foulsCommitted: Math.max(0, Math.round(asNumber(statsRaw.foulsCommitted))),
      yellowCards: Math.max(0, Math.round(asNumber(statsRaw.yellowCards))),
      redCards: Math.max(0, Math.round(asNumber(statsRaw.redCards))),
      // 0 means "not rated"; ratings are only kept when the model returned one in range.
      matchRating:
        typeof statsRaw.matchRating === 'number' &&
        statsRaw.matchRating >= 1 &&
        statsRaw.matchRating <= 10
          ? Number(statsRaw.matchRating.toFixed(1))
          : 0,
      cleanSheet: Boolean(statsRaw.cleanSheet),
    },
    coverage,
    evidence,
    moments,
    pipelineStages: normalizePipelineStages(raw.pipelineStages),
    segments: normalizeSegments(raw.segments),
    availability: normalizeAvailability(raw.availability),
    tacticalSummary:
      typeof raw.tacticalSummary === 'string'
        ? raw.tacticalSummary
        : 'Analysis is evidence-first and avoids fabricating player actions when the footage is incomplete.',
    confidence: Math.max(0, Math.min(1, asNumber(raw.confidence, 0))),
    methodology:
      typeof raw.methodology === 'string'
        ? raw.methodology
        : 'Vision model reviewed evenly sampled frames and counted only events clearly involving the nominated jersey.',
    modelId,
    generatedAt: new Date().toISOString(),
  };
}

const MAX_FRAME_BYTES = 1.8 * 1024 * 1024;

/**
 * Reads a frame from the owner's own job folder via the Admin SDK. Client-supplied
 * download URLs are never fetched (they could point at other users' files or internal hosts).
 */
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

    const jobId = (request.data as { jobId?: string } | null)?.jobId;
    if (!jobId || typeof jobId !== 'string') {
      throw new HttpsError('invalid-argument', 'jobId is required.');
    }

    const apiKey = openRouterApiKey.value();
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'OpenRouter API key is not configured.');
    }

    const jobRef = getFirestore().collection(MATCH_COLLECTION).doc(jobId);
    const snap = await jobRef.get();
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Match analysis job not found.');
    }

    const job = snap.data() as MatchJobDoc;
    if (job.playerId !== request.auth.uid) {
      throw new HttpsError('permission-denied', 'You can only analyze your own footage.');
    }

    await jobRef.set(
      { status: 'processing', updatedAt: new Date().toISOString(), error: null },
      { merge: true },
    );

    const model =
      process.env.OPENROUTER_VISION_MODEL?.trim() ||
      process.env.OPENROUTER_MODEL?.trim() ||
      'google/gemini-2.0-flash-001';
    const baseUrl = process.env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1';

    const candidateFrames = (Array.isArray(job.frames) ? job.frames : []).slice(0, 18);
    const imageContents: Array<{ type: 'image_url'; image_url: { url: string } }> = [];
    // Only frames that actually loaded are described to the model, so image numbers and
    // timestamps stay aligned.
    const frameSamples: Array<{ timestampSec: number }> = [];

    for (const frame of candidateFrames) {
      if (typeof frame?.timestampSec !== 'number' || !Number.isFinite(frame.timestampSec)) {
        continue;
      }
      const dataUrl = await readOwnedFrameAsDataUrl(request.auth.uid, jobId, frame.storagePath);
      if (dataUrl) {
        imageContents.push({ type: 'image_url', image_url: { url: dataUrl } });
        frameSamples.push({ timestampSec: frame.timestampSec });
      }
    }

    if (imageContents.length < 3) {
      await jobRef.set(
        {
          status: 'failed',
          error: 'Not enough readable frames to analyze.',
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      throw new HttpsError('failed-precondition', 'Not enough readable frames to analyze.');
    }

    const frameIndexGuide = frameSamples
      .map((frame, index) => `Image ${index + 1}: ~${frame.timestampSec}s into the match`)
      .join('\n');

    const systemPrompt = [
      'You are ScoutX Match Analyst, a professional football coach and performance analyst.',
      'You ONLY evaluate ONE nominated player visible in the provided still frames from a match film.',
      'Ignore all other players except when they interact directly with the target.',
      'Never fabricate player actions, identity, position, movement, or match events.',
      'If the player is off-camera, substituted, or the jersey is unreadable, prefer "insufficient evidence" over a made-up event.',
      'Separate observation, inference, and unknown clearly in the report.',
      'When uncertain, under-count rather than over-count and lower confidence.',
      'Return STRICT JSON only.',
    ].join(' ');

    const userText = [
      'Analyze this amateur/prosumer match footage for ONE player only.',
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
      '1) Locate #jersey using kit colors whenever possible.',
      '2) Report player availability and coverage, with explicit note when the player is off-camera or the footage is insufficient.',
      '3) Estimate countable match stats for THAT player only across the visible/active periods, not by inventing a full 90-minute performance when footage is incomplete.',
      '4) Produce coaching feedback specific to that player and call out uncertainty when needed.',
      '',
      'JSON schema:',
      JSON.stringify({
        headline: 'string',
        strengths: ['string'],
        improvements: ['string'],
        coachingNotes: 'string',
        estimatedStats: {
          minutesPlayed: 0,
          goals: 0,
          assists: 0,
          shots: 0,
          shotsOnTarget: 0,
          passesAttempted: 0,
          passesCompleted: 0,
          passCompletionPct: 0,
          keyPasses: 0,
          tackles: 0,
          duelsWon: 0,
          duelsLost: 0,
          foulsCommitted: 0,
          yellowCards: 0,
          redCards: 0,
          matchRating: 6.5,
          cleanSheet: false,
        },
        coverage: {
          visiblePct: 0,
          likelyOffCameraPct: 0,
          unknownPct: 0,
          confidenceLabel: 'Limited',
          note: 'string',
        },
        evidence: [{
          kind: 'observation',
          label: 'string',
          detail: 'string',
          confidence: 0.0,
          timestampSec: 0,
          source: 'string',
        }],
        moments: [{ timestampSec: 0, label: 'string', detail: 'string' }],
        confidence: 0.0,
        methodology: 'string',
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
        asNumber(job.durationSec, 0),
      );
      await jobRef.set(
        {
          status: 'complete',
          report,
          completedAt: report.generatedAt,
          updatedAt: new Date().toISOString(),
          error: null,
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
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      throw new HttpsError('internal', 'AI response could not be parsed.');
    }
  },
);
