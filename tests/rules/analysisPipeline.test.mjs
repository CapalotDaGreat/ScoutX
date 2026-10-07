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
let cancelMatchAnalysis;
let analyzeMatchFootage;
let videoBytes;

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

async function seedValidatedJob(jobId, overrides = {}) {
  const videoStoragePath = `profiles/${OWNER}/matchFootage/${jobId}/video.mp4`;
  await bucket.file(videoStoragePath).save(videoBytes, { contentType: 'video/mp4' });
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

  if (!getApps().length) initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET });
  db = getFirestore();
  bucket = getStorage().bucket();
  const { LEGAL_VERSIONS } = require('./lib/legal/legalVersions.generated.js');
  await db.collection('consentRecords').doc(OWNER).set({
    consents: { ai_analysis: { status: 'granted', version: LEGAL_VERSIONS['ai-use-policy'] } },
  });
  require('./lib/analysis/taskDispatcher.js').setTaskDispatcher(dispatcher);
  pipeline = require('./lib/analysis/pipeline.js');
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
  await Promise.all(active.docs.map((doc) => doc.ref.delete()));
  await db.collection('analysisQuotas').doc(OWNER).delete();
});

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
