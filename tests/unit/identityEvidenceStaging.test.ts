import assert from 'node:assert/strict';
import { test } from 'node:test';
import { approvedModelDigest } from '../../functions/src/analysis/identityCoordinator.ts';
import { validateEvidenceRunBundle } from '../../functions/src/analysis/identityEvidenceValidation.ts';
import { parseSourceWitness } from '../../functions/src/analysis/identityEvidenceSource.ts';

test('source receipts require bounded size, immutable generation and SHA-256', () => {
  const source = { generation: '123456', sizeBytes: 100, sha256: 'a'.repeat(64) };
  assert.deepEqual(parseSourceWitness(source), source);
  for (const patch of [{ generation: 'latest' }, { sizeBytes: 0 }, { sizeBytes: Infinity },
    { sizeBytes: 4294967297 }, { sha256: 'not-a-digest' }]) assert.equal(parseSourceWitness({ ...source, ...patch }), null);
});

function fixture(duration = 8400) {
  const models = { detector: 'mock-detector', tracker: 'mock-tracker' }, workerVersion = 'mock/1';
  const scope = { jobId: 'staging-job', generation: 2, sourceSha256: 'a'.repeat(64), modelSetDigest: approvedModelDigest(models) };
  const target = { jerseyNumber: '8', kitPrimaryColor: 'orange' };
  const references = [{ anchorId: 'anchor', scope, timestampSec: 1, frameIndex: 30,
    evidenceHash: 'b'.repeat(64), box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } }];
  const planned = Array.from({ length: Math.ceil(duration / 600) }, (_, segmentIndex) => ({ segmentIndex,
    startSec: segmentIndex * 600, endSec: Math.min((segmentIndex + 1) * 600, duration) }));
  const artifact = { schemaVersion: 1, sourcePath: 'profiles/owner/matchFootage/staging-job/video.mp4', generation: 2, anchorRevision: 1,
    evidence: { scope, target, durationSec: duration, references, segments: planned.map((s) => ({ segmentId: `segment_${s.segmentIndex}`,
      startSec: s.startSec, endSec: s.endSec, tracklets: [] as { trackletId: string; samples: {timestampSec: number; jerseyRead: string; jerseyConfidence: number; teamMatch: number; box: number[]}[] }[] })) },
    sourceProof: { schemaVersion: 1, scope, evidenceFormat: 'rgb24-sha256', frames: [{ frameId: 'anchor', framePts: 30,
      timeBaseNumerator: 1, timeBaseDenominator: 30, timestampSec: 1, frameIndex: 30, evidenceHash: 'b'.repeat(64), width: 1920, height: 1080 }] } };
  const bundle = { plan: { mode: 'run', authorizedLocalEvaluation: true, cloudUpload: false, modelTraining: false,
    workerVersion, sourceSha256: scope.sourceSha256, durationSec: duration, target, fps: 2, referenceSec: 1, segments: planned },
    complete: { status: 'complete', segments: planned.length }, identity: { workerVersion, models, sourceProofSha256: 'c'.repeat(64),
      identity: { scope, targetId: scope.jobId, target, references, associationMethod: 'fresh_local_jersey_and_kit', calibrated: false,
        continuousIdentityValidated: false, windows: [{ startSec: 0, endSec: duration, state: 'UNKNOWN', confidence: 0 }] } },
    segments: planned.map((s) => ({ segment: { contractVersion: 2, workerVersion, models, segmentIndex: s.segmentIndex,
      stages: { tracking: 'complete', identity: 'complete', pitch: 'unavailable', events: 'unavailable' },
      cameraView: 'unclear', identity: { state: 'UNKNOWN', candidates: [] as unknown[] },
      coverage: { analysedSec: s.endSec - s.startSec, targetVisibleSec: 0, framesDecoded: Math.ceil((s.endSec - s.startSec) * 2) },
      availability: [{ startSec: s.startSec, endSec: s.endSec, state: 'UNKNOWN', confidence: 0 }], events: [] },
      targetTrace: [] as { timeSec: number; box: number[] }[], decodeAudit: { requestedStartSec: s.startSec, requestedEndSec: s.endSec,
        sampleStepSec: 0.5, timestampToleranceSec: 0.250001, sampledSourceIntervals: [[s.startSec, s.endSec]], missingIntervals: [] as number[][],
        framesDecoded: Math.ceil((s.endSec - s.startSec) * 2), timestampsValid: true, complete: true } })) };
  return { artifact, bundle };
}

test('full 140 minute run preserves all fourteen empty target segments and a reviewed proof anchor', () => {
  const { artifact, bundle } = fixture();
  assert.deepEqual(validateEvidenceRunBundle(artifact, bundle), { workerVersion: 'mock/1', models: bundle.identity.models,
    sourceSha256: 'a'.repeat(64), segmentCount: 14, decodeComplete: true });
});
test('last segment can be shorter; 150 minutes is fifteen segments', () => {
  for (const duration of [601, 9000]) { const f = fixture(duration); assert.ok(validateEvidenceRunBundle(f.artifact, f.bundle)); }
});

const mutations: Record<string, (f: ReturnType<typeof fixture>) => void> = {
  partial: (f) => { f.bundle.complete.status = 'partial'; },
  omitted: (f) => { f.artifact.evidence.segments.pop(); },
  duplicate: (f) => { f.artifact.evidence.segments[1] = f.artifact.evidence.segments[0]; },
  reordered: (f) => { f.bundle.segments.reverse(); },
  schedule: (f) => { f.bundle.plan.segments[1].startSec++; },
  candidate18: (f) => { f.bundle.segments[0].segment.identity.candidates.push({ jerseyRead: '18' }); },
  nonTarget: (f) => { f.artifact.evidence.segments[0].tracklets.push({ trackletId: 't', samples: [{ timestampSec: 1, jerseyRead: '18', jerseyConfidence: 0.9, teamMatch: 0.9, box: [1, 1, 10, 10] }] }); },
  fabricated: (f) => { f.bundle.segments[0].decodeAudit.framesDecoded = 1; },
  gap: (f) => { f.bundle.segments[0].decodeAudit.sampledSourceIntervals = [[0, 200], [201, 600]]; },
  missing: (f) => { f.bundle.segments[0].decodeAudit.missingIntervals = [[0, 1]]; },
  tolerance: (f) => { f.bundle.segments[0].decodeAudit.timestampToleranceSec = 1; },
  nan: (f) => { f.bundle.segments[0].decodeAudit.sampledSourceIntervals[0][1] = NaN; },
  infinity: (f) => { f.bundle.plan.durationSec = Infinity; },
  source: (f) => { f.bundle.plan.sourceSha256 = 'd'.repeat(64); },
  model: (f) => { f.bundle.segments[0].segment.models = { detector: 'other', tracker: 'other' }; },
  generation: (f) => { f.artifact.generation++; },
  worker: (f) => { f.bundle.plan.workerVersion = 'other'; },
  training: (f) => { f.bundle.plan.modelTraining = true; },
  upload: (f) => { f.bundle.plan.cloudUpload = true; },
  target: (f) => { f.bundle.plan.target = { jerseyNumber: '18', kitPrimaryColor: 'orange' }; },
  trace: (f) => { f.bundle.segments[0].targetTrace.push({ timeSec: 600, box: [1, 1, 2, 2] }); },
  pts: (f) => { f.artifact.sourceProof.frames[0].framePts++; },
};
for (const [name, mutate] of Object.entries(mutations)) test(`rejects ${name}`, () => {
  const f = structuredClone(fixture()); mutate(f); assert.equal(validateEvidenceRunBundle(f.artifact, f.bundle), null);
});
test('rejects unknown URL, media and base64 fields at every evidence/proof nesting level', () => {
  for (const field of ['url', 'media', 'payloadBase64']) {
    for (const select of [(f: ReturnType<typeof fixture>) => f.artifact, (f: ReturnType<typeof fixture>) => f.artifact.evidence,
      (f: ReturnType<typeof fixture>) => f.artifact.evidence.scope, (f: ReturnType<typeof fixture>) => f.artifact.evidence.target,
      (f: ReturnType<typeof fixture>) => f.artifact.evidence.references[0], (f: ReturnType<typeof fixture>) => f.artifact.evidence.references[0].box,
      (f: ReturnType<typeof fixture>) => f.artifact.evidence.segments[0], (f: ReturnType<typeof fixture>) => f.artifact.sourceProof,
      (f: ReturnType<typeof fixture>) => f.artifact.sourceProof.frames[0]]) {
      const f = fixture(); Object.assign(select(f), { [field]: 'https://malicious.invalid/media' });
      assert.equal(validateEvidenceRunBundle(f.artifact, f.bundle), null);
    }
  }
});
