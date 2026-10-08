// Full-match pipeline against the Firestore + Storage emulators: segment planning, real ffmpeg
// key-frame extraction from a generated match video, per-user concurrency, retries and dead
// letters, cancellation and the vision step with OpenRouter replaced by a local mock.
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { BUCKET, PROJECT_ID } from './emulator.mjs';
import { mediaFixtures } from './support/mediaFixtures.mjs';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

const OWNER = 'pipeline-owner';
const replies = [];
const received = [];
const queue = [];
const dispatcher = {
  enqueue: async (task, options) => {
    queue.push({ task, delaySeconds: options?.delaySeconds ?? 0 });
  },
};

let server;
let db;
let bucket;
let pipeline;
let segmentPipeline;
let lifecycle;
let identity;
let cvWorker;
let cancelMatchAnalysis;
let analyzeMatchFootage;
let videoBytes;
let VIDEO_CONSENT_VERSION;

function modelReply(content) {
  replies.push({ status: 200, body: { choices: [{ message: { content } }] } });
}

function call(uid, data) {
  return { data, auth: { uid, token: {} }, rawRequest: { headers: {} }, acceptsStreaming: false };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    return true;
  });
}

async function seedConsent(jobId, overrides = {}) {
  await db.collection('videoProcessingConsents').doc(jobId).set({
    uid: OWNER,
    jobId,
    purpose: 'match_analysis',
    analysisMode: 'MATCH_CLIP',
    processingMode: 'cloud_video',
    providers: ['pitchproof_cloud', 'openrouter_zdr'],
    policyVersion: VIDEO_CONSENT_VERSION,
    retainSource: false,
    keepForRetry: false,
    evidenceClips: false,
    consentedAt: new Date().toISOString(),
    revokedAt: null,
    ...overrides,
  });
}

async function seedValidatedJob(jobId, overrides = {}, { consent = true } = {}) {
  const videoStoragePath = `profiles/${OWNER}/matchFootage/${jobId}/video.mp4`;
  await bucket.file(videoStoragePath).save(videoBytes, { contentType: 'video/mp4' });
  if (consent) await seedConsent(jobId);
  await db.collection('matchAnalysisJobs').doc(jobId).set({
    id: jobId,
    playerId: OWNER,
    status: 'uploading',
    pipelineState: 'validating',
    targeting: { jerseyNumber: '8', kitPrimaryColor: 'red', kitSecondaryColor: 'white' },
    match: { opponent: 'FC Test', competition: 'League', date: '2026-10-01' },
    durationSec: 600,
    measuredDurationSec: 600,
    videoStoragePath,
    videoProbe: { width: 160, height: 90 },
    frames: [],
    identityConfirmation: { state: 'pending' },
    ...overrides,
  });
}

const job = async (jobId) => (await db.collection('matchAnalysisJobs').doc(jobId).get()).data();

/** Runs queued tasks like Cloud Tasks would, skipping delayed re-deliveries. */
async function drain({ extractor, finalAttempt = false } = {}) {
  const deferred = [];
  while (queue.length > 0) {
    const { task, delaySeconds } = queue.shift();
    if (delaySeconds > 0) {
      deferred.push({ task, delaySeconds });
      continue;
    }
    if (task.kind === 'extract_segment') {
      await pipeline.processExtractTask(db, task, { finalAttempt, dispatcher, ...(extractor ? { extractor } : {}) });
    } else if (task.kind === 'review_segment') {
      await segmentPipeline.processReviewTask(db, task, { finalAttempt, apiKey: 'test-key', dispatcher });
    } else if (task.kind === 'synthesize_report') {
      await segmentPipeline.processSynthesisTask(db, task, { finalAttempt, apiKey: 'test-key' });
    } else {
      await pipeline.processAnalyzeTask(db, task, { finalAttempt, apiKey: 'test-key' });
    }
  }
  return deferred;
}

before(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      received.push({ url: req.url, body: body ? JSON.parse(body) : null });
      const next = replies.shift() ?? { status: 500, body: { error: { message: 'no canned reply' } } };
      res.writeHead(next.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(next.body));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.OPENROUTER_API_KEY = 'test-key';
  process.env.OPENROUTER_TEST_MODELS = 'mock/model';
  process.env.OPENROUTER_VISION_MODEL = 'mock/model';
  process.env.OPENROUTER_MODEL = 'mock/model';

  if (!getApps().length) initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET });
  db = getFirestore();
  bucket = getStorage().bucket();
  const { LEGAL_VERSIONS } = require('./lib/legal/legalVersions.generated.js');
  await db.collection('consentRecords').doc(OWNER).set({
    consents: { ai_analysis: { status: 'granted', version: LEGAL_VERSIONS['ai-use-policy'] } },
  });
  require('./lib/analysis/taskDispatcher.js').setTaskDispatcher(dispatcher);
  pipeline = require('./lib/analysis/pipeline.js');
  segmentPipeline = require('./lib/analysis/segmentPipeline.js');
  lifecycle = require('./lib/analysis/mediaLifecycle.js');
  identity = require('./lib/analysis/identityCallable.js');
  cvWorker = require('./lib/analysis/cvWorker.js');
  ({ VIDEO_CONSENT_VERSION } = require('./lib/analysis/videoConsent.js'));
  ({ cancelMatchAnalysis, analyzeMatchFootage } = require('./lib/matchAnalysis.js'));
  videoBytes = readFileSync(mediaFixtures().valid10);
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(async () => {
  queue.length = 0;
  replies.length = 0;
  received.length = 0;
  const active = await db.collection('matchAnalysisJobs').where('playerId', '==', OWNER).get();
  await Promise.all(active.docs.map((doc) => db.recursiveDelete(doc.ref)));
  await db.collection('analysisQuotas').doc(OWNER).delete();
  delete process.env.CV_WORKER_URL;
  delete process.env.CV_WORKER_APPROVED;
  delete process.env.CV_EVENTS_VALIDATED;
  cvWorker.setCvSegmentClient(null);
});

/** Writes `count` JPEG-typed frames for a segment, like the ffmpeg extractor does. */
function stubExtractor(count = 4) {
  return {
    extract: async ({ uid, jobId, segment }) => {
      const frames = [];
      for (let position = 0; position < count; position += 1) {
        const index = segment.index * 100 + position;
        const storagePath = `profiles/${uid}/matchFootage/${jobId}/frames/frame_${index}.jpg`;
        await bucket.file(storagePath).save(Buffer.from([0xff, 0xd8, 0xff, 0xe0, index % 255]), { contentType: 'image/jpeg' });
        frames.push({
          id: `frame_${index}`,
          index,
          timestampSec: segment.startSec + position * 60,
          storagePath,
          downloadUrl: '',
          source: 'server',
        });
      }
      return frames;
    },
  };
}

async function listJobObjects(jobId) {
  const [files] = await bucket.getFiles({ prefix: `profiles/${OWNER}/matchFootage/${jobId}/` });
  return files.map((file) => file.name.slice(`profiles/${OWNER}/matchFootage/${jobId}/`.length)).sort();
}

describe('full-match pipeline', () => {
  test('extracts key frames server-side and completes with frame-bound evidence only', async () => {
    await seedValidatedJob('pipe-full');
    assert.equal(await pipeline.startMatchPipeline(db, 'pipe-full', dispatcher), 'queued');
    let state = await job('pipe-full');
    assert.equal(state.status, 'queued');
    assert.equal(state.extractionSegments.length, 1);
    assert.equal(queue.length, 1);

    modelReply(
      JSON.stringify({
        headline: 'Sampled frames reviewed',
        observations: [
          { frameId: 'frame_0', timestampSec: 0, kind: 'observation', label: 'Start', detail: '#8 visible at kick-off' },
          { frameId: 'frame_9999', timestampSec: 5, label: 'Invented', detail: 'Not a real frame' },
        ],
        estimatedStats: { goals: 3 },
      }),
    );
    await drain();

    state = await job('pipe-full');
    assert.equal(state.status, 'complete', state.error);
    assert.equal(state.pipelineState, 'completed');
    assert.ok(state.frames.length >= 3, `extracted ${state.frames.length} frames`);
    assert.ok(state.frames.every((frame) => frame.storagePath.startsWith(`profiles/${OWNER}/matchFootage/pipe-full/frames/frame_`)));
    assert.ok(state.frames.every((frame) => frame.timestampSec >= 0 && frame.timestampSec <= 600));
    assert.ok(state.frames.at(-1).timestampSec > 300, 'frames span the whole segment');
    const [stored] = await bucket.file(state.frames[0].storagePath).getMetadata();
    assert.equal(stored.contentType, 'image/jpeg');

    assert.equal(state.extractionSegments[0].state, 'complete');
    const stages = Object.fromEntries(state.pipelineStages.map((stage) => [stage.id, stage]));
    assert.equal(stages['frame-extraction'].status, 'complete');
    assert.equal(stages['player-tracking'].status, 'unavailable');
    assert.equal(stages['event-detection'].status, 'unavailable');
    assert.ok(state.pipelineStages.every((stage) => stage.progress === null));

    assert.deepEqual(state.report.evidence.map((item) => item.frameIds[0]), ['frame_0']);
    assert.ok(Object.values(state.report.estimatedStats).every((value) => value === null));
    assert.equal(state.report.sampledCoverage.segmentCount, 1);
    assert.ok(state.report.availability.every((window) => ['confirmed_visible', 'unknown'].includes(window.state)));
    assert.equal(state.report.confidenceDimensions.videoQuality, 'Insufficient');

    const images = received[0].body.messages[1].content.filter((part) => part.type === 'image_url');
    assert.ok(images.length >= 3 && images.length <= 18);
    assert.deepEqual(received[0].body.provider, { data_collection: 'deny', zdr: true });
  });

  test('one active pipeline per player; the next job waits in the queue', async () => {
    await seedValidatedJob('pipe-busy', { status: 'processing', pipelineState: 'extracting' });
    await seedValidatedJob('pipe-waiting');
    await pipeline.startMatchPipeline(db, 'pipe-waiting', dispatcher);
    const deferred = await drain();
    assert.equal(deferred.length, 1);
    assert.equal(deferred[0].delaySeconds, pipeline.CONCURRENCY_RETRY_DELAY_SEC);
    assert.equal((await job('pipe-waiting')).pipelineState, 'queued');
  });

  test('a failing segment is retried, then dead-lettered, and the job fails honestly', async () => {
    await seedValidatedJob('pipe-dead');
    await pipeline.startMatchPipeline(db, 'pipe-dead', dispatcher);
    const broken = { extract: async () => { throw new Error('decoder crashed'); } };
    const [first] = queue.splice(0, 1);
    await assert.rejects(pipeline.processExtractTask(db, first.task, { finalAttempt: false, dispatcher, extractor: broken }));
    let state = await job('pipe-dead');
    assert.equal(state.extractionSegments[0].state, 'pending');
    assert.equal(state.extractionSegments[0].attempts, 1);

    await pipeline.processExtractTask(db, first.task, { finalAttempt: true, dispatcher, extractor: broken });
    state = await job('pipe-dead');
    assert.equal(state.extractionSegments[0].state, 'failed');
    assert.equal(state.status, 'failed');
    assert.equal(state.errorCode, 'extraction_failed');
    assert.equal(state.report, undefined);
    assert.equal(queue.length, 0, 'no analysis is queued without frames');
  });

  test('retrying a failed extraction restarts the pipeline with a new generation', async () => {
    await seedValidatedJob('pipe-retry', { status: 'failed', pipelineState: 'failed', errorCode: 'extraction_failed', pipelineGeneration: 1 });
    const result = await analyzeMatchFootage.run(call(OWNER, { jobId: 'pipe-retry' }));
    assert.equal(result.status, 'queued');
    const state = await job('pipe-retry');
    assert.equal(state.pipelineGeneration, 2);
    assert.equal(state.status, 'queued');
    assert.equal(queue.length, 1);
    assert.equal(queue[0].task.generation, 2);
  });

  test('tasks from an older generation are ignored', async () => {
    await seedValidatedJob('pipe-stale');
    await pipeline.startMatchPipeline(db, 'pipe-stale', dispatcher);
    const stale = { ...queue[0].task, generation: 0 };
    assert.equal(await pipeline.processExtractTask(db, stale, { finalAttempt: false, dispatcher }), 'skipped');
    assert.equal((await job('pipe-stale')).extractionSegments[0].attempts, 0);
  });

  test('an unavailable model is retried by the queue, then recorded as a failure', async () => {
    await seedValidatedJob('pipe-model');
    await pipeline.startMatchPipeline(db, 'pipe-model', dispatcher);
    replies.push({ status: 503, body: {} });
    await assert.rejects(drain());
    let state = await job('pipe-model');
    assert.equal(state.errorCode, 'model_unavailable');
    const analyzeTask = { kind: 'analyze_frames', jobId: 'pipe-model', generation: state.pipelineGeneration };
    replies.push({ status: 503, body: {} });
    assert.equal(await pipeline.processAnalyzeTask(db, analyzeTask, { finalAttempt: true, apiKey: 'test-key' }), 'failed');
    state = await job('pipe-model');
    assert.equal(state.status, 'failed');
    assert.equal(state.report, undefined);
  });
});

describe('cancelMatchAnalysis', () => {
  test('only the owner can cancel; queued work is then skipped', async () => {
    await seedValidatedJob('pipe-cancel');
    await pipeline.startMatchPipeline(db, 'pipe-cancel', dispatcher);
    await expectCode(cancelMatchAnalysis.run(call('intruder', { jobId: 'pipe-cancel' })), 'permission-denied');
    const result = await cancelMatchAnalysis.run(call(OWNER, { jobId: 'pipe-cancel' }));
    assert.equal(result.status, 'cancelled');
    await drain();
    const state = await job('pipe-cancel');
    assert.equal(state.status, 'cancelled');
    assert.equal(state.frames.length, 0);
    assert.equal(received.length, 0);
    assert.equal(await pipeline.startMatchPipeline(db, 'pipe-cancel', dispatcher), 'skipped');
  });

  test('a completed analysis is not altered by cancel', async () => {
    await seedValidatedJob('pipe-done', { status: 'complete', pipelineState: 'completed', report: { headline: 'kept' } });
    const result = await cancelMatchAnalysis.run(call(OWNER, { jobId: 'pipe-done' }));
    assert.equal(result.status, 'complete');
    assert.equal((await job('pipe-done')).report.headline, 'kept');
  });
});

describe('video consent and media lifecycle', () => {
  test('analysis refuses to run without a per-job video consent', async () => {
    await seedValidatedJob('pipe-noconsent', {}, { consent: false });
    await pipeline.startMatchPipeline(db, 'pipe-noconsent', dispatcher);
    await drain();
    const state = await job('pipe-noconsent');
    assert.equal(state.status, 'failed');
    assert.equal(state.errorCode, 'video_consent_required');
    assert.equal(received.length, 0, 'no frame reached the model');
  });

  test('after completion the source and uncited frames are deleted; cited frames stay private', async () => {
    await seedValidatedJob('pipe-clean');
    await pipeline.startMatchPipeline(db, 'pipe-clean', dispatcher);
    modelReply(JSON.stringify({
      headline: 'Reviewed',
      observations: [{ frameId: 'frame_0', timestampSec: 0, kind: 'observation', label: 'Start', detail: '#8 at kick-off' }],
    }));
    await drain();
    let state = await job('pipe-clean');
    assert.equal(state.status, 'complete');
    assert.ok(state.frames.length > 1);

    assert.equal(await lifecycle.onJobStatusChanged(db, 'pipe-clean', { status: 'processing' }, state), 'cleaned');
    state = await job('pipe-clean');
    assert.equal(state.videoStoragePath, null);
    assert.deepEqual(state.frames.map((frame) => frame.id), ['frame_0']);
    assert.deepEqual(await listJobObjects('pipe-clean'), ['frames/frame_0.jpg']);
    assert.equal(state.mediaCleanupState, 'done');
    assert.equal(state.mediaLifecycle.source, 'deleted');
    assert.deepEqual(state.evidenceClips, []);

    // Idempotent: a second run changes nothing.
    assert.equal(await lifecycle.applyMediaLifecycle(db, 'pipe-clean'), null);
  });

  test('"Keep match video" keeps the source and its library entry; evidence clips only when asked', async () => {
    await seedValidatedJob('pipe-keep', { retainSource: true, evidenceClipsRequested: true });
    await db.collection('players').doc(OWNER).collection('media').doc('footage_pipe-keep').set({ ownerId: OWNER });
    const cut = [];
    lifecycle.setClipCutter({
      cut: async ({ destination, clip }) => {
        cut.push(clip);
        await bucket.file(destination).save(Buffer.from('clip'), { contentType: 'video/mp4' });
      },
    });
    await pipeline.startMatchPipeline(db, 'pipe-keep', dispatcher);
    modelReply(JSON.stringify({
      observations: [{ frameId: 'frame_0', timestampSec: 0, kind: 'observation', label: 'Start', detail: '#8 visible' }],
    }));
    await drain();
    await lifecycle.onJobStatusChanged(db, 'pipe-keep', { status: 'processing' }, await job('pipe-keep'));
    const state = await job('pipe-keep');
    assert.equal(state.videoStoragePath, `profiles/${OWNER}/matchFootage/pipe-keep/video.mp4`);
    assert.deepEqual(await listJobObjects('pipe-keep'), ['clips/clip_0.mp4', 'frames/frame_0.jpg', 'video.mp4']);
    assert.equal(cut.length, 1);
    assert.ok(cut[0].durationSec <= 8);
    assert.ok((await db.collection('players').doc(OWNER).collection('media').doc('footage_pipe-keep').get()).exists);
  });

  test('a failed job keeps its media for the retry window, then the sweep removes it', async () => {
    await seedValidatedJob('pipe-window', { status: 'failed', pipelineState: 'failed', errorCode: 'model_unavailable' });
    await db.collection('players').doc(OWNER).collection('media').doc('footage_pipe-window').set({ ownerId: OWNER });
    const now = new Date();
    assert.equal(await lifecycle.onJobStatusChanged(db, 'pipe-window', { status: 'processing' }, await job('pipe-window'), now), 'scheduled');
    assert.equal((await job('pipe-window')).mediaCleanupState, 'retry_window');
    assert.equal(await lifecycle.sweepMediaLifecycle(db, now), 0, 'not due yet');
    assert.ok((await listJobObjects('pipe-window')).includes('video.mp4'));

    const later = new Date(now.getTime() + 25 * 3_600_000);
    assert.equal(await lifecycle.sweepMediaLifecycle(db, later), 1);
    assert.deepEqual(await listJobObjects('pipe-window'), []);
    assert.equal((await db.collection('players').doc(OWNER).collection('media').doc('footage_pipe-window').get()).exists, false);
  });

  test('deleting a job removes its storage and server subcollections', async () => {
    await seedValidatedJob('pipe-delete');
    await db.collection('matchAnalysisJobs').doc('pipe-delete').collection('segmentReviews').doc('0').set({ x: 1 });
    await lifecycle.purgeDeletedJob(db, 'pipe-delete', OWNER);
    assert.deepEqual(await listJobObjects('pipe-delete'), []);
    assert.equal((await db.collection('matchAnalysisJobs').doc('pipe-delete').collection('segmentReviews').get()).size, 0);
  });
});

describe('segment review, synthesis and identity', () => {
  const review = (frameId) => JSON.stringify({
    frames: [{ frameId, targetVisible: 'yes', cameraView: 'wide' }],
    observations: [{ frameId, category: 'technique', label: 'First touch', detail: 'Cushions a pass with the right foot', confidence: 'medium' }],
    possibleEvents: [{ type: 'pass', frameIds: [frameId], note: 'Looks like a short pass' }],
    summary: 'Wide camera.',
  });

  test('longer videos are reviewed per segment, synthesised from observations, coaching held until identity', async () => {
    await seedValidatedJob('pipe-seg', { durationSec: 1500, measuredDurationSec: 1500, analysisMode: 'FULL_MATCH' });
    await pipeline.startMatchPipeline(db, 'pipe-seg', dispatcher);
    modelReply(review('frame_0'));
    modelReply(review('frame_100'));
    modelReply('not json at all');
    modelReply(JSON.stringify({
      headline: 'Tidy in possession',
      strengths: [{ text: 'Clean first touch', observationIds: ['s0_o1', 's1_o1'] }, { text: 'Scored a hat-trick', observationIds: ['s9_o9'] }],
      opportunities: [{ title: 'Scan earlier', why: 'Receives square-on', drill: 'Rondo with scanning call', observationIds: ['s1_o1'] }],
      techniqueAssessment: { firstTouch: { stars: 4, summary: 'Soft', tip: 'Wall passes', frameIds: ['frame_0', 'frame_100'] } },
    }));
    await drain({ extractor: stubExtractor(3) });

    let state = await job('pipe-seg');
    assert.equal(state.status, 'complete', state.error);
    assert.deepEqual(state.segmentReview.reviewed.sort(), [0, 1]);
    assert.deepEqual(state.segmentReview.failed, [2], 'an unparseable review is recorded, not invented');
    assert.equal(state.identityCandidates[0].frameId, 'frame_0', 'early "Is this you?" from the first reviewed segment');

    const report = state.report;
    assert.equal(report.analysisMode, 'FULL_MATCH');
    assert.equal(report.evidence.length, 2);
    assert.ok(report.possibleEvents.every((event) => event.status === 'needs_review'));
    assert.ok(Object.values(report.estimatedStats).every((value) => value === null));
    assert.equal(report.eventCounts, null);
    assert.deepEqual(report.strengths, [], 'no coaching before identity is confirmed');
    assert.equal(report.versions.analysisVersion, 1);
    assert.equal(report.versions.reasoningModel, 'mock/model');
    assert.equal(report.versions.cvWorkerVersion, null);
    assert.deepEqual(state.pendingCoaching.strengths, ['Clean first touch']);
    const sections = Object.fromEntries(report.sections.map((section) => [section.id, section]));
    assert.equal(sections.events.reason, 'cv_worker_not_configured');

    const synthesisCall = received.at(-1).body;
    assert.ok(!synthesisCall.messages[1].content.includes?.('image_url'), 'synthesis is text-only');

    await expectCode(
      identity.confirmAnalysisIdentity.run(call(OWNER, { jobId: 'pipe-seg', decision: 'confirmed', frameIds: ['frame_404'] })),
      'invalid-argument',
    );
    await expectCode(
      identity.confirmAnalysisIdentity.run(call('intruder', { jobId: 'pipe-seg', decision: 'confirmed', frameIds: ['frame_0'] })),
      'permission-denied',
    );
    const result = await identity.confirmAnalysisIdentity.run(call(OWNER, { jobId: 'pipe-seg', decision: 'confirmed', frameIds: ['frame_0'] }));
    assert.equal(result.released, true);
    state = await job('pipe-seg');
    assert.deepEqual(state.report.strengths, ['Clean first touch']);
    assert.equal(state.report.opportunities.length, 1);
    assert.equal(state.pendingCoaching, null);
    assert.equal(state.report.sections.find((section) => section.id === 'identity').availability, 'AVAILABLE');
  });

  test('a configured worker without approval is never called', async () => {
    process.env.CV_WORKER_URL = 'http://127.0.0.1:9';
    let calls = 0;
    cvWorker.setCvSegmentClient({ analyzeSegment: async () => { calls += 1; return null; } });
    await seedValidatedJob('pipe-cv-off', { durationSec: 1200, measuredDurationSec: 1200 });
    await pipeline.startMatchPipeline(db, 'pipe-cv-off', dispatcher);
    modelReply(review('frame_0'));
    modelReply(review('frame_100'));
    modelReply(JSON.stringify({ headline: 'ok' }));
    await drain({ extractor: stubExtractor(2) });
    assert.equal(calls, 0);
    assert.equal((await job('pipe-cv-off')).report.versions.cvWorkerVersion, null);
  });

  test('an approved worker feeds tracking windows; its events stay suggestions until validated', async () => {
    process.env.CV_WORKER_URL = 'http://127.0.0.1:9';
    process.env.CV_WORKER_APPROVED = 'true';
    const requests = [];
    cvWorker.setCvSegmentClient({
      analyzeSegment: async (request) => {
        requests.push(request);
        return {
          contractVersion: 2,
          workerVersion: 'football-cv/test',
          segmentIndex: request.segmentIndex,
          stages: { tracking: 'complete', identity: 'complete', events: 'complete', pitch: 'unavailable' },
          cameraView: 'wide',
          identity: { state: 'CONFIRMED_VISIBLE', candidates: [] },
          availability: [{ startSec: request.startSec, endSec: request.startSec + 120, state: 'CONFIRMED_VISIBLE', confidence: 0.8 }],
          coverage: { analysedSec: 600, targetVisibleSec: 120, framesDecoded: 1200 },
          events: [{ type: 'pass', startSec: request.startSec + 10, endSec: request.startSec + 11, confidence: 0.9, frameTimesSec: [request.startSec + 10] }],
        };
      },
    });
    await seedValidatedJob('pipe-cv-on', { durationSec: 1200, measuredDurationSec: 1200 });
    await pipeline.startMatchPipeline(db, 'pipe-cv-on', dispatcher);
    modelReply(review('frame_0'));
    modelReply(review('frame_100'));
    modelReply(JSON.stringify({ headline: 'ok' }));
    await drain({ extractor: stubExtractor(2) });

    assert.equal(requests.length, 2);
    assert.deepEqual(requests[0].privacy, { retainNonTargetIdentities: false, faceRecognition: false, persistMedia: false });
    const report = (await job('pipe-cv-on')).report;
    assert.equal(report.versions.cvWorkerVersion, 'football-cv/test');
    assert.equal(report.coverage.visiblePct, 20);
    assert.ok(report.availability.some((window) => window.state === 'confirmed_visible'));
    const cvEvents = report.possibleEvents.filter((event) => event.source === 'cv_worker');
    assert.equal(cvEvents.length, 2);
    assert.ok(cvEvents.every((event) => event.status === 'needs_review'), 'not validated → not counted');
    assert.equal(report.eventCounts, null);
    assert.equal(report.pipelineStages.find((stage) => stage.id === 'player-tracking').status, 'complete');
  });
});

describe('short clips analysed from device frames', () => {
  test('a consented device-frame clip is analysed without a video upload', async () => {
    const jobId = 'clip-device';
    const frames = [];
    for (let i = 0; i < 8; i += 1) {
      const storagePath = `profiles/${OWNER}/matchFootage/${jobId}/frames/frame_${i}.jpg`;
      await bucket.file(storagePath).save(Buffer.from([0xff, 0xd8, 0xff, i]), { contentType: 'image/jpeg' });
      frames.push({ id: `frame_${i}`, index: i, timestampSec: i * 2, storagePath, downloadUrl: '', source: 'device' });
    }
    await seedConsent(jobId, { analysisMode: 'SHORT_CLIP', processingMode: 'device_frames', providers: ['openrouter_zdr'] });
    await db.collection('matchAnalysisJobs').doc(jobId).set({
      id: jobId,
      playerId: OWNER,
      status: 'uploading',
      analysisMode: 'SHORT_CLIP',
      processingMode: 'device_frames',
      clipContext: 'shot',
      consentVersion: VIDEO_CONSENT_VERSION,
      targeting: { jerseyNumber: '8', kitPrimaryColor: 'red', kitSecondaryColor: 'white' },
      match: { opponent: 'FC Test', competition: 'League', date: '2026-10-01' },
      durationSec: 16,
      frames,
      identityConfirmation: { state: 'pending' },
    });
    modelReply(JSON.stringify({
      actionType: 'shot',
      targetVisible: 'yes',
      whatHappened: { text: 'Shoots low across the keeper', frameIds: ['frame_3', 'frame_4'] },
      observable: [{ text: 'Plant foot beside the ball', frameIds: ['frame_3'] }],
      notObservable: ['Whether it went in'],
      improve: [{ text: 'Keep the head over the ball', frameIds: ['frame_4'] }],
      drill: { objective: 'Low finishing', drill: 'Edge-of-box finishing', repetitions: '3x10', successCriteria: '7/10 low', nextMatchFocus: 'Head over ball' },
      confidence: 'medium',
    }));
    const result = await analyzeMatchFootage.run(call(OWNER, { jobId }));
    assert.equal(result.status, 'complete');
    const state = await job(jobId);
    assert.equal(state.report.analysisMode, 'SHORT_CLIP');
    assert.equal(state.report.clip.actionType, 'shot');
    assert.equal(state.report.clip.whatHappened.timestampSec, 6);
    assert.equal(state.report.clip.drill, null, 'coaching waits for identity');
    assert.equal(state.pendingCoaching.clipCoaching.drill.objective, 'Low finishing');
    const images = received.at(-1).body.messages[1].content.filter((part) => part.type === 'image_url');
    assert.equal(images.length, 8);

    await lifecycle.onJobStatusChanged(db, jobId, { status: 'uploading' }, state);
    assert.deepEqual(await listJobObjects(jobId), ['frames/frame_3.jpg', 'frames/frame_4.jpg']);
  });
});
