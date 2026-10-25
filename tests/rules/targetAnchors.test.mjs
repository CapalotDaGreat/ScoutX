import { afterEach, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PROJECT_ID, isDenied, setDocument } from './emulator.mjs';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { applyTargetAnchor, saveAnalysisTargetAnchor } = require('./lib/analysis/targetAnchorCallable.js');
const { VIDEO_CONSENT_VERSION, revokeVideoProcessingConsent } = require('./lib/analysis/videoConsent.js');
const coordinator = require('./lib/analysis/identityCoordinator.js');
const { setEmulatorCvApproval } = require('./lib/analysis/cvConfig.js');
const { LEGAL_VERSIONS } = require('./lib/legal/legalVersions.generated.js');
const uid = 'target-anchor-owner';
const jobId = 'target-anchor-job';
let db;
let ref;
afterEach(() => {
  setEmulatorCvApproval(null);
  delete process.env.CV_WORKER_URL;
  delete process.env.CV_WORKER_APPROVED;
});
const call = (owner, data) => ({ data, auth: { uid: owner, token: {} }, rawRequest: { headers: {} }, acceptsStreaming: false });
const edit = (patch = {}) => ({
  jobId, frameId: 'frame_1', operationId: 'operation-12345678', operation: 'upsert',
  expectedGeneration: 0, expectedRevision: 0, box: { x: 0.2, y: 0.1, width: 0.2, height: 0.7 }, ...patch,
});
const code = (expected) => (error) => { assert.equal(error.code, expected); return true; };

before(() => {
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
  db = getFirestore();
  ref = db.collection('matchAnalysisJobs').doc(jobId);
});
beforeEach(async () => {
  process.env.EXPERIMENTAL_TARGET_ANCHORS = 'true';
  await db.recursiveDelete(ref);
  await ref.set({
    id: jobId, playerId: uid, status: 'complete', pipelineState: 'completed', pipelineGeneration: 0,
    durationSec: 300, measuredDurationSec: 300,
    videoStoragePath: `profiles/${uid}/matchFootage/${jobId}/video.mp4`,
    frames: [{ id: 'frame_1', index: 1, timestampSec: 242, source: 'server', storagePath: `profiles/${uid}/matchFootage/${jobId}/frames/frame_1.jpg` }],
    report: { strengths: ['stale'], events: [{ id: 'old' }], estimatedStats: { goals: 2 }, evidence: [{ id: 'old' }] },
    pendingCoaching: { strengths: ['old'] }, identityConfirmation: { state: 'confirmed', frameIds: ['frame_1'] },
    events: [{ eventId: 'stale', validationStatus: 'accepted' }],
  });
  await db.collection('videoProcessingConsents').doc(jobId).set({
    uid, jobId, policyVersion: VIDEO_CONSENT_VERSION, revokedAt: null,
  });
});

test('anchors are gated and owner/consent protected', async () => {
  delete process.env.EXPERIMENTAL_TARGET_ANCHORS;
  await assert.rejects(applyTargetAnchor(db, uid, edit()), code('failed-precondition'));
  process.env.EXPERIMENTAL_TARGET_ANCHORS = 'true';
  await assert.rejects(applyTargetAnchor(db, 'intruder', edit()), code('permission-denied'));
  await db.collection('videoProcessingConsents').doc(jobId).update({ revokedAt: '2026-10-23' });
  await assert.rejects(applyTargetAnchor(db, uid, edit()), code('failed-precondition'));
  assert.equal((await ref.get()).get('pipelineGeneration'), 0);
});

test('anchor commit derives timestamp, invalidates claims and is retry-idempotent', async () => {
  assert.deepEqual(await applyTargetAnchor(db, uid, edit()), { revision: 1, generation: 1 });
  const state = (await ref.get()).data();
  assert.equal(state.experimentalTargetIdentity.anchors[0].timestampSec, 242);
  assert.equal(state.experimentalTargetIdentity.targetId, `target_${jobId}`);
  assert.deepEqual(state.report.strengths, []);
  assert.deepEqual(state.report.events, []);
  assert.deepEqual(state.events, []);
  assert.equal(state.report.confidenceDimensions.playerIdentity, 'Insufficient');
  assert.equal(state.pendingCoaching, null);
  assert.equal(state.identityConfirmation.state, 'pending');
  assert.deepEqual(await applyTargetAnchor(db, uid, edit()), { revision: 1, generation: 1 });
  await assert.rejects(applyTargetAnchor(db, uid, edit({ box: { x: 0, y: 0, width: 1, height: 1 } })), code('already-exists'));
});

test('stale generations and concurrent edits cannot overwrite anchors', async () => {
  await assert.rejects(applyTargetAnchor(db, uid, edit({ expectedGeneration: 1 })), code('aborted'));
  const results = await Promise.allSettled([
    applyTargetAnchor(db, uid, edit()),
    applyTargetAnchor(db, uid, edit({ operationId: 'different-operation-1234' })),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected' && result.reason.code === 'aborted').length, 1);
  assert.equal((await ref.get()).get('experimentalTargetIdentity.revision'), 1);
});

test('removal retains the identity and revision tombstone, not old claims', async () => {
  await applyTargetAnchor(db, uid, edit());
  const { box: _box, ...request } = edit({ operation: 'remove', expectedGeneration: 1, expectedRevision: 1, operationId: 'remove-operation-1234' });
  await applyTargetAnchor(db, uid, request);
  const state = (await ref.get()).data();
  assert.equal(state.experimentalTargetIdentity.revision, 2);
  assert.deepEqual(state.experimentalTargetIdentity.anchors, []);
  assert.equal(state.experimentalTargetIdentity.targetId, `target_${jobId}`);
  assert.deepEqual(state.report.evidence, []);
  await assert.rejects(applyTargetAnchor(db, uid, edit({ operationId: 'another-operation-1234' })), code('aborted'));
});

test('only completed retained server frames can be anchored', async () => {
  for (const patch of [{ status: 'analyzing' }, { videoStoragePath: '' }, { frames: [] },
    { frames: [{ id: 'frame_1', timestampSec: 242, source: 'device', storagePath: 'foreign' }] }]) {
    const original = (await ref.get()).data();
    await ref.update(patch);
    await assert.rejects(applyTargetAnchor(db, uid, edit()));
    await ref.set(original);
  }
  await assert.rejects(saveAnalysisTargetAnchor.run(call(uid, { ...edit(), timestampSec: 99 })), code('invalid-argument'));
});

test('security rules deny client-forged target identities', async () => {
  assert.ok(isDenied(await setDocument(uid, `matchAnalysisJobs/${jobId}`, { ...(await ref.get()).data(), experimentalTargetIdentity: { revision: 99 } })));
});

test('consent withdrawal removes anchors, including from completed jobs', async () => {
  await applyTargetAnchor(db, uid, edit());
  await revokeVideoProcessingConsent.run(call(uid, { jobId }));
  assert.equal((await ref.get()).get('experimentalTargetIdentity'), undefined);
  await assert.rejects(applyTargetAnchor(db, uid, edit({ expectedGeneration: 1, expectedRevision: 0 })), code('failed-precondition'));
});

test('stale confirmation cannot overwrite anchor edits or release coaching after withdrawal', async () => {
  const { confirmAnalysisIdentity } = require('./lib/analysis/identityCallable.js');
  await applyTargetAnchor(db, uid, edit());
  await assert.rejects(confirmAnalysisIdentity.run(call(uid, { jobId, decision: 'confirmed', frameIds: ['frame_1'], expectedGeneration: 0, expectedAnchorRevision: 0 })), code('aborted'));
  await assert.rejects(confirmAnalysisIdentity.run(call(uid, { jobId, decision: 'confirmed', frameIds: ['frame_1'] })), code('aborted'));
  assert.equal((await ref.get()).get('identityConfirmation.state'), 'pending');
  await revokeVideoProcessingConsent.run(call(uid, { jobId }));
  await ref.update({ pendingCoaching: { strengths: ['must not release'] } });
  await assert.rejects(confirmAnalysisIdentity.run(call(uid, { jobId, decision: 'confirmed', frameIds: ['frame_1'], expectedGeneration: 1, expectedAnchorRevision: 0 })), code('failed-precondition'));
  assert.notDeepEqual((await ref.get()).get('report.strengths'), ['must not release']);
});

test('not-me feedback is scoped to the current target revision', async () => {
  const { submitAnalysisCorrection } = require('./lib/analysis/corrections.js');
  const { confirmAnalysisIdentity } = require('./lib/analysis/identityCallable.js');
  const feedback = { jobId, targetKind: 'identity_frame', targetId: 'frame_1', action: 'not_me', reason: 'not_me' };
  await submitAnalysisCorrection.run(call(uid, feedback));
  assert.equal((await ref.get()).get('pipelineGeneration'), 1);
  await applyTargetAnchor(db, uid, edit({ expectedGeneration: 1 }));
  await assert.rejects(submitAnalysisCorrection.run(call(uid, feedback)), code('aborted'));
  await ref.collection('identityCoordination').doc('current').set({ stale: true });
  const result = await submitAnalysisCorrection.run(call(uid, { ...feedback, expectedAnchorRevision: 1 }));
  assert.equal(result.deduplicated, false);
  assert.equal((await ref.collection('identityCoordination').doc('current').get()).exists, false);
  assert.equal((await ref.get()).get('identityConfirmation.state'), 'rejected');
  const generation = (await ref.get()).get('pipelineGeneration');
  await assert.rejects(confirmAnalysisIdentity.run(call(uid, {
    jobId, decision: 'confirmed', frameIds: ['frame_1'], expectedGeneration: generation, expectedAnchorRevision: 1,
  })), code('failed-precondition'));
  // Legacy rules allow the owner to edit this display field; it is not an authorization marker.
  await ref.update({ identityConfirmation: { state: 'pending', frameIds: [] } });
  await ref.collection('identityCoordination').doc('current').set({ stale: true });
  await assert.rejects(confirmAnalysisIdentity.run(call(uid, {
    jobId, decision: 'confirmed', frameIds: ['frame_1'], expectedGeneration: generation, expectedAnchorRevision: 1,
  })), code('failed-precondition'));
  const repeated = await submitAnalysisCorrection.run(call(uid, { ...feedback, expectedAnchorRevision: 1 }));
  assert.equal(repeated.deduplicated, true);
  assert.equal((await ref.collection('identityCoordination').doc('current').get()).exists, false);
  assert.equal((await ref.get()).get('identityConfirmation.state'), 'rejected');
});

async function seedCoordinator() {
  const models = { detector: 'synthetic-coordinator' };
  process.env.CV_WORKER_URL = 'http://127.0.0.1:9999';
  process.env.CV_WORKER_APPROVED = 'true';
  setEmulatorCvApproval({ workerVersion: 'coordinator-test', models, eventsApproved: false, reportSha256: 'a'.repeat(64) });
  await ref.update({ pipelineGeneration: 0, experimentalTargetIdentity: require('firebase-admin/firestore').FieldValue.delete(),
    experimentalIdentityCoordination: null, identityRejection: null });
  await db.collection('videoProcessingConsents').doc(jobId).update({ revokedAt: null });
  await applyTargetAnchor(db, uid, edit());
  const target = { jerseyNumber: '8', kitPrimaryColor: 'orange', kitSecondaryColor: '' };
  await ref.update({ targeting: target });
  await db.collection('consentRecords').doc(uid).set({ consents: {
    ai_analysis: { status: 'granted', version: LEGAL_VERSIONS['ai-use-policy'] },
  } });
  await db.collection('userSafety').doc(uid).set({ ageBand: '18plus', guardianStatus: 'not_required' });
  await db.collection('videoProcessingConsents').doc(jobId).update({ processingMode: 'cloud_video', providers: ['pitchproof_cv_worker'] });
  const scope = { jobId, sourceSha256: 'a'.repeat(64), generation: 1, modelSetDigest: coordinator.approvedModelDigest(models) };
  const box = edit().box;
  const artifact = { schemaVersion: 1, sourcePath: `profiles/${uid}/matchFootage/${jobId}/video.mp4`, generation: 1, anchorRevision: 1,
    evidence: { scope, target, durationSec: 300, references: [{ anchorId: 'frame_1', scope, frameIndex: 7260,
      timestampSec: 242, box, evidenceHash: 'b'.repeat(64) }], segments: [{ segmentId: 's0', startSec: 0, endSec: 300,
      tracklets: [{ trackletId: 'target-only', samples: [{ timestampSec: 242, jerseyRead: '8', jerseyConfidence: 0.9,
        teamMatch: 0.9, box: [10, 10, 30, 60] }] }] }] },
    sourceProof: { schemaVersion: 1, scope, evidenceFormat: 'rgb24-sha256', frames: [{ frameId: 'frame_1', framePts: 7260,
      timeBaseNumerator: 1, timeBaseDenominator: 30, timestampSec: 242, frameIndex: 7260,
      evidenceHash: 'b'.repeat(64), width: 100, height: 100 }] } };
  await ref.collection('identityEvidence').doc('current').set(artifact);
  const response = { workerVersion: 'coordinator-test', models, sourceProofSha256: 'c'.repeat(64), identity: {
    scope, targetId: jobId, target, windows: [{ startSec: 0, endSec: 300, state: 'UNKNOWN', confidence: 0 }],
    calibrated: false, continuousIdentityValidated: false, associationMethod: 'fresh_local_jersey_and_kit',
    sightings: [{ trackletId: 'must-not-persist' }],
  } };
  const request = { jobId, expectedGeneration: 1, expectedAnchorRevision: 1 };
  return { models, scope, artifact, response, request };
}

test('coordinator persists an allowlisted scoped summary, not candidates or coaching', async () => {
  const { response, request } = await seedCoordinator();
  let calls = 0;
  await coordinator.coordinateTargetIdentity(db, uid, request, { resolve: async (payload) => {
    calls += 1;
    assert.equal(payload.evidence.target.jerseyNumber, '8');
    assert.equal(JSON.stringify(payload).includes('https://'), false);
    return response;
  } });
  assert.equal(calls, 1);
  const saved = (await ref.collection('identityCoordination').doc('current').get()).data();
  assert.equal(JSON.stringify(saved).includes('must-not-persist'), false);
  assert.equal(saved.calibrated, false);
  assert.equal((await ref.get()).get('identityConfirmation.state'), 'pending');
  assert.equal((await ref.get()).get('experimentalIdentityCoordination.windowCount'), 1);
});

test('coordinator fails closed on gates, owner, stale revision and missing source proof', async () => {
  const { request, response } = await seedCoordinator();
  const client = { resolve: async () => assert.fail('unapproved evidence reached coordinator') };
  delete process.env.EXPERIMENTAL_TARGET_ANCHORS;
  await assert.rejects(coordinator.coordinateTargetIdentity(db, uid, request, client), code('failed-precondition'));
  process.env.EXPERIMENTAL_TARGET_ANCHORS = 'true';
  await assert.rejects(coordinator.coordinateTargetIdentity(db, 'intruder', request, client), code('permission-denied'));
  await assert.rejects(coordinator.coordinateTargetIdentity(db, uid, { ...request, expectedGeneration: 0 }, client), code('aborted'));
  setEmulatorCvApproval(null);
  await assert.rejects(coordinator.coordinateTargetIdentity(db, uid, request, client), code('failed-precondition'));
  setEmulatorCvApproval({ workerVersion: response.workerVersion, models: response.models, eventsApproved: false, reportSha256: 'a'.repeat(64) });
  await ref.collection('identityEvidence').doc('current').delete();
  await assert.rejects(coordinator.coordinateTargetIdentity(db, uid, request, client), code('failed-precondition'));
});

test('coordinator cannot commit after video withdrawal or anchor edit in flight', async () => {
  for (const change of ['withdraw', 'edit']) {
    const { request, response } = await seedCoordinator();
    await assert.rejects(coordinator.coordinateTargetIdentity(db, uid, request, { resolve: async () => {
      if (change === 'withdraw') await revokeVideoProcessingConsent.run(call(uid, { jobId }));
      else await applyTargetAnchor(db, uid, edit({ expectedGeneration: 1, expectedRevision: 1,
        operationId: 'changed-operation-12345' }));
      return response;
    } }));
    assert.equal((await ref.get()).get('experimentalIdentityCoordination') ?? null, null);
    assert.equal((await ref.collection('identityCoordination').doc('current').get()).exists, false);
  }
});

test('AI withdrawal, guardian denial and provider omission block coordination', async () => {
  for (const change of ['ai', 'guardian', 'provider']) {
    const { request } = await seedCoordinator();
    if (change === 'ai') await db.collection('consentRecords').doc(uid).set({ consents: {} });
    if (change === 'guardian') await db.collection('userSafety').doc(uid).set({ ageBand: '13-17', guardianStatus: 'revoked' });
    if (change === 'provider') await db.collection('videoProcessingConsents').doc(jobId).update({ providers: [] });
    await assert.rejects(coordinator.coordinateTargetIdentity(db, uid, request, { resolve: async () => assert.fail('consent bypass') }), code('failed-precondition'));
  }
});

test('chunked private artifacts reassemble atomically and client writes are denied', async () => {
  const { artifact, request, response } = await seedCoordinator();
  const { manifest, parts } = coordinator.chunkCoordinatorArtifact(artifact);
  for (const part of parts) await ref.collection('identityEvidence').doc(part.id).set({ payloadBase64: part.payloadBase64 });
  await ref.collection('identityEvidence').doc('current').set(manifest);
  await coordinator.coordinateTargetIdentity(db, uid, request, { resolve: async () => response });
  assert.ok(isDenied(await setDocument(uid, `matchAnalysisJobs/${jobId}/identityEvidence/current`, artifact)));
  await ref.collection('identityEvidence').doc(parts[0].id).update({ payloadBase64: Buffer.from('{}').toString('base64') });
  await assert.rejects(coordinator.coordinateTargetIdentity(db, uid, request, { resolve: async () => assert.fail('corrupt chunk dispatched') }), code('failed-precondition'));
});

async function stagingFixture() {
  const f = await seedCoordinator();
  await ref.collection('identityEvidence').doc('current').delete();
  const segment = { contractVersion: 2, workerVersion: f.response.workerVersion, models: f.models, segmentIndex: 0,
    stages: { tracking: 'complete', identity: 'complete', pitch: 'unavailable', events: 'unavailable' },
    cameraView: 'unclear', identity: { state: 'UNKNOWN', candidates: [] },
    coverage: { analysedSec: 300, targetVisibleSec: 0, framesDecoded: 600 },
    availability: [{ startSec: 0, endSec: 300, state: 'UNKNOWN', confidence: 0 }], events: [] };
  const identity = structuredClone(f.response);
  delete identity.identity.sightings;
  identity.identity.references = f.artifact.evidence.references;
  const bundle = { plan: { mode: 'run', authorizedLocalEvaluation: true, cloudUpload: false, modelTraining: false,
    workerVersion: f.response.workerVersion, sourceSha256: f.scope.sourceSha256, durationSec: 300,
    target: f.artifact.evidence.target, fps: 2, referenceSec: 242, segments: [{ segmentIndex: 0, startSec: 0, endSec: 300 }] },
    complete: { status: 'complete', segments: 1 }, identity, segments: [{ segment, targetTrace: [], decodeAudit: {
      requestedStartSec: 0, requestedEndSec: 300, sampleStepSec: 0.5, timestampToleranceSec: 0.250001,
      sampledSourceIntervals: [[0, 300]], missingIntervals: [], framesDecoded: 600, timestampsValid: true, complete: true } }] };
  const source = { version: async () => ({ generation: '1', sizeBytes: 100 }),
    verify: async () => ({ generation: '1', sizeBytes: 100, sha256: f.scope.sourceSha256 }) };
  const { stageTrustedIdentityEvidence: stage } = require('./lib/analysis/identityEvidenceStaging.js');
  return { ...f, bundle, source, stage };
}

test('trusted staging publishes atomically, is retry-idempotent and does not release coaching', async () => {
  const f = await stagingFixture();
  const first = await f.stage(db, uid, f.request, f.artifact, f.bundle, f.source);
  assert.equal(first.status, 'staged');
  const second = await f.stage(db, uid, f.request, f.artifact, f.bundle, {
    ...f.source, verify: async () => assert.fail('idempotent retry rehashed source') });
  assert.equal(second.status, 'already_staged');
  assert.equal(second.artifactSha256, first.artifactSha256);
  assert.equal((await ref.get()).get('identityConfirmation.state'), 'pending');
  await coordinator.coordinateTargetIdentity(db, uid, f.request, { resolve: async () => f.response }, f.source);
  assert.equal((await ref.get()).get('identityConfirmation.state'), 'pending');
  assert.ok(isDenied(await setDocument(uid, `matchAnalysisJobs/${jobId}/identityEvidenceStaging/current`, { token: 'forged' })));
});

test('staging rejects source mismatch and cleans unpublished parts and lease', async () => {
  const f = await stagingFixture();
  await assert.rejects(f.stage(db, uid, f.request, f.artifact, f.bundle, { ...f.source,
    verify: async () => ({ generation: '1', sizeBytes: 100, sha256: 'f'.repeat(64) }) }), code('failed-precondition'));
  assert.equal((await ref.collection('identityEvidence').get()).size, 0);
  assert.equal((await ref.collection('identityEvidenceStaging').get()).size, 0);
});

test('staging cannot publish after consent withdrawal or target edit during source verification', async () => {
  for (const change of ['withdraw', 'edit']) {
    const f = await stagingFixture();
    await assert.rejects(f.stage(db, uid, f.request, f.artifact, f.bundle, { ...f.source, verify: async () => {
      if (change === 'withdraw') await revokeVideoProcessingConsent.run(call(uid, { jobId }));
      else await applyTargetAnchor(db, uid, edit({ expectedGeneration: 1, expectedRevision: 1, operationId: 'staging-edit-123456' }));
      return f.source.verify();
    } }));
    assert.equal((await ref.collection('identityEvidence').get()).size, 0);
    assert.equal((await ref.collection('identityEvidenceStaging').get()).size, 0);
  }
});

test('staging and consumption reject changed source generations', async () => {
  const f = await stagingFixture();
  await assert.rejects(f.stage(db, uid, f.request, f.artifact, f.bundle, { ...f.source,
    version: async () => ({ generation: '2', sizeBytes: 100 }) }), code('aborted'));
  assert.equal((await ref.collection('identityEvidence').get()).size, 0);
  await f.stage(db, uid, f.request, f.artifact, f.bundle, f.source);
  await assert.rejects(coordinator.coordinateTargetIdentity(db, uid, f.request,
    { resolve: async () => assert.fail('replaced source reached inference') }, { ...f.source,
      version: async () => ({ generation: '2', sizeBytes: 100 }) }), code('aborted'));
});

test('staging respects current approval and active producer leases', async () => {
  const f = await stagingFixture();
  setEmulatorCvApproval(null);
  await assert.rejects(f.stage(db, uid, f.request, f.artifact, f.bundle, f.source), code('failed-precondition'));
  setEmulatorCvApproval({ workerVersion: f.response.workerVersion, models: f.models, eventsApproved: false, reportSha256: 'a'.repeat(64) });
  await ref.collection('identityEvidenceStaging').doc('current').set({ token: 'other', expiresAtMs: Date.now() + 60000 });
  await assert.rejects(f.stage(db, uid, f.request, f.artifact, f.bundle, f.source), code('aborted'));
  assert.equal((await ref.collection('identityEvidence').get()).size, 0);
});

test('expired staging recovers abandoned chunks and withdrawal deletes the completed lease', async () => {
  const f = await stagingFixture();
  const abandoned = `part_${'d'.repeat(16)}_0`;
  await ref.collection('identityEvidence').doc(abandoned).set({ payloadBase64: 'abandoned' });
  await ref.collection('identityEvidenceStaging').doc('current').set({ token: 'expired', expiresAtMs: 0, payloadParts: [abandoned] });
  await f.stage(db, uid, f.request, f.artifact, f.bundle, f.source);
  assert.equal((await ref.collection('identityEvidence').doc(abandoned).get()).exists, false);
  assert.equal((await ref.collection('identityEvidenceStaging').doc('current').get()).get('status'), 'complete');
  const changed = structuredClone(f.artifact);
  changed.evidence.segments[0].tracklets[0].samples[0].jerseyConfidence = 0.8;
  await assert.rejects(f.stage(db, uid, f.request, changed, f.bundle, f.source), code('already-exists'));
  await revokeVideoProcessingConsent.run(call(uid, { jobId }));
  assert.equal((await ref.collection('identityEvidence').get()).size, 0);
  assert.equal((await ref.collection('identityEvidenceStaging').get()).size, 0);
});

test('140-minute metadata spans multiple chunk batches and failed publication cleans all parts', async () => {
  const f = await stagingFixture();
  const duration = 8400;
  await ref.update({ durationSec: duration, measuredDurationSec: duration });
  f.artifact.evidence.durationSec = duration;
  f.bundle.plan.durationSec = duration;
  f.bundle.identity.identity.windows[0].endSec = duration;
  const first = structuredClone(f.bundle.segments[0]);
  f.bundle.plan.segments = Array.from({ length: 14 }, (_, segmentIndex) => ({ segmentIndex, startSec: segmentIndex * 600, endSec: (segmentIndex + 1) * 600 }));
  f.bundle.complete.segments = 14;
  f.artifact.evidence.segments = f.bundle.plan.segments.map((s) => ({ segmentId: `s${s.segmentIndex}`, startSec: s.startSec, endSec: s.endSec, tracklets: [] }));
  f.bundle.segments = f.bundle.plan.segments.map((s) => {
    const output = structuredClone(first);
    output.segment.segmentIndex = s.segmentIndex;
    output.segment.coverage = { analysedSec: 600, targetVisibleSec: 0, framesDecoded: 1200 };
    output.segment.availability = [{ startSec: s.startSec, endSec: s.endSec, state: 'UNKNOWN', confidence: 0 }];
    Object.assign(output.decodeAudit, { requestedStartSec: s.startSec, requestedEndSec: s.endSec,
      sampledSourceIntervals: [[s.startSec, s.endSec]], framesDecoded: 1200 });
    return output;
  });
  const anchor = f.artifact.sourceProof.frames[0];
  f.artifact.sourceProof.frames = Array.from({ length: 16800 }, (_, i) => i === 484 ? anchor : ({ ...anchor,
    frameId: `source_${i}`, framePts: i * 15, timestampSec: i / 2, frameIndex: i * 15 }));
  for (const segment of f.artifact.evidence.segments) segment.tracklets = [{ trackletId: `target_${segment.segmentId}`,
    samples: Array.from({ length: 1200 }, (_, i) => ({ timestampSec: segment.startSec + i / 2,
      jerseyRead: '8', jerseyConfidence: 0.9, teamMatch: 0.9, box: [10, 10, 30, 60] })) }];
  assert.ok(coordinator.chunkCoordinatorArtifact(f.artifact).parts.length > 8);
  await assert.rejects(f.stage(db, uid, f.request, f.artifact, f.bundle, { ...f.source,
    version: async () => { throw new Error('generated final-publication failure'); } }));
  assert.equal((await ref.collection('identityEvidence').get()).size, 0);
  assert.equal((await ref.collection('identityEvidenceStaging').get()).size, 0);
  const result = await f.stage(db, uid, f.request, f.artifact, f.bundle, f.source);
  assert.equal(result.segmentCount, 14);
  assert.ok(result.partCount > 8);
  assert.equal((await ref.collection('identityEvidence').get()).size, result.partCount + 1);
});
