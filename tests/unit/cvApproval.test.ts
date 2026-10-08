import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  APPROVAL_PATH,
  GENERATED_PATH,
  THRESHOLDS_PATH,
  aggregate,
  generatedModule,
  sha256Normalized,
  verifyCvApproval,
} from '../../scripts/lib/cvApproval.mjs';

const repoRoot = join(import.meta.dirname, '..', '..');
const MODELS = { detector: 'rtdetr@1', tracker: 'bytetrack@1' };

type Video = ReturnType<typeof video>;

function video(id: string, difficulty: string[], correct = 10) {
  return {
    videoId: id,
    annotator: id.endsWith('1') ? 'ann_a' : 'ann_b',
    difficulty,
    visible: { predSec: 100, trueSec: 120, overlapSec: 99 },
    offCamera: { predSec: 20, onPitchOverlapSec: 20 },
    identity: { keyframes: 10, claimed: 10, correct, wrongPerson: 10 - correct, missed: 0, switches: 0, correctRunsSec: [45] },
    coverage: { analysedSec: 600, durationSec: 600 },
    reliability: { segments: 1, segmentsOk: 1 },
    events: { stage: 'not_implemented', truePositive: 0, predicted: 0, actual: 3, timestampErrorSumSec: 0 },
  };
}

const THRESHOLDS = {
  status: 'approved',
  minimumVideos: 2,
  minimumAnnotators: 2,
  metrics: { identityAccuracy: { min: 0.95 }, visiblePrecision: { min: 0.9 }, switchesPer10Min: { max: 0.5 } },
  eventMetrics: { eventPrecision: { min: 0.85 } },
  requiredSlices: { identical_numbers: 1 },
  sliceMetrics: ['identityAccuracy'],
};

/** Builds a self-consistent evidence set in a scratch repo, then lets each test break one thing. */
function fixture({
  videos = [video('v1', []), video('v2', ['identical_numbers'])] as Video[],
  thresholds = THRESHOLDS as Record<string, unknown>,
  record = {} as Record<string, unknown>,
  summary = undefined as Record<string, unknown> | undefined,
  provenance = {} as Record<string, unknown>,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'cv-approval-'));
  mkdirSync(join(root, 'docs/video/evaluation'), { recursive: true });
  mkdirSync(join(root, 'workers/football-cv/eval'), { recursive: true });
  const thresholdsText = JSON.stringify(thresholds, null, 2);
  writeFileSync(join(root, THRESHOLDS_PATH), thresholdsText);
  const manifestText = JSON.stringify({
    datasetId: 'd1',
    createdAt: '2026-09-01',
    videos: videos.map((v) => ({ videoId: v.videoId, fileName: `${v.videoId}.mp4`, footageSha256: 'a'.repeat(64), durationSec: 600, consent: 'documented' })),
  });
  writeFileSync(join(root, 'docs/video/evaluation/manifest.json'), manifestText);
  const manifestSha256 = sha256Normalized(Buffer.from(manifestText));
  const thresholdsSha256 = sha256Normalized(Buffer.from(thresholdsText));
  const reportText = JSON.stringify({
    provenance: { workerVersion: 'football-cv/0.2.0', models: MODELS, manifestSha256, thresholdsSha256, ...provenance },
    summary: summary ?? aggregate(videos),
    videos,
  });
  writeFileSync(join(root, 'docs/video/evaluation/report.json'), reportText);
  writeFileSync(
    join(root, APPROVAL_PATH),
    JSON.stringify({
      schemaVersion: 1,
      workerVersion: 'football-cv/0.2.0',
      models: MODELS,
      datasetId: 'd1',
      manifestPath: 'docs/video/evaluation/manifest.json',
      manifestSha256,
      reportPath: 'docs/video/evaluation/report.json',
      reportSha256: sha256Normalized(Buffer.from(reportText)),
      thresholdsSha256,
      evaluatedAt: '2026-09-10',
      approvedAt: '2026-09-12',
      approver: { role: 'product owner' },
      securityReview: { completedAt: '2026-09-11', reference: 'SEC-REVIEW-REF' },
      scope: { identityAndAvailability: true, events: false },
      ...record,
    }),
  );
  return root;
}

const verify = (root: string) => verifyCvApproval(root, { today: '2026-10-09' });

describe('CV worker approval record', () => {
  test('the repository has no approval and compiles the worker off', () => {
    const result = verifyCvApproval(repoRoot);
    assert.equal(result.state, 'absent');
    assert.equal(readFileSync(join(repoRoot, GENERATED_PATH), 'utf8').replace(/\r\n/g, '\n'), generatedModule(null));
  });

  test('a consistent record backed by passing evidence is approved and pins the build', () => {
    const result = verify(fixture());
    assert.deepEqual(result.problems, []);
    assert.equal(result.state, 'approved');
    assert.deepEqual(result.runtime?.models, MODELS);
    assert.equal(result.runtime?.eventsApproved, false);
    assert.match(generatedModule(result.runtime), /"workerVersion": "football-cv\/0.2.0"/);
  });

  test('a typed-in summary that the per-video data does not support is rejected', () => {
    const failing = [video('v1', [], 6), video('v2', ['identical_numbers'], 6)];
    const result = verify(fixture({ videos: failing, summary: { ...aggregate(failing), identityAccuracy: 0.99 } }));
    assert.equal(result.state, 'invalid');
    assert.ok(result.problems.some((p) => p.includes('summary identityAccuracy does not match')));
    assert.ok(result.problems.some((p) => p.startsWith('identityAccuracy')));
  });

  test('editing the report after approval breaks the hash', () => {
    const root = fixture();
    const path = join(root, 'docs/video/evaluation/report.json');
    writeFileSync(path, readFileSync(path, 'utf8').replace('"correct":10', '"correct":9'));
    assert.ok(verify(root).problems.includes('evaluation report does not match reportSha256'));
  });

  test('proposed thresholds, missing reviews, other builds and events without an event stage are rejected', () => {
    const proposed = verify(fixture({ thresholds: { ...THRESHOLDS, status: 'proposed' } }));
    assert.ok(proposed.problems.some((p) => p.includes('not approved by the product owner')));
    assert.ok(verify(fixture({ record: { securityReview: {} } })).problems.some((p) => p.includes('securityReview')));
    assert.ok(verify(fixture({ provenance: { workerVersion: 'football-cv/9.9.9' } })).problems.includes('report was produced by a different worker version'));
    assert.ok(verify(fixture({ record: { scope: { identityAndAvailability: true, events: true } } })).problems.some((p) => p.includes('event stage is not implemented')));
    assert.ok(verify(fixture({ record: { approvedAt: '2027-01-01' } })).problems.includes('approvedAt is in the future'));
    assert.ok(verify(fixture({ record: { reportPath: '../outside.json' } })).problems.some((p) => p.includes('reportPath')));
  });

  test('too few videos or an uncovered difficult slice fails even with good averages', () => {
    const result = verify(fixture({ videos: [video('v1', []), video('v2', [])] }));
    assert.ok(result.problems.some((p) => p.startsWith('slice identical_numbers')));
  });
});
