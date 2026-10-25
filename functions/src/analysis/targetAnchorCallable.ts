import { createHash } from 'node:crypto';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { createCallableOptions } from '../callableOptions';
import { MATCH_COLLECTION, type MatchJobDoc } from './frameAnalysis';
import { clearIdentityArtifacts, invalidatedTargetData } from './identityCallable';
import { VIDEO_CONSENT_COLLECTION, VIDEO_CONSENT_VERSION } from './videoConsent';
import { editTargetAnchors, parseTargetAnchorRequest, type ExperimentalTargetIdentity, type TargetAnchorRequest } from './targetAnchors';

export function targetAnchorsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.EXPERIMENTAL_TARGET_ANCHORS === 'true';
}

export async function applyTargetAnchor(
  db: Firestore, uid: string, request: TargetAnchorRequest,
): Promise<{ revision: number; generation: number }> {
  if (!targetAnchorsEnabled()) throw new HttpsError('failed-precondition', 'Target selection is not enabled.');
  const parsed = parseTargetAnchorRequest(request);
  if (!parsed) throw new HttpsError('invalid-argument', 'Invalid target anchor.');
  const digest = createHash('sha256').update(JSON.stringify(parsed)).digest('hex');
  const ref = db.collection(MATCH_COLLECTION).doc(parsed.jobId);
  const consentRef = db.collection(VIDEO_CONSENT_COLLECTION).doc(parsed.jobId);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const consent = await tx.get(consentRef);
    const priorEvidence = await tx.get(ref.collection('identityEvidence').doc('current'));
    const priorStaging = await tx.get(ref.collection('identityEvidenceStaging').doc('current'));
    if (!snapshot.exists) throw new HttpsError('not-found', 'Analysis not found.');
    const job = snapshot.data() as MatchJobDoc & { experimentalTargetIdentity?: ExperimentalTargetIdentity };
    if (job.playerId !== uid) throw new HttpsError('permission-denied', 'Only the owner can select a target.');
    if (!consent.exists || consent.get('uid') !== uid || consent.get('revokedAt') !== null
      || consent.get('policyVersion') !== VIDEO_CONSENT_VERSION) {
      throw new HttpsError('failed-precondition', 'Current video consent is required.');
    }
    if (job.status !== 'complete' || job.cancelRequested || job.videoStoragePath !== `profiles/${uid}/matchFootage/${parsed.jobId}/video.mp4`) {
      throw new HttpsError('failed-precondition', 'Select a target in a completed, retained cloud analysis.');
    }
    const current = job.experimentalTargetIdentity;
    const generation = job.pipelineGeneration ?? 0;
    if (!Number.isSafeInteger(generation) || generation < 0 || generation >= Number.MAX_SAFE_INTEGER
      || (current && (current.sourcePath !== job.videoStoragePath || current.schemaVersion !== 1
        || !Number.isSafeInteger(current.revision) || current.revision < 0 || current.revision >= Number.MAX_SAFE_INTEGER))) {
      throw new HttpsError('failed-precondition', 'Invalid target identity scope.');
    }
    if (current?.lastOperationId === parsed.operationId) {
      if (current.lastOperationDigest !== digest) throw new HttpsError('already-exists', 'Operation ID was reused.');
      return { revision: current.revision, generation };
    }
    if (generation !== parsed.expectedGeneration || (current?.revision ?? 0) !== parsed.expectedRevision) {
      throw new HttpsError('aborted', 'The analysis changed. Reload before selecting the target.');
    }
    const frame = job.frames.find((item) => (item.id ?? `frame_${item.index}`) === parsed.frameId);
    const duration = job.measuredDurationSec ?? job.durationSec;
    const framePrefix = `profiles/${uid}/matchFootage/${parsed.jobId}/frames/`;
    if (!frame || frame.source !== 'server' || !Number.isFinite(frame.timestampSec) || frame.timestampSec < 0
      || !Number.isFinite(duration) || duration <= 0 || frame.timestampSec >= duration
      || !frame.storagePath.startsWith(framePrefix) || !/^frame_[0-9]+\.jpg$/.test(frame.storagePath.slice(framePrefix.length))) {
      throw new HttpsError('invalid-argument', 'Select a retained server frame from this analysis.');
    }
    let anchors;
    try {
      anchors = editTargetAnchors(current?.anchors ?? [], parsed, frame.timestampSec);
    } catch {
      throw new HttpsError('invalid-argument', 'The target anchor limit or geometry is invalid.');
    }
    const now = new Date().toISOString();
    const identity: ExperimentalTargetIdentity = {
      schemaVersion: 1, targetId: `target_${parsed.jobId}`, sourcePath: job.videoStoragePath,
      revision: (current?.revision ?? 0) + 1, anchors, updatedAt: now,
      lastOperationId: parsed.operationId, lastOperationDigest: digest,
    };
    tx.update(ref, {
      experimentalTargetIdentity: identity,
      pipelineGeneration: generation + 1,
      identityConfirmation: { state: 'pending', frameIds: [], confirmedAt: null },
      identityRejection: null,
      pendingCoaching: null, lease: null, updatedAt: now,
      ...invalidatedTargetData(job.report),
    });
    clearIdentityArtifacts(tx, ref, priorEvidence.get('payloadParts'), priorStaging.get('payloadParts'));
    return { revision: identity.revision, generation: generation + 1 };
  });
}

export const saveAnalysisTargetAnchor = onCall(createCallableOptions(), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const parsed = parseTargetAnchorRequest(request.data);
  if (!parsed) throw new HttpsError('invalid-argument', 'Invalid target anchor.');
  return applyTargetAnchor(getFirestore(), uid, parsed);
});
