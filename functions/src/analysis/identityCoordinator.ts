import { createHash } from 'node:crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getFirestore, type Firestore, type Transaction, type DocumentReference } from 'firebase-admin/firestore';
import { createCallableOptions } from '../callableOptions';
import { isFootageProcessingApproved } from '../ai/providerConfig';
import { isConsentCurrent, type ConsentSummaryEntry } from '../legal/consent';
import { getUserSafetyPolicy } from '../safety/policy';
import { parseSafetyState } from '../safety/userSafety';
import { cvApproval, cvWorkerStatus, cvWorkerUrl, isApprovedWorkerOutput } from './cvConfig';
import { identityToken } from './cvWorker';
import { VIDEO_CONSENT_VERSION } from './videoConsent';
import { parseTargetBox, type ExperimentalTargetIdentity } from './targetAnchors';
import { parseSourceWitness, sourceVerifierFor, type RetainedSourceVerifier } from './identityEvidenceSource';

export type JsonRecord = Record<string, unknown>;
type Scope = { jobId: string; sourceSha256: string; generation: number; modelSetDigest: string };
export type CoordinatorRequest = { jobId: string; expectedGeneration: number; expectedAnchorRevision: number };
type Window = { startSec: number; endSec: number; state: 'UNKNOWN' | 'CONFIRMED_VISIBLE'; confidence: number };
export type CoordinatorSummary = {
  scope: Scope; windows: Window[]; associationMethod: 'fresh_local_jersey_and_kit';
  calibrated: false; continuousIdentityValidated: false;
};
export interface IdentityCoordinatorClient { resolve(payload: JsonRecord): Promise<unknown> }

function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const counter = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

function recordingSeconds(pts: number, numerator: number, denominator: number, originNumerator: number, originDenominator: number): number {
  const scaled = BigInt(pts) * BigInt(numerator) * BigInt(originDenominator)
    - BigInt(originNumerator) * BigInt(denominator);
  return Number(scaled) / Number(BigInt(denominator) * BigInt(originDenominator));
}

/** Metadata only. Chunk private producer output below Firestore's document limit. */
export function chunkCoordinatorArtifact(artifact: JsonRecord): { manifest: JsonRecord; parts: Array<{ id: string; payloadBase64: string }> } {
  const bytes = Buffer.from(JSON.stringify(artifact));
  if (bytes.length > 16 * 1024 * 1024) throw new Error('Identity evidence exceeds the bounded match budget');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const parts: Array<{ id: string; payloadBase64: string }> = [];
  for (let start = 0; start < bytes.length; start += 256 * 1024) {
    parts.push({ id: `part_${hash.slice(0, 16)}_${parts.length}`, payloadBase64: bytes.subarray(start, start + 256 * 1024).toString('base64') });
  }
  return { manifest: { schemaVersion: 1, payloadSha256: hash, payloadParts: parts.map((p) => p.id) }, parts };
}

export async function readPrivateIdentityArtifact(tx: Transaction, ref: DocumentReference): Promise<unknown> {
  const snapshot = await tx.get(ref);
  const head = snapshot.data();
  if (!head || !('payloadParts' in head)) return head;
  if (!Array.isArray(head.payloadParts) || head.payloadParts.length < 1 || head.payloadParts.length > 64
    || new Set(head.payloadParts).size !== head.payloadParts.length || !digest(head.payloadSha256)) return null;
  const parts: Buffer[] = [];
  let size = 0;
  for (const id of head.payloadParts) {
    if (typeof id !== 'string' || !/^part_[a-f0-9]{16}_[0-9]{1,2}$/.test(id)) return null;
    const part = await tx.get(ref.parent.doc(id));
    const encoded = part.get('payloadBase64');
    if (typeof encoded !== 'string' || encoded.length > 350000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return null;
    const bytes = Buffer.from(encoded, 'base64');
    size += bytes.length;
    if (size > 16 * 1024 * 1024) return null;
    parts.push(bytes);
  }
  const bytes = Buffer.concat(parts);
  if (createHash('sha256').update(bytes).digest('hex') !== head.payloadSha256) return null;
  try { return JSON.parse(bytes.toString('utf8')) as unknown; } catch { return null; }
}

export function parseCoordinatorRequest(value: unknown): CoordinatorRequest | null {
  if (!record(value) || Object.keys(value).length !== 3
    || Object.keys(value).some((key) => !['jobId', 'expectedGeneration', 'expectedAnchorRevision'].includes(key))
    || typeof value.jobId !== 'string' || !/^[A-Za-z0-9_-]{6,80}$/.test(value.jobId)
    || !counter(value.expectedGeneration) || !counter(value.expectedAnchorRevision)) return null;
  return { jobId: value.jobId, expectedGeneration: value.expectedGeneration, expectedAnchorRevision: value.expectedAnchorRevision };
}

/** Shared by publication and consumption; every check is repeated at commit. */
export async function readIdentityContext(tx: Transaction, db: Firestore, uid: string, request: CoordinatorRequest) {
  if (!parseCoordinatorRequest(request)) throw new HttpsError('invalid-argument', 'Invalid identity scope.');
  if (process.env.EXPERIMENTAL_TARGET_ANCHORS !== 'true' || cvWorkerStatus() !== 'available'
    || !isFootageProcessingApproved()) throw new HttpsError('failed-precondition', 'Identity coordination is not approved.');
  const ref = db.collection('matchAnalysisJobs').doc(request.jobId);
  const snap = await tx.get(ref);
  const video = await tx.get(db.collection('videoProcessingConsents').doc(request.jobId));
  const consent = await tx.get(db.collection('consentRecords').doc(uid));
  const safety = await tx.get(db.collection('userSafety').doc(uid));
  const job = snap.data();
  if (!job) throw new HttpsError('not-found', 'Analysis not found.');
  if (job.playerId !== uid) throw new HttpsError('permission-denied', 'Only the owner can coordinate this target.');
  if (job.pipelineGeneration !== request.expectedGeneration
    || job.experimentalTargetIdentity?.revision !== request.expectedAnchorRevision) throw new HttpsError('aborted', 'Target selection changed.');
  if (job.status !== 'complete' || job.cancelRequested || job.identityRejection
    || job.videoStoragePath !== `profiles/${uid}/matchFootage/${request.jobId}/video.mp4`) {
    throw new HttpsError('failed-precondition', 'A retained, completed analysis and current target are required.');
  }
  const entries = consent.get('consents') as Record<string, ConsentSummaryEntry> | undefined;
  const policy = getUserSafetyPolicy(parseSafetyState(safety.data())
    ?? { ageBand: '18plus', guardianStatus: 'not_required', scopes: [], consentExpiresAt: null });
  if (!isConsentCurrent(entries?.ai_analysis, 'ai_analysis') || !policy.canUseAiAnalysis
    || !video.exists || video.get('uid') !== uid || video.get('policyVersion') !== VIDEO_CONSENT_VERSION
    || video.get('revokedAt') !== null || video.get('processingMode') !== 'cloud_video'
    || !Array.isArray(video.get('providers')) || !video.get('providers').includes('pitchproof_cv_worker')) {
    throw new HttpsError('failed-precondition', 'Current AI, guardian and CV-worker video consent is required.');
  }
  const approval = cvApproval();
  if (!approval) throw new HttpsError('failed-precondition', 'An immutable worker approval is required.');
  return { ref, job, approval };
}

export function approvedModelDigest(models: Readonly<Record<string, string>>): string {
  return createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(models).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)))).digest('hex');
}

function scopeOf(value: unknown): Scope | null {
  if (!record(value) || Object.keys(value).length !== 4 || typeof value.jobId !== 'string'
    || !digest(value.sourceSha256) || !digest(value.modelSetDigest) || !counter(value.generation)) return null;
  return { jobId: value.jobId, sourceSha256: value.sourceSha256, generation: value.generation, modelSetDigest: value.modelSetDigest };
}
const sameScope = (a: Scope, b: Scope) => a.jobId === b.jobId && a.sourceSha256 === b.sourceSha256
  && a.generation === b.generation && a.modelSetDigest === b.modelSetDigest;

/** Only the trusted producer writes this private artifact; clients cannot supply evidence. */
export function coordinatorPayload(job: JsonRecord, artifact: unknown, request: CoordinatorRequest,
  models: Readonly<Record<string, string>>): { payload: JsonRecord; scope: Scope; duration: number; artifactDigest: string } | null {
  if (!record(artifact) || artifact.schemaVersion !== 1 || !record(artifact.evidence) || !record(artifact.sourceProof)) return null;
  const identity = job.experimentalTargetIdentity as ExperimentalTargetIdentity | undefined;
  const scope = scopeOf(artifact.evidence.scope);
  const proofScope = scopeOf(artifact.sourceProof.scope);
  if (!identity || !scope || !proofScope || !sameScope(scope, proofScope)
    || scope.jobId !== request.jobId || scope.generation !== request.expectedGeneration
    || scope.modelSetDigest !== approvedModelDigest(models)
    || artifact.generation !== request.expectedGeneration || artifact.anchorRevision !== request.expectedAnchorRevision
    || artifact.sourcePath !== job.videoStoragePath || identity.sourcePath !== job.videoStoragePath
    || identity.revision !== request.expectedAnchorRevision || !Array.isArray(identity.anchors) || identity.anchors.length === 0) return null;
  const evidence = artifact.evidence;
  const target = job.targeting;
  const duration = job.measuredDurationSec ?? job.durationSec;
  if (!record(target) || !record(evidence.target) || !/^[0-9]{1,2}$/.test(String(target.jerseyNumber))
    || evidence.target.jerseyNumber !== target.jerseyNumber || evidence.target.kitPrimaryColor !== target.kitPrimaryColor
    || (evidence.target.kitSecondaryColor ?? '') !== (target.kitSecondaryColor ?? '')
    || typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0 || duration > 9000
    || evidence.durationSec !== duration || artifact.sourceProof.schemaVersion !== 1
    || artifact.sourceProof.evidenceFormat !== 'rgb24-sha256' || !Array.isArray(artifact.sourceProof.frames)
    || artifact.sourceProof.frames.length === 0 || artifact.sourceProof.frames.length > 100008
    || !Array.isArray(evidence.references)
    || evidence.references.length !== identity.anchors.length || !Array.isArray(evidence.segments)) return null;
  const frames = new Map<number, JsonRecord>();
  const frameIds = new Set<string>();
  const frameIndexes = new Set<number>();
  const usedTimes = new Set<number>();
  let sourceOrigin: string | null = null;
  for (const frame of artifact.sourceProof.frames) {
    const originNumerator = record(frame) ? frame.originNumerator ?? 0 : undefined;
    const originDenominator = record(frame) ? frame.originDenominator ?? 1 : undefined;
    if (!record(frame) || typeof frame.frameId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(frame.frameId)
      || !counter(frame.frameIndex) || !Number.isSafeInteger(frame.framePts)
      || !counter(frame.timeBaseNumerator) || !counter(frame.timeBaseDenominator)
      || frame.timeBaseNumerator <= 0 || frame.timeBaseDenominator <= 0
      || !Number.isSafeInteger(originNumerator) || !counter(originDenominator) || originDenominator <= 0
      || typeof frame.timestampSec !== 'number' || !Number.isFinite(frame.timestampSec)
      || frame.timestampSec < 0 || frame.timestampSec >= duration || !digest(frame.evidenceHash)
      || !counter(frame.width) || !counter(frame.height) || frame.width <= 0 || frame.height <= 0
      || Math.abs(recordingSeconds(Number(frame.framePts), frame.timeBaseNumerator, frame.timeBaseDenominator,
        Number(originNumerator), originDenominator) - frame.timestampSec) > 1e-9
      || frames.has(frame.timestampSec) || frameIds.has(frame.frameId) || frameIndexes.has(frame.frameIndex)) return null;
    frames.set(frame.timestampSec, frame);
    frameIds.add(frame.frameId);
    frameIndexes.add(frame.frameIndex);
    const origin = `${originNumerator}/${originDenominator}`;
    if (sourceOrigin !== null && sourceOrigin !== origin) return null;
    sourceOrigin = origin;
  }
  for (const anchor of identity.anchors) {
    const refs = evidence.references.filter((value) => record(value) && value.anchorId === anchor.frameId);
    const ref = refs[0];
    const frame = frames.get(anchor.timestampSec);
    const refScope = record(ref) && scopeOf(ref.scope);
    const anchorBox = parseTargetBox(anchor.box);
    const refBox = record(ref) && parseTargetBox(ref.box);
    if (refs.length !== 1 || !record(ref) || ref.timestampSec !== anchor.timestampSec || !refScope || !sameScope(refScope, scope)
      || !digest(ref.evidenceHash) || !counter(ref.frameIndex) || !anchorBox || !refBox
      || JSON.stringify(refBox) !== JSON.stringify(anchorBox) || !frame
      || frame.frameId !== ref.anchorId || frame.frameIndex !== ref.frameIndex || frame.evidenceHash !== ref.evidenceHash) return null;
    usedTimes.add(anchor.timestampSec);
  }
  // Stored artifacts may retain only the independently supported target samples.
  // Non-target candidates must stay ephemeral in the worker, not in Firestore.
  for (const segment of evidence.segments) {
    if (!record(segment) || !Array.isArray(segment.tracklets)) return null;
    for (const track of segment.tracklets) {
      if (!record(track) || !Array.isArray(track.samples)) return null;
      for (const sample of track.samples) {
        if (!record(sample) || sample.jerseyRead !== target.jerseyNumber || typeof sample.teamMatch !== 'number'
          || !Number.isFinite(sample.teamMatch) || sample.teamMatch < 0.6 || sample.teamMatch > 1
          || typeof sample.jerseyConfidence !== 'number' || !Number.isFinite(sample.jerseyConfidence)
          || sample.jerseyConfidence < 0.6 || sample.jerseyConfidence > 1 || typeof sample.timestampSec !== 'number'
          || !Array.isArray(sample.box) || sample.box.length !== 4
          || !sample.box.every((n): n is number => typeof n === 'number' && Number.isFinite(n))) return null;
        const frame = frames.get(sample.timestampSec);
        const [x1, y1, x2, y2] = sample.box;
        if (!frame || x1 < 0 || y1 < 0 || x2 <= x1 || y2 <= y1 || x2 > Number(frame.width) || y2 > Number(frame.height)) return null;
        usedTimes.add(sample.timestampSec);
      }
    }
  }
  if (usedTimes.size !== frames.size) return null;
  const payload = { evidence, sourceProof: artifact.sourceProof };
  const encoded = JSON.stringify(payload);
  if (Buffer.byteLength(encoded, 'utf8') > 16 * 1024 * 1024) return null;
  return { payload, scope, duration, artifactDigest: createHash('sha256').update(encoded).digest('hex') };
}

/** Explicit allowlist: never persist raw tracklets, candidates, references or transport fields. */
export function parseCoordinatorSummary(value: unknown, scope: Scope, duration: number): CoordinatorSummary | null {
  if (!record(value) || !record(value.identity) || !record(value.models) || typeof value.workerVersion !== 'string') return null;
  const identity = value.identity;
  const actualScope = scopeOf(identity.scope);
  if (!actualScope || !sameScope(actualScope, scope) || identity.targetId !== scope.jobId
    || identity.calibrated !== false || identity.continuousIdentityValidated !== false
    || identity.associationMethod !== 'fresh_local_jersey_and_kit'
    || !Array.isArray(identity.windows) || identity.windows.length > 4096) return null;
  const windows: Window[] = [];
  let end = 0;
  for (const w of identity.windows) {
    if (!record(w) || typeof w.startSec !== 'number' || typeof w.endSec !== 'number' || typeof w.confidence !== 'number'
      || !Number.isFinite(w.startSec) || !Number.isFinite(w.endSec) || !Number.isFinite(w.confidence)
      || w.startSec !== end || w.endSec <= w.startSec || w.endSec > duration
      || !['UNKNOWN', 'CONFIRMED_VISIBLE'].includes(String(w.state)) || w.confidence < 0 || w.confidence > 1
      || (w.state === 'UNKNOWN' && w.confidence !== 0)) return null;
    windows.push({ startSec: w.startSec, endSec: w.endSec, state: w.state as Window['state'], confidence: w.confidence });
    end = w.endSec;
  }
  if (end !== duration) return null;
  if (Buffer.byteLength(JSON.stringify(windows), 'utf8') > 384 * 1024) return null;
  return { scope, windows, associationMethod: 'fresh_local_jersey_and_kit', calibrated: false, continuousIdentityValidated: false };
}

function httpClient(url: string): IdentityCoordinatorClient {
  return { async resolve(payload) {
    const emulated = process.env.FUNCTIONS_EMULATOR === 'true' || Boolean(process.env.FIRESTORE_EMULATOR_HOST);
    const token = emulated ? null : await identityToken(url);
    if (!emulated && !token) throw new HttpsError('unavailable', 'Private coordinator authorization is unavailable.');
    const response = await fetch(`${url}/v2/matches:resolve-identity`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(30000) });
    if (!response.ok || Number(response.headers.get('content-length')) > 2 * 1024 * 1024) {
      throw new HttpsError('unavailable', 'Identity coordinator is unavailable.');
    }
    return response.json() as Promise<unknown>;
  } };
}

export async function coordinateTargetIdentity(db: Firestore, uid: string, request: CoordinatorRequest,
  testClient?: IdentityCoordinatorClient, testSource?: RetainedSourceVerifier): Promise<CoordinatorSummary> {
  const ref = db.collection('matchAnalysisJobs').doc(request.jobId);
  const artifactRef = ref.collection('identityEvidence').doc('current');
  const read = (commit?: { artifactDigest: string; sourceKey: string; summary: CoordinatorSummary; workerVersion: string; models: Record<string, string> }) => db.runTransaction(async (tx) => {
    const { job, approval } = await readIdentityContext(tx, db, uid, request);
    const head = await tx.get(artifactRef);
    const artifact = await readPrivateIdentityArtifact(tx, artifactRef);
    const binding = coordinatorPayload(job, artifact, request, approval.models);
    if (!binding) throw new HttpsError('failed-precondition', 'Verified source/PTS evidence is required; legacy frames cannot be guessed.');
    const staged: unknown = head.get('trustedStaging');
    let sourceKey = '';
    if (staged !== undefined) {
      const source = record(staged) ? parseSourceWitness(staged.source) : null;
      if (!record(staged) || staged.schemaVersion !== 1 || !source || source.sha256 !== binding.scope.sourceSha256
        || staged.workerVersion !== approval.workerVersion || staged.generation !== request.expectedGeneration
        || staged.anchorRevision !== request.expectedAnchorRevision || staged.sourcePath !== job.videoStoragePath
        || staged.artifactSha256 !== head.get('payloadSha256')) throw new HttpsError('failed-precondition', 'Staging receipt is invalid.');
      const actual = await sourceVerifierFor(testSource).version(String(job.videoStoragePath));
      if (actual.generation !== source.generation || actual.sizeBytes !== source.sizeBytes) throw new HttpsError('aborted', 'The retained source changed.');
      sourceKey = JSON.stringify({ source, workerVersion: staged.workerVersion, generation: staged.generation,
        anchorRevision: staged.anchorRevision, sourcePath: staged.sourcePath, artifactSha256: staged.artifactSha256 });
    }
    if (commit) {
      if (binding.artifactDigest !== commit.artifactDigest || sourceKey !== commit.sourceKey) throw new HttpsError('aborted', 'Source evidence changed.');
      if (!isApprovedWorkerOutput({ workerVersion: commit.workerVersion, models: commit.models })) {
        throw new HttpsError('aborted', 'Worker approval changed.');
      }
      const marker = { scope: commit.summary.scope, anchorRevision: request.expectedAnchorRevision,
        workerVersion: commit.workerVersion, models: commit.models, calibrated: false,
        continuousIdentityValidated: false, windowCount: commit.summary.windows.length, updatedAt: new Date().toISOString() };
      tx.set(ref.collection('identityCoordination').doc('current'), { ...commit.summary, ...marker });
      tx.update(ref, { experimentalIdentityCoordination: marker });
    }
    return { ...binding, sourceKey };
  });
  const before = await read();
  const emulated = process.env.FUNCTIONS_EMULATOR === 'true' || Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  const client = emulated && testClient ? testClient : httpClient(cvWorkerUrl()!);
  const raw = await client.resolve(before.payload);
  const summary = parseCoordinatorSummary(raw, before.scope, before.duration);
  const models = record(raw) && record(raw.models) && Object.values(raw.models).every((v) => typeof v === 'string')
    ? raw.models as Record<string, string> : null;
  if (!summary || !record(raw) || typeof raw.workerVersion !== 'string' || !models
    || !isApprovedWorkerOutput({ workerVersion: raw.workerVersion, models })) {
    throw new HttpsError('unavailable', 'The coordinator output is not an approved, scoped result.');
  }
  const evidence = before.payload.evidence as JsonRecord;
  const identity = raw.identity as JsonRecord;
  const actualTarget = record(identity.target) ? identity.target : null;
  const expectedTarget = evidence.target as JsonRecord;
  if (!actualTarget || ['jerseyNumber', 'kitPrimaryColor', 'kitSecondaryColor'].some((key) =>
    (actualTarget[key] ?? '') !== (expectedTarget[key] ?? ''))) throw new HttpsError('unavailable', 'Coordinator target mismatch.');
  // The same transactional guard runs after the network round trip; no TOCTOU
  // gap permits stale anchors, withdrawal or a changed approval to commit.
  await read({ artifactDigest: before.artifactDigest, sourceKey: before.sourceKey, summary, workerVersion: raw.workerVersion, models });
  return summary;
}

export const coordinateAnalysisTarget = onCall(createCallableOptions(), async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const parsed = parseCoordinatorRequest(request.data);
  if (!parsed) throw new HttpsError('invalid-argument', 'Supply the current target generation and revision.');
  return coordinateTargetIdentity(getFirestore(), request.auth.uid, parsed);
});
