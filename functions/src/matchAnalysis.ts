import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { createCallableOptions } from './callableOptions';
import {
  MATCH_COLLECTION,
  MIN_ANALYSIS_FRAMES,
  pipelineStateOf,
  runFrameAnalysis,
  type MatchJobDoc,
} from './analysis/frameAnalysis';
import { startMatchPipeline } from './analysis/pipeline';
import { TERMINAL_PIPELINE_STATES, type PipelineState } from './analysis/stateMachine';
import { assertQuotaAvailable, consumeQuota, releaseQuota } from './entitlements/quotaService';
import { discardUploadsForJob } from './uploads/sessions';

const openRouterApiKey = defineSecret('OPENROUTER_API_KEY');

/** Cancelling before extraction or analysis started refunds the full-match allowance. */
const PRE_ANALYSIS_STATES: readonly PipelineState[] = ['created', 'uploading', 'validating', 'queued'];

function requireJobId(data: unknown): string {
  const jobId = (data as { jobId?: unknown } | null)?.jobId;
  if (!jobId || typeof jobId !== 'string') throw new HttpsError('invalid-argument', 'jobId is required.');
  return jobId;
}

/**
 * Runs (or re-runs) analysis for a job. Server-extracted jobs without enough frames restart
 * the extraction pipeline; jobs with frames (including the short-clip device fallback) are
 * analysed directly.
 */
export const analyzeMatchFootage = onCall(
  createCallableOptions({ secrets: [openRouterApiKey], timeoutSeconds: 300, memory: '1GiB' }),
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Authentication is required.');
    const jobId = requireJobId(request.data);
    const idempotencyKey =
      typeof (request.data as { idempotencyKey?: unknown }).idempotencyKey === 'string'
        ? (request.data as { idempotencyKey: string }).idempotencyKey
        : undefined;

    const db = getFirestore();
    const snap = await db.collection(MATCH_COLLECTION).doc(jobId).get();
    if (!snap.exists) throw new HttpsError('not-found', 'Match analysis job not found.');
    const job = snap.data() as MatchJobDoc;
    if (job.playerId !== uid) throw new HttpsError('permission-denied', 'You can only analyze your own footage.');

    const state = pipelineStateOf(job);
    if (job.videoStoragePath) {
      if (state === 'queued' || state === 'extracting') return { jobId, status: 'queued' as const };
      const frameCount = Array.isArray(job.frames) ? job.frames.length : 0;
      if (state === 'failed' && frameCount < MIN_ANALYSIS_FRAMES) {
        const outcome = await startMatchPipeline(db, jobId);
        if (outcome === 'queued') return { jobId, status: 'queued' as const };
        throw new HttpsError('unavailable', 'Analysis could not be queued. Try again later.', { reason: 'queue_unavailable' });
      }
    }

    const apiKey = openRouterApiKey.value();
    if (!apiKey) throw new HttpsError('failed-precondition', 'OpenRouter API key is not configured.');
    // Full-match jobs were charged at upload; clip-only jobs count as one frame analysis, charged
    // only once a report exists so failed runs never use up the allowance.
    const metered = !job.videoStoragePath;
    if (metered) await assertQuotaAvailable(db, uid, 'frame_analysis', jobId);
    const result = await runFrameAnalysis({
      db,
      uid,
      jobId,
      requestId: `${uid}:${jobId}:${Date.now()}`,
      idempotencyKey,
      apiKey,
    });
    if (metered) await consumeQuota(db, uid, 'frame_analysis', jobId).catch(() => undefined);
    return result;
  },
);

/** Owner-only cancel: stops uploads and workers; finished results are never altered. */
export const cancelMatchAnalysis = onCall(createCallableOptions(), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Authentication is required.');
  const jobId = requireJobId(request.data);
  const db = getFirestore();
  const jobRef = db.collection(MATCH_COLLECTION).doc(jobId);

  const outcome = await db.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Match analysis job not found.');
    const job = snap.data() as MatchJobDoc;
    if (job.playerId !== uid) throw new HttpsError('permission-denied', 'You can only cancel your own analysis.');
    const state = pipelineStateOf(job);
    if (TERMINAL_PIPELINE_STATES.includes(state)) return { status: String(job.status), refundable: false };
    tx.update(jobRef, {
      cancelRequested: true,
      status: 'cancelled',
      pipelineState: 'cancelled',
      cancelledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return { status: 'cancelled', refundable: PRE_ANALYSIS_STATES.includes(state) };
  });
  if (outcome.status === 'cancelled') await discardUploadsForJob(db, uid, jobId);
  if (outcome.refundable) await releaseQuota(db, uid, 'full_match_analysis', jobId);
  return { jobId, status: outcome.status };
});
