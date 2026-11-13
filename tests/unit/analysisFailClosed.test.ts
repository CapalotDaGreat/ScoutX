import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { isFootageProcessingApproved } from '../../functions/src/ai/providerConfig.ts';
import { APPROVED_CV_WORKER } from '../../functions/src/analysis/cvApproval.generated.ts';
import { cvApproval, cvWorkerStatus, setEmulatorCvApproval } from '../../functions/src/analysis/cvConfig.ts';
import { getCvSegmentClient, setCvSegmentClient } from '../../functions/src/analysis/cvWorker.ts';
import { targetAnchorsEnabled } from '../../functions/src/analysis/targetAnchorCallable.ts';
import { processOcrFollowUpTask, processResolveTask } from '../../functions/src/analysis/trackingCallables.ts';
import { processDiscoverTask, processExtractTask, startAnalysis, type Enqueue } from '../../functions/src/analysis/trackingOrchestrator.ts';
import { trackingV3Enabled } from '../../functions/src/analysis/trackingV3.ts';
import { VIDEO_CONSENT_VERSION } from '../../functions/src/analysis/videoConsent.ts';
import { reasoningEnabled, reasoningGate } from '../../functions/src/analysis/videoReasoning.ts';

type Firestore = Parameters<typeof processResolveTask>[0];

/**
 * Production-like environments for this release. `live` mirrors the deployed configuration (the only custom key is
 * GUARDIAN_LINK_BASE_URL); `misconfigured` is an operator who sets every runtime switch without the compiled evaluation
 * approval. Neither may run continuous player tracking, call the vision worker or send footage to an AI provider.
 */
const live: NodeJS.ProcessEnv = { GUARDIAN_LINK_BASE_URL: 'https://example.invalid/guardian' };
const misconfigured: NodeJS.ProcessEnv = {
  ...live,
  CV_WORKER_URL: 'https://worker.example.invalid',
  CV_WORKER_APPROVED: 'true',
  TRACKING_V3_ENABLED: 'true',
  EXPERIMENTAL_TARGET_ANCHORS: 'true',
};

function fakeDb(seed: Record<string, Record<string, unknown>>) {
  const data = new Map<string, Record<string, unknown>>(Object.entries(structuredClone(seed)));
  const writes: string[] = [];
  const write = (path: string, value: Record<string, unknown>, opts?: { merge?: boolean }) => {
    writes.push(path);
    data.set(path, opts?.merge ? { ...(data.get(path) ?? {}), ...structuredClone(value) } : structuredClone(value));
  };
  const snap = (path: string) => ({ exists: data.has(path), data: () => structuredClone(data.get(path)), get: (k: string) => data.get(path)?.[k] });
  const docRef = (path: string) => ({
    path,
    collection: (name: string) => collectionRef(`${path}/${name}`),
    get: async () => snap(path),
    set: async (value: Record<string, unknown>, opts?: { merge?: boolean }) => write(path, value, opts),
  });
  const collectionRef = (path: string) => ({ doc: (id: string) => docRef(`${path}/${id}`) });
  const db = {
    collection: collectionRef,
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn({
      get: async (ref: { path: string }) => snap(ref.path),
      set: (ref: { path: string }, value: Record<string, unknown>, opts?: { merge?: boolean }) => write(ref.path, value, opts),
    }),
  };
  return { db: db as unknown as Firestore, data, writes };
}

const job = {
  'matchAnalysisJobs/job_1': { playerId: 'u1', targeting: { jerseyNumber: '20', kitPrimaryColor: 'orange' },
    videoStoragePath: 'profiles/u1/matchFootage/job_1/source.mp4', measuredDurationSec: 1020, durationSec: 1020 },
  'videoProcessingConsents/job_1': { uid: 'u1', revokedAt: null, policyVersion: VIDEO_CONSENT_VERSION },
};

function spies() {
  const queued: string[] = [];
  const workerCalls: unknown[] = [];
  const enqueue: Enqueue = async (queue) => { queued.push(queue); };
  const worker = async (body: Record<string, unknown>) => { workerCalls.push(body); return null; };
  return { queued, workerCalls, enqueue, worker };
}

describe('analysis fails closed in the release configuration', () => {
  test('no evaluation approval is compiled in, and none is honoured outside the emulators', () => {
    assert.equal(APPROVED_CV_WORKER, null);
    setEmulatorCvApproval({ workerVersion: 'x', models: {}, eventsApproved: false } as never);
    try {
      assert.equal(cvApproval(misconfigured), null, 'the emulator seam is ignored in a deployed function');
    } finally {
      setEmulatorCvApproval(null);
    }
  });

  test('runtime switches alone cannot make the vision worker available', () => {
    assert.equal(cvWorkerStatus(live), 'not_configured');
    assert.equal(cvWorkerStatus(misconfigured), 'not_evaluated');
    assert.equal(cvWorkerStatus({ ...misconfigured, CV_WORKER_URL: 'http://worker.example.invalid' }), 'not_configured',
      'plain HTTP is refused outside the emulators');
    setCvSegmentClient({ analyzeSegment: async () => { throw new Error('must not be called'); } } as never);
    try {
      assert.equal(getCvSegmentClient(misconfigured), null, 'a test override does not bypass the status gate');
    } finally {
      setCvSegmentClient(null);
    }
  });

  test('footage never goes to an AI provider and video reasoning stays off', () => {
    assert.equal(isFootageProcessingApproved(live), false);
    assert.equal(isFootageProcessingApproved({ ...misconfigured, AI_FOOTAGE_PROCESSING_APPROVED: 'yes' }), false);
    assert.equal(reasoningEnabled(live), false);
    const gate = reasoningGate({ env: live, footageApproved: false, aiConsent: true, videoConsent: null, moment: null } as never);
    assert.deepEqual(gate, { ok: false, reason: 'disabled' });
    assert.equal(trackingV3Enabled(live), false);
    assert.equal(targetAnchorsEnabled(live), false);
  });

  test('starting continuous tracking is blocked honestly and enqueues nothing', async () => {
    for (const env of [live, misconfigured]) {
      const s = spies();
      const { db } = fakeDb(job);
      const outcome = await startAnalysis(db, 'u1', 'job_1', s.enqueue, env, new Date('2026-11-13T10:00:00Z'), async () => true);
      assert.equal(outcome.status, 'blocked');
      assert.equal(outcome.blocked, 'worker_unavailable');
      assert.deepEqual(s.queued, []);
    }
  });

  test('queued, retried and follow-up work never reaches the worker or fabricates a report', async () => {
    for (const env of [live, misconfigured]) {
      const s = spies();
      const { db, data } = fakeDb({
        ...job,
        'matchAnalysisJobs/job_1/tracking/progress': { generation: 1, plan: [{ index: 0, startSec: 0, endSec: 600 }], outcome: null,
          discovery: { status: 'running', chunks: [] } },
        'matchAnalysisJobs/job_1/tracking/current': { followUp: { status: 'scheduled', revision: 1, round: 1 } },
      });
      assert.equal(await processResolveTask(db, 'job_1', 1, s.worker, env), 'unavailable');
      assert.equal(await processExtractTask(db, 'job_1', 1, 0, 0, s.worker, s.enqueue, env).catch(() => 'unavailable'), 'unavailable');
      const discovered = await processDiscoverTask(db, 'job_1', 1, 0, 0, s.worker, s.enqueue, env);
      assert.notEqual(discovered, 'done');
      const followUp = await processOcrFollowUpTask(db, 'job_1', 1, 1, s.worker, env);
      assert.notEqual(followUp, 'done');
      assert.deepEqual(s.workerCalls, [], 'the worker was never called');
      assert.deepEqual(s.queued, [], 'nothing was enqueued');
      assert.equal(data.get('matchAnalysisJobs/job_1/tracking/current')?.report, undefined, 'no report was written');
    }
  });
});

describe('every outbound path to the worker or an AI provider passes a gate first', () => {
  const root = new URL('../../functions/src/', import.meta.url).pathname;
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) files.push(path);
    }
  };
  walk(root);
  const source = (path: string) => readFileSync(path, 'utf8');
  const rel = (path: string) => path.slice(root.length);

  test('only the reviewed modules attach images to a provider request, each behind the footage gate', () => {
    const imageSenders = files.filter((f) => /type: 'image_url'/.test(source(f))).map(rel).sort();
    assert.deepEqual(imageSenders, ['ai/providerConfig.ts', 'analysis/frameAnalysis.ts', 'analysis/segmentPipeline.ts', 'analysis/videoReasoning.ts']);
    for (const f of ['analysis/frameAnalysis.ts', 'analysis/segmentPipeline.ts']) {
      const text = source(join(root, f));
      assert.ok(text.indexOf('isFootageProcessingApproved()') > -1 && text.indexOf('isFootageProcessingApproved()') < text.indexOf("type: 'image_url'"),
        `${f}: the footage gate precedes the first image`);
    }
    assert.match(source(join(root, 'analysis/trackingReasoning.ts')), /footageApproved: isFootageProcessingApproved\(deps\.env\)/);
  });

  test('only the reviewed modules talk to the worker, and each checks the status gate', () => {
    const workerCallers = files.filter((f) => /fetch\(/.test(source(f))
      && /identityToken\(|v2\/segments:analyze|v3\/tracking:|v2\/matches:resolve-identity/.test(source(f))).map(rel).sort();
    assert.deepEqual(workerCallers, ['analysis/cvWorker.ts', 'analysis/identityCoordinator.ts', 'analysis/trackingCallables.ts']);
    assert.match(source(join(root, 'analysis/cvWorker.ts')), /if \(cvWorkerStatus\(env\) !== 'available'\) return null;/);
    assert.match(source(join(root, 'analysis/identityCoordinator.ts')), /cvWorkerStatus\(\) !== 'available'\s*\n?\s*\|\| !isFootageProcessingApproved\(\)/);
    assert.match(source(join(root, 'analysis/trackingCallables.ts')), /if \(!client \|\| !trackingV3Enabled\(env\) \|\| cvWorkerStatus\(env\) !== 'available'\) return 'unavailable';/);
  });

  test('the deployed configuration snapshot carries no analysis or AI switch', () => {
    const snapshot = JSON.parse(readFileSync(new URL('../../docs/release/live-config-snapshot-2026-11-13.json', import.meta.url), 'utf8')) as {
      functions: Array<{ name: string; envKeys: string[] }>;
    };
    const forbidden = /^(CV_WORKER_URL|CV_WORKER_APPROVED|CV_EVENTS_VALIDATED|TRACKING_V3_ENABLED|AI_FOOTAGE_PROCESSING_APPROVED|VIDEO_REASONING_ENABLED|EXPERIMENTAL_TARGET_ANCHORS|ENFORCE_APP_CHECK|FUNCTIONS_EMULATOR|FIRESTORE_EMULATOR_HOST)$/;
    for (const fn of snapshot.functions) assert.deepEqual(fn.envKeys.filter((k) => forbidden.test(k)), [], fn.name);
  });
});
