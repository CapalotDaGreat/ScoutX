import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setEmulatorCvApproval } from '../../functions/src/analysis/cvConfig.ts';
import {
  httpTrackingClient, processResolveTask, readWorker, settleOrchestratedResolve,
} from '../../functions/src/analysis/trackingCallables.ts';
import {
  OCR_REFRESH_MAX_ATTEMPTS, RESOLVE_MAX_ATTEMPTS, TRACKING_ATTEMPT_LEASE_MS, TRACKING_TASK_TIMEOUT_SEC,
  TRACKING_WORKER_CLIENT_MS, TrackingWorkerTimeout, timeoutWillRetry,
} from '../../functions/src/analysis/trackingDeadlines.ts';
import { IMAGE_ATTEMPT_MAX_MS } from '../../functions/src/analysis/trackingImages.ts';
import { newProgress, type TrackingProgress } from '../../functions/src/analysis/trackingProgress.ts';

type Firestore = Parameters<typeof processResolveTask>[0];

function fakeDb(seed: Record<string, Record<string, unknown>>) {
  const data = new Map<string, Record<string, unknown>>(Object.entries(structuredClone(seed)));
  const write = (path: string, value: Record<string, unknown>, opts?: { merge?: boolean }) => {
    const prev = data.get(path) ?? {};
    data.set(path, opts?.merge ? { ...prev, ...structuredClone(value) } : structuredClone(value));
  };
  const snap = (path: string) => ({ exists: data.has(path), data: () => structuredClone(data.get(path)),
    get: (k: string) => data.get(path)?.[k] });
  const docRef = (path: string) => ({
    path,
    collection: (name: string) => ({ doc: (id: string) => docRef(`${path}/${name}/${id}`) }),
    get: async () => snap(path),
    set: async (value: Record<string, unknown>, opts?: { merge?: boolean }) => write(path, value, opts),
  });
  const db = {
    collection: (name: string) => ({ doc: (id: string) => docRef(`${name}/${id}`) }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn({
      get: async (ref: { path: string }) => snap(ref.path),
      set: (ref: { path: string }, value: Record<string, unknown>, opts?: { merge?: boolean }) => write(ref.path, value, opts),
    }),
  };
  return { db: db as unknown as Firestore, data };
}

const env = {
  FUNCTIONS_EMULATOR: 'true', CV_WORKER_URL: 'http://localhost:9', CV_WORKER_APPROVED: 'true',
  TRACKING_V3_ENABLED: 'true', TRACKING_PILOT_GATE: 'off',
};

test('tracking clocks stay ordered: client under the task, lease over the task', () => {
  assert.ok(TRACKING_WORKER_CLIENT_MS < TRACKING_TASK_TIMEOUT_SEC * 1000);
  assert.ok(TRACKING_ATTEMPT_LEASE_MS > TRACKING_TASK_TIMEOUT_SEC * 1000);
  assert.equal(IMAGE_ATTEMPT_MAX_MS, TRACKING_ATTEMPT_LEASE_MS);
  assert.equal(timeoutWillRetry(0, RESOLVE_MAX_ATTEMPTS), true);
  assert.equal(timeoutWillRetry(RESOLVE_MAX_ATTEMPTS - 1, RESOLVE_MAX_ATTEMPTS), false);
  assert.equal(timeoutWillRetry(0, OCR_REFRESH_MAX_ATTEMPTS), true);
  assert.equal(timeoutWillRetry(1, OCR_REFRESH_MAX_ATTEMPTS), false);
});

test('the worker client throws on its own deadline and returns null on any other failure', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw Object.assign(new Error('aborted'), { name: 'TimeoutError' }); };
    await assert.rejects(() => httpTrackingClient('http://worker.test', env)({}), TrackingWorkerTimeout);
    globalThis.fetch = async () => { throw new Error('connection reset'); };
    assert.equal(await httpTrackingClient('http://worker.test', env)({}), null);
    assert.equal(await readWorker(async () => { throw new TrackingWorkerTimeout(); }, {}), null);
  } finally {
    globalThis.fetch = original;
  }
});

test('a resolve deadline is timedOut and does not interrupt until the last attempt is settled', async () => {
  setEmulatorCvApproval({ workerVersion: 'football-cv/0.7.0', models: { detector: 'd' }, eventsApproved: false } as never);
  const progress = { ...newProgress(1, 600, '2026-11-21T10:00:00.000Z'), resolving: 'full' as const };
  const { db, data } = fakeDb({
    'matchAnalysisJobs/job_1': { playerId: 'u1', targeting: { jerseyNumber: '20' }, cancelRequested: false },
    'matchAnalysisJobs/job_1/tracking/progress': progress as unknown as Record<string, unknown>,
  });
  const client = async () => { throw new TrackingWorkerTimeout(); };
  assert.equal(await processResolveTask(db, 'job_1', 0, client, env), 'timedOut');
  const mid = data.get('matchAnalysisJobs/job_1/tracking/progress') as TrackingProgress;
  assert.equal(mid.outcome, null, 'an in-progress timeout has not ended the match');
  assert.equal(mid.resolving, 'full');
  await settleOrchestratedResolve(db, 'job_1', 'full', 'timedOut');
  const done = data.get('matchAnalysisJobs/job_1/tracking/progress') as TrackingProgress;
  assert.equal(done.outcome, 'interrupted');
  assert.equal(done.resolving, null);
  assert.equal((data.get('matchAnalysisJobs/job_1') as { trackingState?: string }).trackingState, 'failed');
  setEmulatorCvApproval(null);
});
