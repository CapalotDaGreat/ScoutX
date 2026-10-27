/**
 * 5.0 callable: explain one confirmed clip (see videoReasoning.ts for the rules). Returns
 *   { status: 'answered', answer, cached }       - validated model answer (or cached one)
 *   { status: 'unavailable', reason }            - a gate failed; nothing was sent anywhere
 *   { status: 'rejected', reason }               - the model's answer failed validation; not shown
 * The app always keeps the clip and the deterministic evidence; this is an optional extra.
 */
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { assertAiConsent } from '../ai/consentGate';
import { callChat, type ChatResult } from '../ai/openRouter';
import { isFootageProcessingApproved, resolveModel, type ChatMessage } from '../ai/providerConfig';
import { createCallableOptions } from '../callableOptions';
import { assertCallableRateLimit, VIDEO_REASONING_LIMIT } from '../security/rateLimit';
import { cvWorkerUrl } from './cvConfig';
import { MATCH_COLLECTION, type MatchJobDoc } from './frameAnalysis';
import { httpTrackingClient, type TrackingWorkerClient } from './trackingCallables';
import { TRACKING_COLLECTION, type TrackingReport } from './trackingV3';
import { readableSourceFor } from '../uploads/mediaSource';
import { VIDEO_CONSENT_COLLECTION, VIDEO_CONSENT_VERSION } from './videoConsent';
import {
  MAX_FRAMES, REASONING_KINDS, buildReasoningMessages, clipFacts, clipWindow, frameTimes, reasoningCacheId, reasoningGate,
  validateReasoning, type ReasonedAnswer, type ReasoningKind,
} from './videoReasoning';

const openRouterApiKey = defineSecret('OPENROUTER_API_KEY');
const JOB_ID = /^[A-Za-z0-9_-]{1,80}$/;
const MOMENT_ID = /^[A-Za-z0-9_-]{1,40}$/;

export type ReasoningDeps = {
  db: Firestore;
  env: NodeJS.ProcessEnv;
  aiConsent: (uid: string) => Promise<boolean>;
  frames: TrackingWorkerClient;
  chat: (messages: ChatMessage[]) => Promise<ChatResult>;
  /** short-lived signed URL for the job's source (only the worker reads it) */
  sourceUrl: (storagePath: string) => Promise<string>;
  now: () => string;
};

export type ReasoningResponse =
  | { status: 'answered'; answer: ReasonedAnswer; cached: boolean; clip: { start: number; end: number } }
  | { status: 'unavailable'; reason: string }
  | { status: 'rejected'; reason: string };

export async function explainMoment(uid: string, jobId: string, momentId: string, kind: ReasoningKind,
  deps: ReasoningDeps): Promise<ReasoningResponse> {
  const { db } = deps;
  const jobSnap = await db.collection(MATCH_COLLECTION).doc(jobId).get();
  if (!jobSnap.exists) throw new HttpsError('not-found', 'Analysis not found.');
  const job = jobSnap.data() as MatchJobDoc;
  if (job.playerId !== uid) throw new HttpsError('permission-denied', 'Only the owner can use this.');
  const base = db.collection(MATCH_COLLECTION).doc(jobId).collection(TRACKING_COLLECTION);
  const cur = await base.doc('current').get();
  const report = (cur.get('report') ?? null) as TrackingReport | null;
  const version = Number(cur.get('version') ?? 0);
  if (!report || cur.get('stale') === true) return { status: 'unavailable', reason: 'report_not_current' };
  const moment = (report.moments ?? []).find((m) => m.id === momentId) ?? null;
  const vc = await db.collection(VIDEO_CONSENT_COLLECTION).doc(jobId).get();
  const gate = reasoningGate({
    env: deps.env,
    footageApproved: isFootageProcessingApproved(deps.env),
    aiConsent: await deps.aiConsent(uid),
    videoConsent: vc.exists && vc.get('uid') === uid
      ? { providers: (vc.get('providers') as string[] | undefined) ?? [], revokedAt: vc.get('revokedAt') ?? null,
          current: vc.get('policyVersion') === VIDEO_CONSENT_VERSION }
      : null,
    moment,
  });
  if (!gate.ok) return { status: 'unavailable', reason: gate.reason };
  const m = moment!;
  const cacheRef = base.doc(reasoningCacheId(version, momentId, kind));
  const cached = await cacheRef.get();
  const clip = clipWindow(m);
  if (cached.exists && cached.get('status') === 'answered') {
    return { status: 'answered', answer: cached.get('answer') as ReasonedAnswer, cached: true, clip };
  }
  const times = frameTimes(clip, MAX_FRAMES);
  if (!job.videoStoragePath) return { status: 'unavailable', reason: 'source_unavailable' };
  const sourceUrl = await deps.sourceUrl(job.videoStoragePath).catch(() => null);
  if (!sourceUrl) return { status: 'unavailable', reason: 'source_unavailable' };
  const raw = await deps.frames({ contractVersion: 3, jobId, source: { url: sourceUrl }, times, indicator: m.indicator ?? [], maxWidth: 640,
    privacy: { retainNonTargetIdentities: false, faceRecognition: false, persistMedia: false } }) as
    { frames?: Array<{ id?: unknown; t?: unknown; jpegBase64?: unknown }> } | null;
  const frames = (raw?.frames ?? []).filter((f): f is { id: string; t: number; jpegBase64: string } =>
    typeof f.id === 'string' && /^f\d$/.test(f.id) && typeof f.t === 'number' && f.t >= clip.start - 0.5 && f.t <= clip.end + 0.5
    && typeof f.jpegBase64 === 'string' && f.jpegBase64.length < 400_000).slice(0, MAX_FRAMES);
  if (frames.length < 2) return { status: 'unavailable', reason: 'frames_unavailable' };
  const ctx = { number: report.target.number, kit: report.target.kit, position: report.target.position, kind, clip,
    frames: frames.map((f) => ({ id: f.id, t: f.t })), facts: clipFacts(report, m, clip) };
  const result = await deps.chat(buildReasoningMessages(ctx, frames.map((f) => f.jpegBase64)));
  if (!result.ok) return { status: 'unavailable', reason: result.kind === 'upstream' ? 'provider_unavailable' : 'provider_empty' };
  const v = validateReasoning(result.content, ctx);
  // Store the outcome (answer or rejection reason) - never the frames or the raw model text.
  await cacheRef.set({ status: v.ok ? 'answered' : 'rejected', answer: v.ok ? v.answer : null, reason: v.ok ? null : v.reason,
    kind, momentId, reportVersion: version, clip, provider: 'openrouter_zdr', createdAt: deps.now(), purpose: 'this_match_only' });
  return v.ok ? { status: 'answered', answer: v.answer, cached: false, clip } : { status: 'rejected', reason: v.reason };
}

export const explainTrackingMoment = onCall(createCallableOptions({ secrets: [openRouterApiKey], timeoutSeconds: 180 }), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const d = (request.data ?? {}) as { jobId?: unknown; momentId?: unknown; kind?: unknown };
  if (typeof d.jobId !== 'string' || !JOB_ID.test(d.jobId) || typeof d.momentId !== 'string' || !MOMENT_ID.test(d.momentId)
    || !REASONING_KINDS.includes(d.kind as ReasoningKind)) {
    throw new HttpsError('invalid-argument', 'Invalid request.');
  }
  await assertCallableRateLimit(uid, VIDEO_REASONING_LIMIT);
  const db = getFirestore();
  const workerUrl = cvWorkerUrl();
  return explainMoment(uid, d.jobId, d.momentId, d.kind as ReasoningKind, {
    db,
    env: process.env,
    aiConsent: async (u) => assertAiConsent([u], db).then(() => true, () => false),
    frames: workerUrl ? httpTrackingClient(workerUrl, process.env, 'clipFrames', 60_000) : async () => null,
    chat: async (messages) => {
      const apiKey = openRouterApiKey.value();
      if (!apiKey) return { ok: false, kind: 'upstream', status: 0 };
      return callChat({ apiKey, model: resolveModel('vision'), messages, title: 'PitchProof clip explanation', temperature: 0.1 });
    },
    sourceUrl: async (p) => (await readableSourceFor(p, 10 * 60 * 1000)).url,
    now: () => new Date().toISOString(),
  });
});
