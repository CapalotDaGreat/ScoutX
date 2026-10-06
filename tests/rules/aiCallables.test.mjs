// Runs the compiled AI callables against the Firestore/Storage emulators with OpenRouter
// replaced by a local mock server. No real model is called; this checks auth, error
// mapping, response validation and that nothing is fabricated when the model misbehaves.
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { BUCKET, PROJECT_ID } from './emulator.mjs';

const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

/** Queue of canned upstream replies; each request consumes one. */
const replies = [];
const received = [];
let server;
let generateAiInsight;
let analyzeMatchFootage;
let db;
let bucket;

function reply(status, body) {
  replies.push({ status, body });
}

function modelReply(content) {
  reply(200, { choices: [{ message: { content } }] });
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    return true;
  });
}

before(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      received.push({ url: req.url, headers: req.headers, body: body ? JSON.parse(body) : null });
      const next = replies.shift() ?? { status: 500, body: { error: { message: 'no canned reply' } } };
      res.writeHead(next.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(next.body));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.OPENROUTER_API_KEY = 'test-key';
  process.env.OPENROUTER_MODEL = 'mock/model';

  if (!getApps().length) {
    initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET });
  }
  db = getFirestore();
  bucket = getStorage().bucket();
  ({ generateAiInsight } = require('./lib/aiCoach.js'));
  ({ analyzeMatchFootage } = require('./lib/matchAnalysis.js'));
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  replies.length = 0;
  received.length = 0;
  process.env.OPENROUTER_API_KEY = 'test-key';
});

const playerContext = (playerId) => JSON.stringify({ player: { playerId }, matches: [] });

function insightRequest(uid, data, role) {
  return {
    data,
    auth: uid ? { uid, token: role ? { role } : {} } : undefined,
    rawRequest: {},
    acceptsStreaming: false,
  };
}

const validSummary = {
  type: 'performance_summary',
  confidence: 'low',
  title: 'Two matches logged',
  summary: 'Only two matches are logged, so this is a low-confidence summary.',
  highlights: [],
  narrative: 'Not enough data for trends.',
};

describe('generateAiInsight (mocked OpenRouter)', () => {
  test('rejects unauthenticated calls before reaching the model', async () => {
    await expectCode(
      generateAiInsight.run(insightRequest(null, { insightType: 'performance_summary', contextJson: playerContext('p1') })),
      'unauthenticated',
    );
    assert.equal(received.length, 0);
  });

  test('a player cannot request insights about someone else; a scout can', async () => {
    await expectCode(
      generateAiInsight.run(insightRequest('p1', { insightType: 'performance_summary', contextJson: playerContext('p2') })),
      'permission-denied',
    );
    modelReply(JSON.stringify(validSummary));
    const result = await generateAiInsight.run(
      insightRequest('s1', { insightType: 'performance_summary', contextJson: playerContext('p2') }, 'scout'),
    );
    assert.equal(result.payload.type, 'performance_summary');
  });

  test('rejects unknown insight types and malformed context', async () => {
    await expectCode(
      generateAiInsight.run(insightRequest('p1', { insightType: 'rate_my_potential', contextJson: playerContext('p1') })),
      'invalid-argument',
    );
    await expectCode(
      generateAiInsight.run(insightRequest('p1', { insightType: 'performance_summary', contextJson: '{not json' })),
      'invalid-argument',
    );
    assert.equal(received.length, 0);
  });

  test('sends the server-owned prompt with the secret and accepts fenced JSON', async () => {
    modelReply(`\`\`\`json\n${JSON.stringify(validSummary)}\n\`\`\``);
    const result = await generateAiInsight.run(
      insightRequest('p1', { insightType: 'performance_summary', contextJson: playerContext('p1') }),
    );
    assert.equal(result.model, 'mock/model');
    assert.equal(result.payload.summary, validSummary.summary);
    const [call] = received;
    assert.equal(call.url, '/chat/completions');
    assert.equal(call.headers.authorization, 'Bearer test-key');
    assert.match(call.body.messages[0].content, /Do not invent events, statistics/);
  });

  test('maps upstream failures to unavailable', async () => {
    reply(503, { error: { message: 'overloaded' } });
    await expectCode(
      generateAiInsight.run(insightRequest('p1', { insightType: 'performance_summary', contextJson: playerContext('p1') })),
      'unavailable',
    );
  });

  test('rejects unreadable, empty, mismatched or incomplete model output', async () => {
    const call = () =>
      generateAiInsight.run(insightRequest('p1', { insightType: 'performance_summary', contextJson: playerContext('p1') }));
    modelReply('Sure! Here is your summary: great player.');
    await expectCode(call(), 'internal');
    reply(200, { choices: [{ message: { content: '' } }] });
    await expectCode(call(), 'internal');
    modelReply(JSON.stringify({ ...validSummary, type: 'potential_analysis' }));
    await expectCode(call(), 'internal');
    modelReply(JSON.stringify({ ...validSummary, summary: '' }));
    await expectCode(call(), 'internal');
  });

  test('fails closed when the API key is missing', async () => {
    process.env.OPENROUTER_API_KEY = '';
    await expectCode(
      generateAiInsight.run(insightRequest('p1', { insightType: 'performance_summary', contextJson: playerContext('p1') })),
      'failed-precondition',
    );
    assert.equal(received.length, 0);
  });
});

const OWNER = 'analysis-owner';

async function seedJob(jobId, { frames = 3, playerId = OWNER, identity = 'pending', foreignPath = false } = {}) {
  const frameDocs = [];
  for (let index = 0; index < frames; index += 1) {
    const storagePath = foreignPath
      ? `profiles/someone-else/matchFootage/${jobId}/frames/frame_${index}.jpg`
      : `profiles/${playerId}/matchFootage/${jobId}/frames/frame_${index}.jpg`;
    await bucket.file(storagePath).save(Buffer.alloc(64, 1), { contentType: 'image/jpeg' });
    frameDocs.push({ id: `frame_${index}`, index, timestampSec: index * 10, storagePath, downloadUrl: '' });
  }
  await db.collection('matchAnalysisJobs').doc(jobId).set({
    playerId,
    status: 'queued',
    targeting: { jerseyNumber: '8', kitPrimaryColor: 'red', kitSecondaryColor: 'white' },
    match: { opponent: 'FC Test', competition: 'League', date: '2026-10-01' },
    durationSec: 60,
    frames: frameDocs,
    attempts: 0,
    identityConfirmation: { state: identity },
  });
}

function analysisRequest(uid, jobId) {
  return { data: { jobId }, auth: { uid, token: {} }, rawRequest: {}, acceptsStreaming: false };
}

describe('analyzeMatchFootage (mocked OpenRouter vision)', () => {
  test('completes with frame-bound evidence only and never fills match stats', async () => {
    await seedJob('job-ok');
    modelReply(
      JSON.stringify({
        headline: 'Pressing visible in sampled frames',
        strengths: ['Good body shape'],
        improvements: ['Scan earlier'],
        coachingNotes: 'Keep pressing.',
        observations: [
          { frameId: 'frame_1', timestampSec: 10, kind: 'observation', label: 'Press', detail: '#8 closes the passer' },
          { frameId: 'frame_99', timestampSec: 20, label: 'Invented', detail: 'Not a sampled frame' },
          { frameId: 'frame_2', timestampSec: 999, label: 'Out of range', detail: 'After the video ends' },
        ],
        estimatedStats: { goals: 2, passesCompleted: 41 },
      }),
    );
    const result = await analyzeMatchFootage.run(analysisRequest(OWNER, 'job-ok'));
    assert.equal(result.status, 'complete');

    const job = (await db.collection('matchAnalysisJobs').doc('job-ok').get()).data();
    assert.equal(job.status, 'complete');
    assert.equal(job.lease, null);
    assert.deepEqual(job.events, []);
    assert.deepEqual(
      job.report.evidence.map((item) => item.frameIds[0]),
      ['frame_1'],
    );
    assert.ok(Object.values(job.report.estimatedStats).every((value) => value === null));
    // Identity is not confirmed, so player-specific coaching is withheld.
    assert.deepEqual(job.report.strengths, []);
    assert.equal(job.report.coachingNotes, '');
    const quota = (await db.collection('analysisQuotas').doc(OWNER).get()).data();
    assert.ok(quota.count >= 1);
    assert.equal(received[0].body.messages[1].content.filter((part) => part.type === 'image_url').length, 3);
  });

  test('marks the job failed and releases the lease when the model call fails', async () => {
    await seedJob('job-upstream');
    reply(500, { error: { message: 'upstream down' } });
    await expectCode(analyzeMatchFootage.run(analysisRequest(OWNER, 'job-upstream')), 'internal');
    const job = (await db.collection('matchAnalysisJobs').doc('job-upstream').get()).data();
    assert.equal(job.status, 'failed');
    assert.equal(job.lease, null);
    assert.equal(job.report, undefined);
  });

  test('marks the job failed when the model output is not JSON', async () => {
    await seedJob('job-garbage');
    modelReply('The player had a great game with 3 goals.');
    await expectCode(analyzeMatchFootage.run(analysisRequest(OWNER, 'job-garbage')), 'internal');
    const job = (await db.collection('matchAnalysisJobs').doc('job-garbage').get()).data();
    assert.equal(job.status, 'failed');
    assert.equal(job.report, undefined);
  });

  test("refuses another user's job without calling the model", async () => {
    await seedJob('job-foreign');
    await expectCode(analyzeMatchFootage.run(analysisRequest('intruder', 'job-foreign')), 'permission-denied');
    assert.equal(received.length, 0);
  });

  test('ignores frames outside the owner path and fails with too few readable frames', async () => {
    await seedJob('job-paths', { foreignPath: true });
    await expectCode(analyzeMatchFootage.run(analysisRequest(OWNER, 'job-paths')), 'failed-precondition');
    const job = (await db.collection('matchAnalysisJobs').doc('job-paths').get()).data();
    assert.equal(job.status, 'failed');
    assert.equal(received.length, 0);
  });

  test('does not re-run a completed job', async () => {
    await expectCode(analyzeMatchFootage.run(analysisRequest(OWNER, 'job-ok')), 'already-exists');
    assert.equal(received.length, 0);
  });
});
