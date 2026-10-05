import { getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

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

export const generateHighlightReelPlan = onCall(async (request) => {
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
  const job = jobSnapshot.data() as { report?: { moments?: Array<{ label?: string; detail?: string; timestampSec?: number }>; confidence?: number } } | undefined;

  const moments = (job?.report?.moments ?? []).map((moment, index) => ({
    id: `moment-${index}`,
    title: moment.label ?? 'Match moment',
    eventType: moment.label?.toLowerCase().includes('goal') ? 'Goal' : 'Match action',
    confidence: typeof job?.report?.confidence === 'number' ? job.report.confidence : 0.65,
    timestampSec: moment.timestampSec ?? index * 15,
  }));

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
