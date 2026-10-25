import { randomUUID } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { chunkCoordinatorArtifact, coordinatorPayload, readIdentityContext, readPrivateIdentityArtifact,
  type CoordinatorRequest, type JsonRecord } from './identityCoordinator';
import { validateEvidenceRunBundle } from './identityEvidenceValidation';
import { parseSourceWitness, sourceVerifierFor, type RetainedSourceVerifier, type SourceWitness } from './identityEvidenceSource';

export type EvidenceRunBundle = Parameters<typeof validateEvidenceRunBundle>[1];
export type StagingReceipt = { status: 'staged' | 'already_staged'; artifactSha256: string; segmentCount: number; partCount: number };
const LEASE_MS = 20 * 60 * 1000;
const BATCH_PARTS = 8;
const isRecord = (value: unknown): value is JsonRecord => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Privileged producer API only. Intentionally NOT exported as a callable/HTTP import. */
export async function stageTrustedIdentityEvidence(db: Firestore, uid: string, request: CoordinatorRequest,
  rawArtifact: unknown, bundle: EvidenceRunBundle, testSource?: RetainedSourceVerifier): Promise<StagingReceipt> {
  let artifact: unknown;
  try {
    const encoded = JSON.stringify(rawArtifact);
    if (!encoded || Buffer.byteLength(encoded) > 16 * 1024 * 1024) throw new Error('Invalid metadata size');
    artifact = JSON.parse(encoded) as unknown;
  } catch { throw new HttpsError('invalid-argument', 'A bounded JSON evidence artifact is required.'); }
  const run = validateEvidenceRunBundle(artifact, bundle);
  if (!run || !isRecord(artifact)) throw new HttpsError('invalid-argument', 'A complete, target-only verified run is required.');
  const stableArtifact = artifact;
  const { manifest, parts } = chunkCoordinatorArtifact(stableArtifact);
  const hash = String(manifest.payloadSha256);
  const source = sourceVerifierFor(testSource);
  const jobRef = db.collection('matchAnalysisJobs').doc(request.jobId);
  const headRef = jobRef.collection('identityEvidence').doc('current');
  const leaseRef = jobRef.collection('identityEvidenceStaging').doc('current');
  const token = randomUUID();
  const receipt = (status: StagingReceipt['status']): StagingReceipt => ({ status, artifactSha256: hash,
    segmentCount: run.segmentCount, partCount: parts.length });
  const guarded = async (tx: Transaction) => {
    const context = await readIdentityContext(tx, db, uid, request);
    if (run.workerVersion !== context.approval.workerVersion
      || !coordinatorPayload(context.job, artifact, request, context.approval.models)) {
      throw new HttpsError('failed-precondition', 'The run does not match current approved evidence.');
    }
    return context;
  };
  const initial = await db.runTransaction(async (tx) => {
    const context = await guarded(tx);
    const head = await tx.get(headRef);
    const lease = await tx.get(leaseRef);
    if (head.exists) {
      const previous = head.get('trustedStaging') as unknown;
      const witness = isRecord(previous) ? parseSourceWitness(previous.source) : null;
      if (!isRecord(previous) || previous.schemaVersion !== 1 || previous.artifactSha256 !== hash
        || head.get('payloadSha256') !== hash || !witness || witness.sha256 !== run.sourceSha256
        || previous.workerVersion !== run.workerVersion || previous.generation !== request.expectedGeneration
        || previous.anchorRevision !== request.expectedAnchorRevision || previous.sourcePath !== artifact.sourcePath) {
        throw new HttpsError('already-exists', 'Current evidence cannot be overwritten; start a new target revision.');
      }
      const loaded = await readPrivateIdentityArtifact(tx, headRef);
      if (!coordinatorPayload(context.job, loaded, request, context.approval.models)
        || JSON.stringify(loaded) !== JSON.stringify(artifact)) throw new HttpsError('failed-precondition', 'Existing evidence is corrupt.');
      const actual = await source.version(String(artifact.sourcePath));
      if (actual.generation !== witness.generation || actual.sizeBytes !== witness.sizeBytes) {
        throw new HttpsError('aborted', 'The retained source changed.');
      }
      return false;
    }
    if (lease.exists && typeof lease.get('expiresAtMs') === 'number' && lease.get('expiresAtMs') > Date.now()) {
      throw new HttpsError('aborted', 'A producer is already staging this target.');
    }
    const abandoned: unknown = lease.get('payloadParts');
    if (Array.isArray(abandoned) && abandoned.length <= 64) for (const id of abandoned) {
      if (typeof id === 'string' && /^part_[a-f0-9]{16}_[0-9]{1,2}$/.test(id)) tx.delete(headRef.parent.doc(id));
    }
    tx.set(leaseRef, { token, artifactSha256: hash, generation: request.expectedGeneration,
      anchorRevision: request.expectedAnchorRevision, payloadParts: parts.map((part) => part.id),
      status: 'staging', expiresAtMs: Date.now() + LEASE_MS });
    return true;
  });
  if (!initial) return receipt('already_staged');
  const checkpoint = () => db.runTransaction(async (tx) => {
    await guarded(tx);
    const lease = await tx.get(leaseRef);
    if (lease.get('token') !== token || lease.get('artifactSha256') !== hash || lease.get('expiresAtMs') <= Date.now()) {
      throw new HttpsError('aborted', 'Staging ownership changed.');
    }
  });
  try {
    const witness = parseSourceWitness(await source.verify(String(artifact.sourcePath), checkpoint));
    if (!witness || witness.sha256 !== run.sourceSha256) throw new HttpsError('failed-precondition', 'Retained source SHA-256 does not match the run.');
    for (let start = 0; start < parts.length; start += BATCH_PARTS) {
      const batch = parts.slice(start, start + BATCH_PARTS);
      await db.runTransaction(async (tx) => {
        await guarded(tx);
        const lease = await tx.get(leaseRef);
        const head = await tx.get(headRef);
        const stored = await tx.getAll(...batch.map((part) => headRef.parent.doc(part.id)));
        if (head.exists || lease.get('token') !== token || lease.get('expiresAtMs') <= Date.now()) {
          throw new HttpsError('aborted', 'Staging scope changed.');
        }
        for (const [index, part] of batch.entries()) {
          if (stored[index].exists) {
            if (stored[index].get('payloadBase64') !== part.payloadBase64) throw new HttpsError('already-exists', 'An immutable evidence chunk differs.');
          } else tx.create(stored[index].ref, { payloadBase64: part.payloadBase64 });
        }
        tx.update(leaseRef, { stagedParts: start + batch.length });
      });
    }
    await db.runTransaction(async (tx) => {
      await guarded(tx);
      const lease = await tx.get(leaseRef);
      const head = await tx.get(headRef);
      const stored = await tx.getAll(...parts.map((part) => headRef.parent.doc(part.id)));
      if (head.exists || lease.get('token') !== token || lease.get('expiresAtMs') <= Date.now()
        || lease.get('stagedParts') !== parts.length || stored.some((doc, i) => doc.get('payloadBase64') !== parts[i].payloadBase64)) {
        throw new HttpsError('aborted', 'Evidence publication changed.');
      }
      const actual = await source.version(String(artifact.sourcePath));
      if (actual.generation !== witness.generation || actual.sizeBytes !== witness.sizeBytes) {
        throw new HttpsError('aborted', 'The retained source changed during staging.');
      }
      tx.create(headRef, { ...manifest, trustedStaging: stagingStamp(witness, run.workerVersion,
        request, String(artifact.sourcePath), hash) });
      tx.update(leaseRef, { status: 'complete', expiresAtMs: 0 });
    });
    return receipt('staged');
  } catch (error) {
    // Only this lease owner can clean its immutable chunks. A resumed producer
    // may be reusing them; never delete a different owner's in-progress data.
    await db.runTransaction(async (tx) => {
      const lease = await tx.get(leaseRef);
      const head = await tx.get(headRef);
      if (lease.exists && lease.get('token') !== token || head.exists) return;
      for (const part of parts) tx.delete(headRef.parent.doc(part.id));
      if (lease.get('token') === token) tx.delete(leaseRef);
    }).catch(() => undefined);
    throw error;
  }
}

function stagingStamp(source: SourceWitness, workerVersion: string, request: CoordinatorRequest, sourcePath: string, artifactSha256: string) {
  return { schemaVersion: 1, source, workerVersion, sourcePath, artifactSha256,
    generation: request.expectedGeneration, anchorRevision: request.expectedAnchorRevision, stagedAt: new Date().toISOString() };
}
