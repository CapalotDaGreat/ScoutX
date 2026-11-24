import { reconcileTrackingAttempt } from '../../functions/src/analysis/trackingReconciliation.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { setEmulatorCvApproval } from '../../functions/src/analysis/cvConfig.ts';
import {
  httpTrackingClient, processOcrFollowUpTask, refreshTrackingOcrTask, resolveTrackingTask, runResolveTaskAttempt,
} from '../../functions/src/analysis/trackingCallables.ts';
import {
  OCR_REFRESH_MAX_ATTEMPTS, RESOLVE_MAX_ATTEMPTS, TRACKING_ATTEMPT_LEASE_MS, TRACKING_TASK_TIMEOUT_SEC,
  TRACKING_TIMEOUT_BACKOFF_SEC, TRACKING_WORKER_CLIENT_MS, TrackingWorkerTimeout,
} from '../../functions/src/analysis/trackingDeadlines.ts';
import { claimTrackingTask, releaseTrackingTask } from '../../functions/src/analysis/trackingTaskLeases.ts';
import { newProgress } from '../../functions/src/analysis/trackingProgress.ts';
import { emptyFeedback } from '../../functions/src/analysis/trackingV3.ts';
import { fakeDb } from './support/analysisBench.ts';

const JOB = 'deadline_job';
const BASE = `matchAnalysisJobs/${JOB}/tracking`;
const ENV = { FUNCTIONS_EMULATOR: 'true', CV_WORKER_URL: 'http://localhost:9', CV_WORKER_APPROVED: 'true', TRACKING_V3_ENABLED: 'true' };
const APPROVAL = { workerVersion: 'deadline-test', models: { detector: 'test' }, eventsApproved: false };
const T0 = Date.parse('2026-11-23T12:00:00Z');
const report = JSON.parse(readFileSync(new URL('../fixtures/tracking50-img4809-auto.json', import.meta.url), 'utf8')).report;

function setup(refresh = false) {
  let time = T0;
  const progress = newProgress(1, 2035, new Date(time).toISOString());
  progress.resolving = 'full';
  const f = fakeDb({
    [`matchAnalysisJobs/${JOB}`]: { playerId: 'owner', targeting: { jerseyNumber: '20' } },
    [`${BASE}/progress`]: progress as unknown as Record<string, unknown>,
    [`${BASE}/feedback`]: { ...emptyFeedback(), revision: 0 },
    ...(refresh ? { [`${BASE}/current`]: { version: 1, report: null, followUp: {
      revision: 0, round: 1, status: 'scheduled', deferredBefore: 20, deferredAfter: null, updatedAt: new Date(time).toISOString(),
    } } } : {}),
  });
  const success = async () => ({ workerVersion: APPROVAL.workerVersion, models: APPROVAL.models,
    report: { ...structuredClone(report), engine: { ...report.engine, ocrDeferred: 0 },
      analysedRange: { startSec: 0, endSec: 2035, parts: progress.plan.length } } });
  const opts = { scope: 'full' as const, now: () => new Date(time), notify: async () => false, enqueueFollowUp: async () => undefined };
  return { ...f, success, opts, advance: (ms = TRACKING_ATTEMPT_LEASE_MS + 1) => { time += ms; } };
}

async function approved(work: () => Promise<void>) {
  setEmulatorCvApproval(APPROVAL as never);
  try { await work(); } finally { setEmulatorCvApproval(null); }
}

const timeout = async () => { throw new TrackingWorkerTimeout(); };
const store = async () => undefined;

test('task clocks leave room for timeout settlement, and retries wait beyond a retained lease', () => {
  assert.equal(TRACKING_TASK_TIMEOUT_SEC, 1800);
  assert.ok(TRACKING_WORKER_CLIENT_MS < TRACKING_TASK_TIMEOUT_SEC * 1000);
  assert.ok(TRACKING_TASK_TIMEOUT_SEC * 1000 < TRACKING_ATTEMPT_LEASE_MS);
  assert.ok(TRACKING_WORKER_CLIENT_MS + TRACKING_TIMEOUT_BACKOFF_SEC * 1000 > TRACKING_ATTEMPT_LEASE_MS);
  for (const [task, attempts] of [[resolveTrackingTask, RESOLVE_MAX_ATTEMPTS], [refreshTrackingOcrTask, OCR_REFRESH_MAX_ATTEMPTS]] as const) {
    const endpoint = task.__endpoint;
    assert.equal(endpoint.timeoutSeconds, 1800);
    assert.equal(endpoint.taskQueueTrigger?.retryConfig?.maxAttempts, attempts);
    assert.equal(endpoint.taskQueueTrigger?.retryConfig?.minBackoffSeconds, TRACKING_TIMEOUT_BACKOFF_SEC);
  }
});

test('resolve HTTP deadlines are typed; other routes and HTTP/network failures keep their null fallback', async () => {
  const fetch = globalThis.fetch; const signalTimeout = AbortSignal.timeout;
  let milliseconds = 0;
  AbortSignal.timeout = (ms) => { milliseconds = ms; return new AbortController().signal; };
  try {
    globalThis.fetch = (async () => { throw new DOMException('deadline', 'TimeoutError'); }) as typeof fetch;
    await assert.rejects(httpTrackingClient('https://worker.invalid', ENV)({}), TrackingWorkerTimeout);
    assert.equal(milliseconds, 28 * 60 * 1000);
    for (const route of ['extract', 'discover', 'clipFrames'] as const) {
      assert.equal(await httpTrackingClient('https://worker.invalid', ENV, route, 60_000)({}), null);
    }
    globalThis.fetch = (async () => new Response('', { status: 500 })) as typeof fetch;
    assert.equal(await httpTrackingClient('https://worker.invalid', ENV)({}), null);
    globalThis.fetch = (async () => { throw new TypeError('connection reset'); }) as typeof fetch;
    assert.equal(await httpTrackingClient('https://worker.invalid', ENV)({}), null);
  } finally { globalThis.fetch = fetch; AbortSignal.timeout = signalTimeout; }
});

test('full resolve retries two timeouts and interrupts only after its third timeout', () => approved(async () => {
  const f = setup();
  for (let attempt = 0; attempt < RESOLVE_MAX_ATTEMPTS - 1; attempt += 1) {
    await assert.rejects(runResolveTaskAttempt(f.db, JOB, 0, timeout, ENV, store, { ...f.opts, attempt }), TrackingWorkerTimeout);
    assert.equal(f.data.get(`${BASE}/progress`)?.outcome, null);
    assert.equal(f.data.get(`${BASE}/progress`)?.resolving, 'full');
    assert.equal(typeof f.data.get(`${BASE}/lease_full`)?.token, 'string', 'keep the timed-out attempt fenced until expiry');
    f.advance();
  }
  assert.equal(await runResolveTaskAttempt(f.db, JOB, 0, timeout, ENV, store,
    { ...f.opts, attempt: RESOLVE_MAX_ATTEMPTS - 1 }), 'timedOut');
  assert.equal(f.data.get(`${BASE}/progress`)?.outcome, 'interrupted');
  assert.equal(f.data.get(`${BASE}/progress`)?.resolving, null);
}));

test('a successful resolve retry publishes without interrupting the analysis', () => approved(async () => {
  const f = setup();
  await assert.rejects(runResolveTaskAttempt(f.db, JOB, 0, timeout, ENV, store, f.opts), TrackingWorkerTimeout);
  f.advance();
  assert.equal(await runResolveTaskAttempt(f.db, JOB, 0, f.success, ENV, store, { ...f.opts, attempt: 1 }), 'done');
  assert.equal(f.data.get(`${BASE}/progress`)?.outcome, null);
  assert.equal(f.data.get(`${BASE}/progress`)?.resolving, null);
  assert.equal(f.data.get(`${BASE}/lease_full`)?.token, null);
}));

test('an old final timeout cannot interrupt a newer generation, newer feedback, or a cancellation', () => approved(async () => {
  for (const change of ['generation', 'feedback', 'cancelled']) {
    const f = setup();
    const worker = async () => {
      if (change === 'generation') {
        f.data.set(`${BASE}/progress`, { ...f.data.get(`${BASE}/progress`), generation: 2 });
      } else if (change === 'feedback') {
        f.data.set(`${BASE}/feedback`, { ...emptyFeedback(), revision: 1 });
      } else {
        f.data.set(`matchAnalysisJobs/${JOB}`, { playerId: 'owner', cancelRequested: true });
        f.data.set(`${BASE}/progress`, { ...f.data.get(`${BASE}/progress`), outcome: 'cancelled' });
      }
      throw new TrackingWorkerTimeout();
    };
    await runResolveTaskAttempt(f.db, JOB, 0, worker, ENV, store, { ...f.opts, attempt: RESOLVE_MAX_ATTEMPTS - 1 });
    assert.equal(f.data.get(`${BASE}/progress`)?.outcome, change === 'cancelled' ? 'cancelled' : null);
  }
}));

test('a live duplicate does not call the worker or release the owning resolve slot', () => approved(async () => {
  const f = setup();
  let finish!: (value: null) => void;
  let entered!: () => void;
  const started = new Promise<void>((done) => { entered = done; });
  let calls = 0;
  const worker = async () => { calls += 1; entered(); return new Promise<null>((done) => { finish = done; }); };
  const first = runResolveTaskAttempt(f.db, JOB, 0, worker, ENV, store, f.opts);
  await started;
  assert.equal(await runResolveTaskAttempt(f.db, JOB, 0, worker, ENV, store, { ...f.opts, attempt: 1 }), 'busy');
  assert.equal(calls, 1);
  assert.equal(f.data.get(`${BASE}/progress`)?.resolving, 'full');
  finish(null);
  assert.equal(await first, 'rejected');
}));

test('a deleted analysis does not acquire a lease or recreate task metadata', () => approved(async () => {
  const f = setup();
  f.data.delete(`matchAnalysisJobs/${JOB}`);
  const before = structuredClone([...f.data]);
  assert.equal(await runResolveTaskAttempt(f.db, JOB, 0, async () => {
    assert.fail('deleted jobs must not call the worker');
  }, ENV, store, f.opts), 'unavailable');
  assert.deepEqual([...f.data], before);
}));

test('an expired attempt cannot publish over its replacement', () => approved(async () => {
  const f = setup();
  let finish!: (value: Awaited<ReturnType<typeof f.success>>) => void;
  let entered!: () => void;
  const started = new Promise<void>((done) => { entered = done; });
  const first = runResolveTaskAttempt(f.db, JOB, 0, async () => {
    entered(); return new Promise<Awaited<ReturnType<typeof f.success>>>((done) => { finish = done; });
  }, ENV, store, f.opts);
  await started;
  f.advance();
  assert.equal(await runResolveTaskAttempt(f.db, JOB, 0, f.success, ENV, store, { ...f.opts, attempt: 1 }), 'done');
  const current = structuredClone(f.data.get(`${BASE}/current`));
  finish(await f.success());
  assert.equal(await first, 'stale');
  assert.deepEqual(f.data.get(`${BASE}/current`), current);
  assert.equal(f.data.get(`${BASE}/progress`)?.outcome, null);
}));

test('lease takeover waits past 17 minutes; scopes are independent and old release cannot clear a new token', async () => {
  const f = setup();
  const first = await claimTrackingTask(f.db, JOB, 0, 'full', undefined, f.opts.now);
  assert.ok(typeof first !== 'string');
  f.advance(17 * 60 * 1000);
  assert.equal(await claimTrackingTask(f.db, JOB, 0, 'full', undefined, f.opts.now), 'busy');
  assert.ok(typeof await claimTrackingTask(f.db, JOB, 0, 'preliminary', undefined, f.opts.now) !== 'string');
  f.advance();
  const next = await claimTrackingTask(f.db, JOB, 0, 'full', undefined, f.opts.now);
  assert.ok(typeof next !== 'string');
  await releaseTrackingTask(f.db, first);
  assert.equal(f.data.get(`${BASE}/lease_full`)?.token, next.token);
});

test('OCR timeout keeps its round retryable, then a successful retry completes it', () => approved(async () => {
  const f = setup(true);
  await assert.rejects(processOcrFollowUpTask(f.db, JOB, 0, 1, timeout, ENV, store, f.opts), TrackingWorkerTimeout);
  assert.equal((f.data.get(`${BASE}/current`)?.followUp as { status: string }).status, 'running');
  assert.equal(await processOcrFollowUpTask(f.db, JOB, 0, 1, f.success, ENV, store, { ...f.opts, attempt: 1 }), 'busy');
  f.advance();
  assert.equal(await processOcrFollowUpTask(f.db, JOB, 0, 1, f.success, ENV, store, { ...f.opts, attempt: 1 }), 'done');
  assert.equal((f.data.get(`${BASE}/current`)?.followUp as { status: string }).status, 'done');
  assert.equal(f.data.get(`${BASE}/progress`)?.outcome, null);
}));

test('OCR final timeout fails only that follow-up; ordinary rejections do not gain timeout retries', () => approved(async () => {
  const f = setup(true);
  assert.equal(await processOcrFollowUpTask(f.db, JOB, 0, 1, timeout, ENV, store,
    { ...f.opts, attempt: OCR_REFRESH_MAX_ATTEMPTS - 1 }), 'timedOut');
  assert.equal((f.data.get(`${BASE}/current`)?.followUp as { status: string }).status, 'failed');
  assert.equal(f.data.get(`${BASE}/progress`)?.outcome, null);
  const ordinary = setup();
  assert.equal(await runResolveTaskAttempt(ordinary.db, JOB, 0, async () => null, ENV, store, ordinary.opts), 'rejected');
  assert.equal(ordinary.data.get(`${BASE}/progress`)?.outcome, 'interrupted');
}));

test('a stale OCR round cannot steal or release a newer round\'s lease', async () => {
  const f = setup(true);
  const old = await claimTrackingTask(f.db, JOB, 0, 'refresh', 1, f.opts.now);
  assert.ok(typeof old !== 'string');
  const cur = f.data.get(`${BASE}/current`)!;
  f.data.set(`${BASE}/current`, { ...cur, followUp: { ...(cur.followUp as object), round: 2, status: 'scheduled' } });
  const next = await claimTrackingTask(f.db, JOB, 0, 'refresh', 2, f.opts.now);
  assert.ok(typeof next !== 'string');
  assert.equal(await processOcrFollowUpTask(f.db, JOB, 0, 1, null, ENV, store, f.opts), 'stale');
  await releaseTrackingTask(f.db, old);
  assert.equal(f.data.get(`${BASE}/lease_refresh`)?.token, next.token);
});


test('unexpected final resolve/OCR exceptions keep durable reconciliation instead of losing terminal settlement', () => approved(async () => {
  for (const refresh of [false, true]) {
    const f = setup(refresh);
    const crash = async () => { throw new Error('unexpected publication/worker failure'); };
    const work = refresh
      ? processOcrFollowUpTask(f.db, JOB, 0, 1, crash, ENV, store, { ...f.opts, attempt: OCR_REFRESH_MAX_ATTEMPTS - 1 })
      : runResolveTaskAttempt(f.db, JOB, 0, crash, ENV, store, { ...f.opts, attempt: RESOLVE_MAX_ATTEMPTS - 1 });
    await assert.rejects(work, /unexpected/);
    const token = f.data.get(`${BASE}/lease_${refresh ? 'refresh' : 'full'}`)?.token;
    assert.equal(typeof token, 'string');
    f.advance();
    assert.equal(await reconcileTrackingAttempt(f.db, token as string, f.opts.now()), 'settled');
    if (refresh) assert.equal((f.data.get(`${BASE}/current`)?.followUp as { status: string }).status, 'failed');
    else assert.equal(f.data.get(`${BASE}/progress`)?.outcome, 'interrupted');
  }
}));
