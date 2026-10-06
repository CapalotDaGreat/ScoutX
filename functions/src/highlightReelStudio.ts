import { getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { createCallableOptions } from './callableOptions';

export type HighlightReelGenerationRequest = {
  jobId?: string;
  preset?: 'best-of' | 'scout' | 'social' | 'tactical' | 'development';
  targetDurationSec?: number;
};

export type HighlightReelGenerationResult = {
  status: 'ready' | 'insufficient-evidence';
  preset: string;
  title: string;
  targetDurationSec: number;
  candidates: Array<{
    id: string;
    title: string;
    eventType: string;
    confidence: number;
    timestampSec: number;
  }>;
};

type StoredMatchAnalysisJob = {
  playerId?: string;
  report?: {
    moments?: Array<{ label?: string; detail?: string; timestampSec?: number }>;
    confidence?: number;
  };
};

export const generateHighlightReelPlan = onCall(createCallableOptions(), async (request) => {
  const auth = request.auth;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Authentication is required to generate a highlight reel.');
  }

  const body = (request.data ?? {}) as HighlightReelGenerationRequest;
  const jobId = body.jobId;
  const preset = body.preset ?? 'best-of';
  const targetDurationSec = Math.max(30, body.targetDurationSec ?? 45);

  if (!jobId) {
    return {
      status: 'insufficient-evidence',
      preset,
      title: 'No match analysis available',
      targetDurationSec,
      candidates: [],
    } satisfies HighlightReelGenerationResult;
  }

  const jobSnapshot = await getFirestore().collection('matchAnalysisJobs').doc(jobId).get();
  if (!jobSnapshot.exists) {
    throw new HttpsError('not-found', 'Match analysis not found.');
  }
  const job = jobSnapshot.data() as StoredMatchAnalysisJob | undefined;
  if (job?.playerId !== auth.uid) {
    throw new HttpsError('permission-denied', 'You can only build reels from your own matches.');
  }

  const reportConfidence = job.report?.confidence;
  // Only moments with a real timestamp and a model confidence become reel candidates.
  const moments =
    typeof reportConfidence === 'number'
      ? (job.report?.moments ?? [])
          .filter(
            (moment): moment is { label?: string; detail?: string; timestampSec: number } =>
              typeof moment.timestampSec === 'number' && Number.isFinite(moment.timestampSec),
          )
          .map((moment, index) => ({
            id: `moment-${index}`,
            title: moment.label ?? 'Match moment',
            eventType: moment.label?.toLowerCase().includes('goal') ? 'Goal' : 'Match action',
            confidence: reportConfidence,
            timestampSec: moment.timestampSec,
          }))
      : [];

  if (!moments.length) {
    return {
      status: 'insufficient-evidence',
      preset,
      title: 'No reliable moments detected',
      targetDurationSec,
      candidates: [],
    } satisfies HighlightReelGenerationResult;
  }

  return {
    status: 'ready',
    preset,
    title: preset === 'social' ? 'Social short-form reel' : 'Evidence-based match story',
    targetDurationSec,
    candidates: moments.slice(0, 6),
  } satisfies HighlightReelGenerationResult;
});
