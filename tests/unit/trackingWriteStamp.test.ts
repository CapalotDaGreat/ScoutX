import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setEmulatorCvApproval } from '../../functions/src/analysis/cvConfig.ts';
import { processOcrFollowUpTask, processResolveTask, writeTrackingFeedback } from '../../functions/src/analysis/trackingCallables.ts';
import { claimTrackingTask } from '../../functions/src/analysis/trackingTaskLeases.ts';
import { reconcileTrackingAttempt } from '../../functions/src/analysis/trackingReconciliation.ts';
import { TRACKING_ATTEMPT_LEASE_MS } from '../../functions/src/analysis/trackingDeadlines.ts';
import { processDiscoverTask } from '../../functions/src/analysis/trackingOrchestrator.ts';
import { planDiscovery } from '../../functions/src/analysis/trackingProgress.ts';
import { trackingUpdateToken } from '../../functions/src/analysis/trackingReader.ts';
import { encodeTrackingStorage } from '../../functions/src/analysis/trackingStorage.ts';
import { applyAnswer, undoLast } from '../../functions/src/analysis/trackingV3.ts';
import { VIDEO_CONSENT_VERSION } from '../../functions/src/analysis/videoConsent.ts';
import { fakeDb } from './support/analysisBench.ts';

const OLD = '2026-11-24T11:00:00.000Z';
const T0 = Date.parse('2026-11-24T12:00:00.000Z');
const later = () => new Date(T0 + TRACKING_ATTEMPT_LEASE_MS + 1);
const env = { FUNCTIONS_EMULATOR: 'true', CV_WORKER_URL: 'http://localhost:9', CV_WORKER_APPROVED: 'true', TRACKING_V3_ENABLED: 'true' };
const approval = { workerVersion: 'football-cv/0.7.0', models: { detector: 'd' }, eventsApproved: false } as never;
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');

function stampOf(f: ReturnType<typeof fakeDb>, path: string) {
  return { at: f.data.get(path)?.updatedAt, token: trackingUpdateToken(f.updateTimes.get(path)) };
}

function assertMoved(f: ReturnType<typeof fakeDb>, path: string, before: ReturnType<typeof stampOf>) {
  const after = stampOf(f, path);
  assert.equal(typeof after.at, 'string');
  assert.notEqual(after.at, before.at);
  assert.match(String(after.token), /^\d+\.\d{9}$/);
  assert.notEqual(after.token, before.token);
  return after;
}

function workerReport() {
  return {
    schema: 'pitchproof.tracking.v3', engine: { version: '3.0.0' }, target: { number: '20', kit: 'orange', kit2: '', position: 'winger' },
    timeline: { periods: [{ start: 0, end: 60, kind: 'play', label: 'play', source: 'detected' }] },
    coverage: { recordingSec: 60, nonMatchSec: 0, offPitchSec: 0, matchSec: 60, unobservedSec: 0, analysedSec: 60,
      confirmedVisibleSec: 10, likelyVisibleSec: 10, ambiguousSec: 10, notIdentifiedSec: 30 },
    identity: { statesSec: { CONFIRMED_VISIBLE: 10 }, numberSightings: 1, confirmedByUser: 0 },
    physical: { status: 'unavailable', productionVisible: false, reason: 'too little', values: {}, sprints: [], highSpeedRuns: [],
      thresholds: { sprint_kmh: 19.8, hsr_kmh: 14.4 } },
    ball: { contacts: 0, carries: 0, passAttempts: 0, completedPasses: 0, incompletePasses: 0, unknownOutcomePasses: 0 },
    events: [],
    reviewQuestions: [{ t: 12.3, box: [1, 2, 30, 90], affectedSec: 20, currentlyTarget: false, score: 0.5, imageJpegBase64: JPEG }],
    referenceImageJpegBase64: JPEG,
  };
}

test('every current and discovery writer moves updatedAt and the commit time', async () => {
  const feedback = 'stamp_feedback';
  const feedbackRoot = `matchAnalysisJobs/${feedback}`;
  const feedbackCurrent = `${feedbackRoot}/tracking/current`;
  const answers = fakeDb({
    [feedbackRoot]: { playerId: 'owner' },
    [`videoProcessingConsents/${feedback}`]: { uid: 'owner', revokedAt: null, policyVersion: VIDEO_CONSENT_VERSION },
    [feedbackCurrent]: encodeTrackingStorage({ report: { reviewQuestions: [{ id: 'q1', t: 12, box: [0, 0, 10, 10] }], moments: [] },
      version: 1, stale: false, feedbackRevision: 0, updatedAt: OLD }),
  });
  const beforeAnswer = stampOf(answers, feedbackCurrent);
  await writeTrackingFeedback(answers.db, 'owner', feedback, (fb, cur) => {
    const next = applyAnswer(fb, cur.report!, 'q1', 'yes', 'op-answer1', '2026-11-24T12:00:01.000Z');
    assert.ok(next);
    return next;
  });
  const afterAnswer = assertMoved(answers, feedbackCurrent, beforeAnswer);
  await writeTrackingFeedback(answers.db, 'owner', feedback, (fb) => undoLast(fb));
  assertMoved(answers, feedbackCurrent, afterAnswer);

  for (const scope of ['feedback', 'refresh'] as const) {
    const job = `stamp_${scope}`;
    const root = `matchAnalysisJobs/${job}`;
    const current = `${root}/tracking/current`;
    const f = fakeDb({
      [root]: { playerId: 'owner' },
      [`${root}/tracking/progress`]: { generation: 1, resolving: null, outcome: null, full: null, startedAt: OLD },
      [`${root}/tracking/feedback`]: { revision: 2 },
      [current]: { version: 3, stale: true, feedbackRevision: 2, updatedAt: OLD, report: { saved: true }, followUp: {
        revision: 2, round: 1, status: 'running', deferredBefore: 20, deferredAfter: null, updatedAt: OLD } },
    });
    const before = stampOf(f, current);
    const lease = await claimTrackingTask(f.db, job, 2, scope, scope === 'refresh' ? 1 : undefined, () => new Date(T0), scope === 'refresh' ? 1 : 2);
    assert.equal(typeof lease, 'object');
    assert.equal(await reconcileTrackingAttempt(f.db, (lease as { token: string }).token, later()), 'settled');
    const after = assertMoved(f, current, before);
    if (scope === 'refresh') assert.equal((f.data.get(current)?.followUp as { status: string }).status, 'failed');
    else assert.equal(f.data.get(current)?.pendingReason, 'resolve_interrupted');
    assert.notEqual(after.at, OLD);
  }

  setEmulatorCvApproval(approval);
  const discover = 'stamp_discover';
  const discoverRoot = `matchAnalysisJobs/${discover}`;
  const discovery = `${discoverRoot}/tracking/discovery`;
  const discovered = fakeDb({
    [discoverRoot]: { playerId: 'owner', videoStoragePath: 'videos/job.mp4', targeting: { jerseyNumber: '20' } },
    [`${discoverRoot}/tracking/progress`]: { generation: 1, outcome: null, durationSec: 60, plan: [], segments: {},
      startedAt: OLD, discovery: planDiscovery(60) },
    [discovery]: encodeTrackingStorage({ moments: [], generation: 1, updatedAt: OLD }),
  });
  const beforeDiscovery = stampOf(discovered, discovery);
  assert.equal(await processDiscoverTask(discovered.db, discover, 1, 0, 0, async () => ({ status: 'no_number', moments: [] }),
    async () => undefined, env, async () => 'https://example.invalid/source', () => new Date(T0 + 60_000), async () => false), 'done');
  assertMoved(discovered, discovery, beforeDiscovery);

  const ocr = 'stamp_ocr';
  const ocrRoot = `matchAnalysisJobs/${ocr}`;
  const ocrCurrent = `${ocrRoot}/tracking/current`;
  let clock = T0;
  const now = () => new Date(clock += 1000);
  const refreshing = fakeDb({
    [ocrRoot]: { playerId: 'owner', targeting: { jerseyNumber: '20' } },
    [`${ocrRoot}/tracking/progress`]: { generation: 1, outcome: null, startedAt: OLD },
    [`${ocrRoot}/tracking/feedback`]: { entries: [], periods: {}, offPitch: [], revision: 0 },
    [ocrCurrent]: { version: 1, stale: false, feedbackRevision: 0, updatedAt: OLD, report: { saved: true }, followUp: {
      revision: 0, round: 1, status: 'scheduled', deferredBefore: 1, deferredAfter: null, updatedAt: OLD } },
  });
  const beforeOcr = stampOf(refreshing, ocrCurrent);
  const seen: string[] = [];
  assert.equal(await processOcrFollowUpTask(refreshing.db, ocr, 0, 1, async () => {
    seen.push(String(refreshing.data.get(ocrCurrent)?.updatedAt));
    assert.equal((refreshing.data.get(ocrCurrent)?.followUp as { status: string }).status, 'running');
    return null;
  }, env, async () => undefined, { now, enqueueFollowUp: async () => undefined }), 'rejected');
  assert.notEqual(seen[0], OLD);
  const afterOcr = assertMoved(refreshing, ocrCurrent, beforeOcr);
  assert.notEqual(afterOcr.at, seen[0], 'the failed round is a second write');
  assert.equal((refreshing.data.get(ocrCurrent)?.followUp as { status: string }).status, 'failed');

  const resolve = 'stamp_resolve';
  const resolveCurrent = `matchAnalysisJobs/${resolve}/tracking/current`;
  const resolved = fakeDb({
    [`matchAnalysisJobs/${resolve}`]: { playerId: 'owner', targeting: { jerseyNumber: '20' } },
    [`matchAnalysisJobs/${resolve}/tracking/feedback`]: { entries: [], periods: {}, offPitch: [], revision: 0 },
    [resolveCurrent]: { report: null, version: 0, stale: true, feedbackRevision: 0, updatedAt: OLD },
  });
  const beforeResolve = stampOf(resolved, resolveCurrent);
  assert.equal(await processResolveTask(resolved.db, resolve, 0, async () => ({
    workerVersion: 'football-cv/0.7.0', models: { detector: 'd' }, report: workerReport(),
    timeline: { times: [0, 0.5, 1], states: ['UNKNOWN', 'UNKNOWN', 'CONFIRMED_VISIBLE'] },
  }), env, async () => undefined, { enqueueFollowUp: async () => undefined }), 'done');
  assertMoved(resolved, resolveCurrent, beforeResolve);
});
