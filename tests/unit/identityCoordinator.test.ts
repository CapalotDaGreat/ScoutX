import assert from 'node:assert/strict';
import { test } from 'node:test';
import { approvedModelDigest, chunkCoordinatorArtifact, coordinatorPayload, parseCoordinatorRequest, parseCoordinatorSummary } from '../../functions/src/analysis/identityCoordinator.ts';

const models = { tracker: 'synthetic-tracker', detector: 'synthetic-detector' };
const request = { jobId: 'anchor-job', expectedGeneration: 1, expectedAnchorRevision: 1 };
const scope = { jobId: request.jobId, sourceSha256: 'a'.repeat(64), generation: 1, modelSetDigest: approvedModelDigest(models) };
const box = { x: 0.1, y: 0.1, width: 0.2, height: 0.2 };
function fixture() {
  const target = { jerseyNumber: '8', kitPrimaryColor: 'orange', kitSecondaryColor: '' };
  const sourcePath = 'profiles/owner/matchFootage/anchor-job/video.mp4';
  const job = { targeting: target, durationSec: 10, videoStoragePath: sourcePath,
    experimentalTargetIdentity: { sourcePath, revision: 1, anchors: [{ frameId: 'frame_1', timestampSec: 1, box }] } };
  const artifact = { schemaVersion: 1, sourcePath, generation: 1, anchorRevision: 1,
    sourceProof: { schemaVersion: 1, scope, evidenceFormat: 'rgb24-sha256', frames: [{ frameId: 'frame_1', framePts: 30,
      timeBaseNumerator: 1, timeBaseDenominator: 30, timestampSec: 1, frameIndex: 30,
      evidenceHash: 'b'.repeat(64), width: 1920, height: 1080 }] },
    evidence: { scope, target, durationSec: 10, references: [{ anchorId: 'frame_1', scope, timestampSec: 1,
      frameIndex: 30, box, evidenceHash: 'b'.repeat(64) }], segments: [{ segmentId: 's0', startSec: 0, endSec: 10,
      tracklets: [{ trackletId: 'target-only', samples: [{ timestampSec: 1, jerseyRead: '8', jerseyConfidence: 0.9,
        teamMatch: 0.9, box: [10, 10, 30, 60] }] }] }] } };
  return { job, artifact };
}

test('coordinator accepts only ID and explicit current revision, not client evidence', () => {
  assert.deepEqual(parseCoordinatorRequest(request), request);
  for (const input of [null, {}, { ...request, evidence: {} }, { ...request, expectedGeneration: NaN },
    { ...request, expectedAnchorRevision: -1 }, { ...request, jobId: '../bad' }]) assert.equal(parseCoordinatorRequest(input), null);
});

test('model digest is key-order independent and matches canonical sorted JSON', () => {
  assert.equal(approvedModelDigest(models), approvedModelDigest({ detector: models.detector, tracker: models.tracker }));
});

test('private evidence binds source, generation, revision, target and exact reviewed box/time', () => {
  const { job, artifact } = fixture();
  assert.ok(coordinatorPayload(job, artifact, request, models));
  for (const patch of [{ sourcePath: 'foreign' }, { generation: 0 }, { anchorRevision: 0 },
    { sourceProof: { ...artifact.sourceProof, scope: { ...scope, sourceSha256: 'c'.repeat(64) } } },
    { evidence: { ...artifact.evidence, target: { ...artifact.evidence.target, jerseyNumber: '20' } } },
    { evidence: { ...artifact.evidence, references: [{ ...artifact.evidence.references[0], timestampSec: 1.001 }] } }]) {
    assert.equal(coordinatorPayload(job, { ...artifact, ...patch }, request, models), null);
  }
  assert.equal(coordinatorPayload(job, artifact, request, { detector: 'different' }), null);
});

test('non-target stored candidate observations cannot enter coordination', () => {
  const { job, artifact } = fixture();
  artifact.evidence.segments[0].tracklets[0].samples[0].jerseyRead = '18';
  assert.equal(coordinatorPayload(job, artifact, request, models), null);
});

test('source proof rejects rounded times, duplicate claims and missing rows', () => {
  for (const mode of ['rounded', 'duplicate', 'missing']) {
    const { job, artifact } = fixture();
    if (mode === 'rounded') artifact.sourceProof.frames[0].framePts = 31;
    if (mode === 'duplicate') artifact.sourceProof.frames.push({ ...artifact.sourceProof.frames[0] });
    if (mode === 'missing') artifact.sourceProof.frames = [];
    assert.equal(coordinatorPayload(job, artifact, request, models), null);
  }
});

test('exact source origin keeps recording-relative anchor time distinct from raw PTS', () => {
  const { job, artifact } = fixture();
  const frame = artifact.sourceProof.frames[0];
  const offset = { ...frame, framePts: 120, originNumerator: 3, originDenominator: 1 };
  const sourceProof = { ...artifact.sourceProof, frames: [offset] };
  assert.ok(coordinatorPayload(job, { ...artifact, sourceProof }, request, models));
  assert.equal(coordinatorPayload(job, { ...artifact, sourceProof: { ...sourceProof,
    frames: [{ ...offset, originNumerator: 0 }] } }, request, models), null);
});

test('long-match metadata chunks stay bounded and losslessly preserve payload', () => {
  const data = { ...fixture().artifact, padding: 'x'.repeat(800000) };
  const { manifest, parts } = chunkCoordinatorArtifact(data);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((part) => part.payloadBase64.length < 350000));
  assert.equal(new Set(parts.map((part) => part.id)).size, parts.length);
  assert.deepEqual(JSON.parse(Buffer.concat(parts.map((part) => Buffer.from(part.payloadBase64, 'base64'))).toString()), data);
  assert.deepEqual(manifest.payloadParts, parts.map((part) => part.id));
});

test('summary allowlist discards candidate IDs, source URLs and raw samples', () => {
  const result = { workerVersion: 'test', models, identity: { scope, targetId: scope.jobId,
    associationMethod: 'fresh_local_jersey_and_kit', calibrated: false, continuousIdentityValidated: false,
    windows: [{ startSec: 0, endSec: 10, state: 'UNKNOWN', confidence: 0 }],
    sightings: [{ trackletId: 'private-id' }], sourceUrl: 'https://private.invalid?secret=x' } };
  const parsed = parseCoordinatorSummary(result, scope, 10);
  assert.ok(parsed);
  assert.ok(!JSON.stringify(parsed).includes('private'));
  for (const patch of [{ calibrated: true }, { scope: { ...scope, generation: 0 } },
    { windows: [{ startSec: 1, endSec: 10, state: 'UNKNOWN', confidence: 0 }] },
    { windows: [{ startSec: 0, endSec: 10, state: 'UNKNOWN', confidence: 0.8 }] },
    { windows: [{ startSec: 0, endSec: 11, state: 'UNKNOWN', confidence: 0 }] }]) {
    assert.equal(parseCoordinatorSummary({ ...result, identity: { ...result.identity, ...patch } }, scope, 10), null);
  }
});
