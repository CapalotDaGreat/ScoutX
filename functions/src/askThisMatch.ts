import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { createCallableOptions } from './callableOptions';
import { NOT_ENOUGH_EVIDENCE } from './analysis/askThisMatch';
import { cleanModelText, timestampWithin } from './ai/outputValidator';
import { assertCallableRateLimit, ASK_THIS_MATCH_LIMIT } from './security/rateLimit';

type Citation = {
  evidenceId: string;
  label: string;
  kind: 'event' | 'observation' | 'coaching';
  timestampSec: number | null;
  detail?: string;
};

type JobDoc = {
  playerId?: string;
  durationSec?: number;
  measuredDurationSec?: number;
  events?: unknown;
  report?: {
    evidence?: unknown;
    coachingMoments?: unknown;
  };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * Reasons only over stored events / evidence on an owned job.
 * Insufficient stored data returns a fixed state and never calls a language model.
 */
export const askThisMatch = onCall(createCallableOptions({}), async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }

  const data = asRecord(request.data);
  const jobId = typeof data?.jobId === 'string' ? data.jobId : '';
  const question = typeof data?.question === 'string' ? data.question.trim() : '';
  if (!jobId || !question) {
    throw new HttpsError('invalid-argument', 'jobId and question are required.');
  }
  if (question.length > 400) {
    throw new HttpsError('invalid-argument', 'Question is too long.');
  }

  await assertCallableRateLimit(request.auth.uid, ASK_THIS_MATCH_LIMIT);

  const snap = await getFirestore().collection('matchAnalysisJobs').doc(jobId).get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Match analysis job not found.');
  }
  const job = snap.data() as JobDoc;
  if (job.playerId !== request.auth.uid) {
    throw new HttpsError('permission-denied', 'You can only ask about your own analysis.');
  }

  const durationSec = job.measuredDurationSec ?? job.durationSec ?? 0;
  const events = Array.isArray(job.events) ? job.events : [];
  const evidence = Array.isArray(job.report?.evidence) ? job.report.evidence : [];
  const coachingMoments = Array.isArray(job.report?.coachingMoments)
    ? job.report.coachingMoments
    : [];

  const acceptedEvents = events.filter((item) => {
    const row = asRecord(item);
    return row?.validationStatus === 'accepted';
  });
  const observations = evidence.filter((item) => {
    const row = asRecord(item);
    return row?.kind === 'observation';
  });
  const moments = coachingMoments.filter((item) => {
    const row = asRecord(item);
    return Array.isArray(row?.evidenceRefs) && row.evidenceRefs.length > 0;
  });

  if (acceptedEvents.length === 0 && observations.length === 0 && moments.length === 0) {
    return {
      state: 'insufficient' as const,
      answer: NOT_ENOUGH_EVIDENCE,
      citations: [] as Citation[],
    };
  }

  const q = question.toLowerCase();
  const citations: Citation[] = [];
  const lines: string[] = [];

  for (const item of acceptedEvents) {
    const row = asRecord(item);
    if (!row) {
      continue;
    }
    const type = typeof row.type === 'string' ? row.type : 'event';
    const eventId = typeof row.eventId === 'string' ? row.eventId : type;
    const blob = `${type} ${typeof row.tacticalPhase === 'string' ? row.tacticalPhase : ''}`.toLowerCase();
    if (q.split(/\s+/).some((token) => token.length >= 3 && blob.includes(token))) {
      lines.push(`Recorded ${type}.`);
      citations.push({
        evidenceId: eventId,
        label: type,
        kind: 'event',
        timestampSec: timestampWithin(row.videoTimestampSec, durationSec),
      });
    }
  }

  for (const item of observations) {
    const row = asRecord(item);
    if (!row) {
      continue;
    }
    const label = cleanModelText(row.label, 80) || 'Observation';
    const detail = cleanModelText(row.detail, 400);
    const blob = `${label} ${detail}`.toLowerCase();
    if (q.split(/\s+/).some((token) => token.length >= 3 && blob.includes(token))) {
      lines.push(detail || label);
      citations.push({
        evidenceId: typeof row.id === 'string' ? row.id : label,
        label,
        kind: 'observation',
        timestampSec: timestampWithin(row.timestampSec, durationSec),
        detail: detail || label,
      });
    }
  }

  for (const item of moments) {
    const row = asRecord(item);
    if (!row) {
      continue;
    }
    const point = cleanModelText(row.coachingPoint, 400);
    const context = cleanModelText(row.context, 400);
    const blob = `${context} ${point}`.toLowerCase();
    if (point && q.split(/\s+/).some((token) => token.length >= 3 && blob.includes(token))) {
      lines.push(point);
      citations.push({
        evidenceId: typeof row.id === 'string' ? row.id : point.slice(0, 40),
        label: point.slice(0, 80),
        kind: 'coaching',
        timestampSec: timestampWithin(row.timestampSec, durationSec),
        detail: point,
      });
    }
  }

  if (lines.length === 0) {
    return {
      state: 'insufficient' as const,
      answer: NOT_ENOUGH_EVIDENCE,
      citations: [],
    };
  }

  return {
    state: 'answered' as const,
    answer: lines.slice(0, 6).join(' '),
    citations: citations.slice(0, 8),
  };
});
