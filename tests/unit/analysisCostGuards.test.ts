import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callChat, parseUsage } from '../../functions/src/ai/openRouter.ts';
import { setEmulatorCvApproval } from '../../functions/src/analysis/cvConfig.ts';
import { processResolveTask } from '../../functions/src/analysis/trackingCallables.ts';
import { newProgress, type TrackingProgress } from '../../functions/src/analysis/trackingProgress.ts';
import { explainMoment, type ReasoningDeps } from '../../functions/src/analysis/trackingReasoning.ts';
import { emptyFeedback } from '../../functions/src/analysis/trackingV3.ts';
import { reasoningCacheId } from '../../functions/src/analysis/videoReasoning.ts';
import { VIDEO_CONSENT_VERSION } from '../../functions/src/analysis/videoConsent.ts';
import { JOB, UID, fakeDb, runAnalysis } from './support/analysisBench.ts';

type Doc = Record<string, unknown>;

// ------------------------------------------------------------------ provider usage

test('callChat surfaces provider token usage, tolerates its absence and never invents it', async () => {
  const real = globalThis.fetch;
  const reply = (body: unknown) => {
    globalThis.fetch = (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
  };
  const args = { apiKey: 'k', model: 'google/gemini-2.5-flash', title: 't', messages: [] };
  try {
    reply({ choices: [{ message: { content: '{}' } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
    assert.deepEqual(await callChat(args), { ok: true, content: '{}', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } });
    reply({ choices: [{ message: { content: '{}' } }] });
    assert.deepEqual(await callChat(args), { ok: true, content: '{}' }, 'no usage block: nothing is made up');
    reply({ choices: [{ message: { content: '{}' } }], usage: { prompt_tokens: 'x', completion_tokens: 5 } });
    assert.deepEqual(await callChat(args), { ok: true, content: '{}' }, 'malformed usage is dropped');
    reply({ choices: [{ message: { content: '' } }], usage: { prompt_tokens: 10, completion_tokens: 0 } });
    assert.deepEqual(await callChat(args), { ok: false, kind: 'empty' }, 'the empty-answer contract is unchanged');
  } finally {
    globalThis.fetch = real;
  }
});

test('provider usage rejects fractional/unsafe token counts and malformed response bodies', async () => {
  for (const prompt_tokens of [1.5, -1, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(parseUsage({ prompt_tokens, completion_tokens: 1 }), undefined);
  }
  const real = globalThis.fetch;
  try {
    for (const body of [null, { choices: [{ message: { content: { bad: 'value' } } }] }, { choices: [{ message: { content: '  ' } }] }]) {
      globalThis.fetch = (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
      assert.deepEqual(await callChat({ apiKey: 'k', model: 'test', title: 'test', messages: [] }), { ok: false, kind: 'empty' });
    }
  } finally { globalThis.fetch = real; }
});

// ------------------------------------------------------------------ resolve guards

const TRACKING = `matchAnalysisJobs/${JOB}/tracking`;
const ENV = { FUNCTIONS_EMULATOR: 'true', CV_WORKER_URL: 'http://localhost:9', CV_WORKER_APPROVED: 'true', TRACKING_V3_ENABLED: 'true' };
const APPROVAL = { workerVersion: 'football-cv/0.7.0', models: { detector: 'd' }, eventsApproved: false } as never;
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');

function workerReport(parts: number) {
  return {
    schema: 'pitchproof.tracking.v3', engine: { version: '3.3.0' }, target: { number: '20', kit: 'orange', kit2: '', position: 'winger' },
    timeline: { periods: [{ start: 0, end: 600, kind: 'play', label: 'play', source: 'detected' }] },
    coverage: { recordingSec: 600, nonMatchSec: 0, offPitchSec: 0, matchSec: 600, unobservedSec: 0, analysedSec: 600,
      confirmedVisibleSec: 30, likelyVisibleSec: 100, ambiguousSec: 200, notIdentifiedSec: 270 },
    identity: { statesSec: { CONFIRMED_VISIBLE: 30 }, numberSightings: 1, confirmedByUser: 0 },
    physical: { status: 'unavailable', productionVisible: false, reason: 'no calibration', values: {}, sprints: [], highSpeedRuns: [],
      thresholds: { sprint_kmh: 19.8, hsr_kmh: 14.4 } },
    ball: { contacts: 1, carries: 0, passAttempts: 0, completedPasses: 0, incompletePasses: 0, unknownOutcomePasses: 0 },
    events: [{ type: 'contact', start: 40, end: 40.5, identityState: 'CONFIRMED_VISIBLE', evidenceTimes: [40], confidence: 0.6 }],
    moments: [{ id: 'm_360', kind: 'contact', kinds: ['contact'], start: 40, end: 40.5, clipStart: 36, clipEnd: 43.5,
      identityState: 'CONFIRMED_VISIBLE', candidate: false, indicator: [[40, 0.1, 0.2, 0.05, 0.1]], imageJpegBase64: JPEG }],
    analysedRange: { startSec: 0, endSec: parts * 100, parts },
    reviewQuestions: [],
  };
}

type Setup = { progress: TrackingProgress; current?: Doc; feedbackRevision?: number };

function resolveFixture({ progress, current, feedbackRevision }: Setup) {
  const seed: Record<string, Doc> = {
    [`matchAnalysisJobs/${JOB}`]: { playerId: UID, targeting: { jerseyNumber: '20', kitPrimaryColor: 'orange' },
      videoStoragePath: 'profiles/u/matchFootage/j/source.mp4', measuredDurationSec: 600, durationSec: 600 },
    [`${TRACKING}/progress`]: progress as unknown as Doc,
    ...(current ? { [`${TRACKING}/current`]: current } : {}),
    ...(feedbackRevision ? { [`${TRACKING}/feedback`]: { ...emptyFeedback(), revision: feedbackRevision } as unknown as Doc } : {}),
  };
  const fake = fakeDb(seed);
  const stored: string[] = [];
  const calls = { n: 0 };
  const worker = (parts: number, hook?: () => void) => async () => {
    calls.n += 1;
    hook?.();
    return { workerVersion: 'football-cv/0.7.0', models: { detector: 'd' }, report: workerReport(parts) };
  };
  return { fake, stored, calls, worker, store: async (path: string) => { stored.push(path); } };
}

const notify = async () => false;
const newRun = () => newProgress(1, 600, '2026-11-20T10:00:00.000Z');
const finish = (p: TrackingProgress, count = p.plan.length) => {
  for (const s of p.plan.slice(0, count)) p.segments[String(s.index)] = { status: 'done', attempts: 1 };
  return p;
};

async function withApproval<T>(run: () => Promise<T>): Promise<T> {
  setEmulatorCvApproval(APPROVAL);
  try {
    return await run();
  } finally {
    setEmulatorCvApproval(null);
  }
}

test('resolve: a preliminary resolve is skipped once every segment is done or the full report is published', () => withApproval(async () => {
  const finished = resolveFixture({ progress: finish(newRun()) });
  assert.equal(await processResolveTask(finished.fake.db, JOB, 0, finished.worker(3), ENV, finished.store, { scope: 'preliminary', notify }), 'stale');
  assert.equal(finished.calls.n, 0, 'no worker resolve is spent on a report the full resolve supersedes');
  assert.equal(finished.stored.length, 0);
  assert.equal(finished.fake.data.has(`${TRACKING}/current`), false);

  const published = newRun();
  finish(published, 1);
  published.full = { scope: 'full', parts: published.plan.length, analysedEndSec: 600, moments: 1, reviewQuestions: 0, at: 'x' };
  const afterFull = resolveFixture({ progress: published });
  assert.equal(await processResolveTask(afterFull.fake.db, JOB, 0, afterFull.worker(1), ENV, afterFull.store, { scope: 'preliminary', notify }), 'stale');
  assert.equal(afterFull.calls.n, 0, 'a late retry of a preliminary resolve after the full report does nothing');
}));

test('resolve: useful work is never skipped (preliminary with segments left, full, and feedback re-resolves)', () => withApproval(async () => {
  const early = resolveFixture({ progress: finish(newRun(), 1) });
  assert.equal(await processResolveTask(early.fake.db, JOB, 0, early.worker(1), ENV, early.store, { scope: 'preliminary', notify }), 'done');
  assert.equal(early.calls.n, 1);
  assert.ok(early.stored.length > 0, 'its review images are stored');
  assert.equal((early.fake.data.get(`${TRACKING}/current`) as { scope: string }).scope, 'preliminary');

  const total = newRun().plan.length;
  const full = resolveFixture({ progress: finish(newRun()) });
  assert.equal(await processResolveTask(full.fake.db, JOB, 0, full.worker(total), ENV, full.store, { scope: 'full', notify }), 'done');
  assert.equal((full.fake.data.get(`${TRACKING}/current`) as { scope: string }).scope, 'full');

  const current = { report: { moments: [], reviewQuestions: [] }, version: 3, scope: 'full', parts: total, stale: true, feedbackRevision: 0 };
  const feedback = resolveFixture({ progress: finish(newRun()), current, feedbackRevision: 1 });
  assert.equal(await processResolveTask(feedback.fake.db, JOB, 1, feedback.worker(total), ENV, feedback.store, { scope: 'feedback', notify }), 'done');
  assert.equal((feedback.fake.data.get(`${TRACKING}/current`) as { version: number }).version, 4, 'a correction still republishes a full report');
  assert.ok(feedback.stored.length > 0);
}));

test('resolve: images are not stored for a report that cannot replace the current one or was superseded mid-call', () => withApproval(async () => {
  const total = newRun().plan.length;
  const current = { report: { moments: [], reviewQuestions: [] }, version: 3, scope: 'full', parts: total, stale: false, feedbackRevision: 0 };
  const smaller = resolveFixture({ progress: finish(newRun(), 1), current });
  assert.equal(await processResolveTask(smaller.fake.db, JOB, 0, smaller.worker(1), ENV, smaller.store, { scope: 'preliminary', notify }), 'stale');
  assert.equal(smaller.calls.n, 1, 'the worker ran: only the uploads are avoided');
  assert.equal(smaller.stored.length, 0, 'no thumbnails for a report that is discarded');
  assert.equal((smaller.fake.data.get(`${TRACKING}/current`) as { version: number }).version, 3, 'the fuller report stays untouched');

  const racing = resolveFixture({ progress: finish(newRun(), 1) });
  const bump = () => racing.fake.data.set(`${TRACKING}/feedback`, { ...emptyFeedback(), revision: 1 } as unknown as Doc);
  assert.equal(await processResolveTask(racing.fake.db, JOB, 0, racing.worker(1, bump), ENV, racing.store, { scope: 'preliminary', notify }), 'superseded');
  assert.equal(racing.stored.length, 0, 'an answer given while the worker ran supersedes the result before any upload');
  assert.equal(racing.fake.data.has(`${TRACKING}/current`), false);
}));

test('resolve: cancellation while the worker runs prevents image uploads and publication', () => withApproval(async () => {
  const f = resolveFixture({ progress: finish(newRun(), 1) });
  const cancel = () => {
    const path = `matchAnalysisJobs/${JOB}`;
    f.fake.data.set(path, { ...f.fake.data.get(path), cancelRequested: true });
  };
  assert.equal(await processResolveTask(f.fake.db, JOB, 0, f.worker(1, cancel), ENV, f.store, { scope: 'preliminary', notify }), 'unavailable');
  assert.equal(f.stored.length, 0);
  assert.equal(f.fake.data.has(`${TRACKING}/current`), false);
}));

// ------------------------------------------------------------------ identical clip explanations

const MOMENT = { id: 'd_360', kind: 'sighting', kinds: ['sighting'], start: 36, end: 36, clipStart: 31, clipEnd: 40,
  identityState: 'CONFIRMED_VISIBLE', candidate: false, evidence: 'number_read', indicator: [[36, 0.4, 0.3, 0.05, 0.2]] };
const GOOD = JSON.stringify({ observation: 'You hold your width near the touchline.', interpretation: 'That can stretch the defence.',
  evidenceFrames: ['f0'], confidence: 'partial', limitations: [], suggestion: 'Scan before receiving.' });
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function explainFixture(opts: {
  frames?: () => Promise<unknown>;
  onChat?: (fake: ReturnType<typeof fakeDb>) => void;
  aiConsent?: () => Promise<boolean>;
} = {}) {
  const fake = fakeDb({
    [`matchAnalysisJobs/${JOB}`]: { playerId: UID, videoStoragePath: 'profiles/u/matchFootage/j/v.mov' },
    [`${TRACKING}/current`]: { report: { target: { number: '20', kit: 'orange', position: 'winger', kit2: '' }, moments: [MOMENT], offball: null },
      version: 4, stale: false },
    [`videoProcessingConsents/${JOB}`]: { uid: UID, providers: ['openrouter_zdr'], revokedAt: null, policyVersion: VIDEO_CONSENT_VERSION },
  });
  const count = { frames: 0, chat: 0 };
  const deps: ReasoningDeps = {
    db: fake.db, env: { VIDEO_REASONING_ENABLED: 'true', FUNCTIONS_EMULATOR: 'true' }, aiConsent: opts.aiConsent ?? (async () => true),
    now: () => '2026-11-20T12:00:00Z', sourceUrl: async () => 'https://signed/v.mov',
    frames: opts.frames ?? (async () => {
      count.frames += 1;
      await wait(25);
      return { frames: [{ id: 'f0', t: 32, jpegBase64: 'AAAA' }, { id: 'f1', t: 35, jpegBase64: 'BBBB' }] };
    }),
    chat: async () => { count.chat += 1; await wait(5); opts.onChat?.(fake); return { ok: true as const, content: GOOD }; },
  };
  return { fake, count, deps, ask: (kind: 'explain' | 'alternatives' = 'explain') => explainMoment(UID, JOB, 'd_360', kind, deps) };
}

test('explainMoment: simultaneous identical requests share one extraction and one provider request', async () => {
  const f = explainFixture();
  const [a, b] = await Promise.all([f.ask(), f.ask()]);
  assert.equal(a.status, 'answered');
  assert.deepEqual(a, b, 'both callers get the same validated answer');
  assert.deepEqual(f.count, { frames: 1, chat: 1 });
  const later = await f.ask();
  assert.ok(later.status === 'answered' && later.cached, 'after completion the stored answer is served');
  assert.deepEqual(f.count, { frames: 1, chat: 1 });
});

test('explainMoment: identical job ids in separate Firestore projects do not share work', async () => {
  const a = explainFixture(); const b = explainFixture();
  await Promise.all([a.ask(), b.ask()]);
  assert.deepEqual(a.count, { frames: 1, chat: 1 });
  assert.deepEqual(b.count, { frames: 1, chat: 1 });
  assert.ok(a.fake.data.has(`${TRACKING}/${reasoningCacheId(4, 'd_360', 'explain')}`));
  assert.ok(b.fake.data.has(`${TRACKING}/${reasoningCacheId(4, 'd_360', 'explain')}`));
});

test('explainMoment: removing the provider while frames are extracted prevents the provider call', async () => {
  const f = explainFixture({ frames: async () => {
    f.fake.data.set(`videoProcessingConsents/${JOB}`, { uid: UID, providers: [], revokedAt: null, policyVersion: VIDEO_CONSENT_VERSION });
    return { frames: [{ id: 'f0', t: 32, jpegBase64: 'AAAA' }, { id: 'f1', t: 35, jpegBase64: 'BBBB' }] };
  } });
  assert.deepEqual(await f.ask(), { status: 'unavailable', reason: 'provider_not_consented' });
  assert.equal(f.count.chat, 0);
  assert.equal(f.fake.data.has(`${TRACKING}/${reasoningCacheId(4, 'd_360', 'explain')}`), false);
});

test('explainMoment: cancelling the analysis while the provider runs drops its answer', async () => {
  const f = explainFixture({ onChat: (fake) => {
    const path = `matchAnalysisJobs/${JOB}`;
    fake.data.set(path, { ...fake.data.get(path), cancelRequested: true });
  } });
  assert.deepEqual(await f.ask(), { status: 'unavailable', reason: 'analysis_unavailable' });
  assert.equal(f.fake.data.has(`${TRACKING}/${reasoningCacheId(4, 'd_360', 'explain')}`), false);
});

test('explainMoment: different questions are not merged, and a failed request does not block the next one', async () => {
  const f = explainFixture();
  const [explain, alternatives] = await Promise.all([f.ask('explain'), f.ask('alternatives')]);
  assert.ok(explain.status === 'answered' && alternatives.status === 'answered');
  assert.deepEqual(f.count, { frames: 2, chat: 2 });

  let fail = true;
  const flaky = explainFixture({ frames: async () => {
    if (fail) { fail = false; throw new Error('worker down'); }
    return { frames: [{ id: 'f0', t: 32, jpegBase64: 'AAAA' }, { id: 'f1', t: 35, jpegBase64: 'BBBB' }] };
  } });
  await assert.rejects(flaky.ask(), /worker down/);
  assert.equal((await flaky.ask()).status, 'answered', 'the failed attempt left nothing in flight');
});

test('explainMoment: withdrawing AI consent before the provider call sends nothing and stores nothing', async () => {
  let allowed = true;
  let framesCalled = 0;
  const f = explainFixture({
    aiConsent: async () => allowed,
    frames: async () => {
      framesCalled += 1;
      allowed = false;
      return { frames: [{ id: 'f0', t: 32, jpegBase64: 'AAAA' }, { id: 'f1', t: 35, jpegBase64: 'BBBB' }] };
    },
  });
  assert.deepEqual(await f.ask(), { status: 'unavailable', reason: 'ai_consent_required' });
  assert.equal(framesCalled, 1);
  assert.equal(f.count.chat, 0, 'the provider is not called after AI consent is withdrawn');
  assert.equal(f.fake.data.has(`${TRACKING}/${reasoningCacheId(4, 'd_360', 'explain')}`), false);
});

test('explainMoment: revoking consent stops a running request and keeps later callers out', async () => {
  const f = explainFixture();
  const first = f.ask();
  await wait(5);
  f.fake.data.set(`videoProcessingConsents/${JOB}`, { uid: UID, providers: ['openrouter_zdr'], revokedAt: '2026-11-20T12:30:00Z',
    policyVersion: VIDEO_CONSENT_VERSION });
  assert.deepEqual(await f.ask(), { status: 'unavailable', reason: 'provider_not_consented' });
  assert.deepEqual(await first, { status: 'unavailable', reason: 'provider_not_consented' }, 'the running request stops too');
  assert.deepEqual(f.count, { frames: 1, chat: 0 }, 'no frame reaches the provider after the revocation');
  await assert.rejects(explainMoment('intruder', JOB, 'd_360', 'explain', f.deps), /owner/, 'another account is refused before any lookup');
});

test('explainMoment: consent revoked while the provider call runs stores nothing and answers nobody', async () => {
  const f = explainFixture({ onChat: (fake) => fake.data.set(`videoProcessingConsents/${JOB}`, { uid: UID, providers: ['openrouter_zdr'],
    revokedAt: '2026-11-20T12:30:00Z', policyVersion: VIDEO_CONSENT_VERSION }) });
  const [a, b] = await Promise.all([f.ask(), f.ask()]);
  assert.deepEqual(a, { status: 'unavailable', reason: 'provider_not_consented' });
  assert.deepEqual(b, a, 'a caller that joined the running request gets the same refusal');
  assert.equal(f.fake.data.has(`${TRACKING}/${reasoningCacheId(4, 'd_360', 'explain')}`), false, 'no derived answer outlives the consent');
  assert.deepEqual(f.count, { frames: 1, chat: 1 });
});

test('explainMoment: a correction published while the provider call runs does not store an answer for the old report', async () => {
  const f = explainFixture({ onChat: (fake) => fake.data.set(`${TRACKING}/current`, { ...(fake.data.get(`${TRACKING}/current`) as Doc), version: 5 }) });
  assert.deepEqual(await f.ask(), { status: 'unavailable', reason: 'report_not_current' });
  assert.equal(f.fake.data.has(`${TRACKING}/${reasoningCacheId(4, 'd_360', 'explain')}`), false);
  assert.equal(f.fake.data.has(`${TRACKING}/${reasoningCacheId(5, 'd_360', 'explain')}`), false, 'nor under the new version');
});

// ------------------------------------------------------------------ accuracy invariance of the workflow

test('workflow: the published report is identical whatever the resolve timing, and retries never repeat finished segments', async () => {
  const prompt = await runAnalysis({ resolvePolicy: 'prompt' });
  const delayed = await runAnalysis({ resolvePolicy: 'delayed' });
  assert.ok(prompt.published && delayed.published);
  assert.equal(prompt.published.scope, 'full');
  assert.equal(delayed.published.scope, 'full');
  assert.equal(delayed.published.reportSha256, prompt.published.reportSha256, 'scheduling must not change what the player sees');
  assert.equal(prompt.published.parts, prompt.progress?.plan.length);
  assert.equal(delayed.meter.worker.resolve, 1, 'a late preliminary resolve no longer repeats the full one');
  assert.equal(delayed.meter.imageWrites, delayed.storedObjects, 'every stored thumbnail is referenced once');
  assert.equal(delayed.unreferencedObjects, 0);
  assert.equal(delayed.db.publishes, 1);

  const failing = await runAnalysis({ resolvePolicy: 'prompt', failExtract: { 3: 3 } });
  assert.equal(failing.outcome, 'interrupted');
  failing.shared.failures.clear();
  const resumed = await runAnalysis({ resolvePolicy: 'prompt' }, failing.shared);
  const segments = resumed.progress?.plan.length ?? 0;
  assert.equal(resumed.meter.worker.extract, segments + 3, 'only the three failed attempts were wasted; no finished segment ran again');
  assert.equal(resumed.published?.reportSha256, prompt.published.reportSha256);
  assert.equal(resumed.outcome, null);
});
