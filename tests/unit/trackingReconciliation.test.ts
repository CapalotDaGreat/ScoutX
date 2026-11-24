import assert from 'node:assert/strict';
import { test } from 'node:test';
import { claimTrackingTask, releaseTrackingTask, RECONCILIATION_COLLECTION } from '../../functions/src/analysis/trackingTaskLeases.ts';
import { reconcileTrackingAttempt, sweepTrackingAttempts, RECONCILIATION_BATCH_SIZE } from '../../functions/src/analysis/trackingReconciliation.ts';
import { TRACKING_ATTEMPT_LEASE_MS } from '../../functions/src/analysis/trackingDeadlines.ts';
import { fakeDb } from './support/analysisBench.ts';

const JOB = 'reconcile_test';
const ROOT = `matchAnalysisJobs/${JOB}`;
const BASE = `${ROOT}/tracking`;
const T0 = Date.parse('2026-11-24T12:00:00Z');
const later = () => new Date(T0 + TRACKING_ATTEMPT_LEASE_MS + 1);

function setup() {
  return fakeDb({
    [ROOT]: { playerId: 'owner' },
    [`${BASE}/progress`]: { generation: 1, resolving: 'full', outcome: null, full: null },
    [`${BASE}/feedback`]: { revision: 2 },
    [`${BASE}/current`]: { version: 3, stale: true, feedbackRevision: 2, report: { saved: true }, followUp: {
      revision: 2, round: 1, status: 'running', deferredBefore: 20, deferredAfter: null, updatedAt: new Date(T0).toISOString(),
    } },
  });
}

async function claim(f: ReturnType<typeof setup>, scope: 'full' | 'preliminary' | 'feedback' | 'refresh' = 'full', attempt = scope === 'refresh' ? 1 : 2) {
  const lease = await claimTrackingTask(f.db, JOB, 2, scope, scope === 'refresh' ? 1 : undefined, () => new Date(T0), attempt);
  assert.ok(typeof lease !== 'string');
  return lease;
}

test('final killed resolve has an atomic expiry ticket; sweep settles only after expiry and is idempotent', async () => {
  const f = setup(); const lease = await claim(f);
  assert.equal(f.data.get(`${RECONCILIATION_COLLECTION}/${lease.token}`)?.dueAtMs, T0 + TRACKING_ATTEMPT_LEASE_MS);
  assert.equal(await reconcileTrackingAttempt(f.db, lease.token, new Date(T0)), 'waiting');
  assert.equal(f.data.get(`${BASE}/progress`)?.resolving, 'full');
  assert.equal(await reconcileTrackingAttempt(f.db, lease.token, later()), 'settled');
  assert.equal(f.data.get(`${BASE}/progress`)?.outcome, 'interrupted');
  assert.equal(f.data.get(`${BASE}/progress`)?.resolving, null);
  assert.equal(f.data.get(`${BASE}/lease_full`)?.token, null);
  assert.equal(f.data.has(`${RECONCILIATION_COLLECTION}/${lease.token}`), false);
  const before = structuredClone([...f.data]);
  assert.equal(await reconcileTrackingAttempt(f.db, lease.token, later()), 'discarded');
  assert.deepEqual([...f.data], before);
});

test('killed final OCR fails only its round, preserves saved report, quota and full-analysis state', async () => {
  const f = setup(); const lease = await claim(f, 'refresh');
  const before = structuredClone(f.data.get(`${BASE}/current`)?.report);
  assert.equal(await reconcileTrackingAttempt(f.db, lease.token, later()), 'settled');
  const current = f.data.get(`${BASE}/current`)!;
  assert.deepEqual(current.report, before);
  assert.equal(current.version, 3);
  assert.equal((current.followUp as { status: string }).status, 'failed');
  assert.equal(f.data.get(`${BASE}/progress`)?.outcome, null);
  assert.equal([...f.data.keys()].some((k) => k.startsWith('callableRateLimits/')), false);
});

for (const change of ['generation', 'feedback', 'cancelled', 'deleted', 'version', 'replacement', 'released', 'complete', 'resume']) {
  test(`expired final resolve cannot modify ${change} work`, async () => {
    const f = setup(); const lease = await claim(f);
    if (change === 'generation') f.data.set(`${BASE}/progress`, { ...f.data.get(`${BASE}/progress`), generation: 2 });
    if (change === 'resume') f.data.set(`${BASE}/progress`, { ...f.data.get(`${BASE}/progress`), startedAt: new Date(T0 + 1).toISOString() });
    if (change === 'feedback') f.data.set(`${BASE}/feedback`, { revision: 3 });
    if (change === 'cancelled') f.data.set(ROOT, { playerId: 'owner', cancelRequested: true });
    if (change === 'deleted') f.data.delete(ROOT);
    if (change === 'version') f.data.set(`${BASE}/current`, { ...f.data.get(`${BASE}/current`), version: 4 });
    if (change === 'replacement') f.data.set(`${BASE}/lease_full`, { token: 'new-owner', expiresAtMs: later().getTime() + 1000 });
    if (change === 'released') await releaseTrackingTask(f.db, lease);
    if (change === 'complete') f.data.set(`${BASE}/progress`, { ...f.data.get(`${BASE}/progress`), resolving: null, full: { at: 'done' } });
    const before = structuredClone([...f.data].filter(([k]) => !k.startsWith(RECONCILIATION_COLLECTION)));
    assert.equal(await reconcileTrackingAttempt(f.db, lease.token, later()), 'discarded');
    const after = [...f.data].filter(([k]) => !k.startsWith(RECONCILIATION_COLLECTION));
    // A completed report may retire its own expired token; no report/progress changes are permitted.
    if (change === 'complete') {
      assert.deepEqual(f.data.get(`${BASE}/progress`), new Map(before).get(`${BASE}/progress`));
      assert.deepEqual(f.data.get(`${BASE}/current`), new Map(before).get(`${BASE}/current`));
    } else assert.deepEqual(after, before);
  });
}

test('new OCR round and already-completed follow-up are never failed', async () => {
  for (const patch of [{ round: 2 }, { status: 'done' }]) {
    const f = setup(); const lease = await claim(f, 'refresh');
    const current = f.data.get(`${BASE}/current`)!;
    f.data.set(`${BASE}/current`, { ...current, followUp: { ...(current.followUp as object), ...patch } });
    const before = structuredClone(f.data.get(`${BASE}/current`));
    assert.equal(await reconcileTrackingAttempt(f.db, lease.token, later()), 'discarded');
    assert.deepEqual(f.data.get(`${BASE}/current`), before);
  }
});

test('preliminary expiry releases its slot without interrupting analysis; feedback keeps report stale', async () => {
  const f = setup();
  f.data.set(`${BASE}/progress`, { ...f.data.get(`${BASE}/progress`), resolving: 'preliminary' });
  const early = await claim(f, 'preliminary');
  assert.equal(await reconcileTrackingAttempt(f.db, early.token, later()), 'settled');
  assert.equal(f.data.get(`${BASE}/progress`)?.outcome, null);
  assert.equal(f.data.get(`${BASE}/progress`)?.resolving, null);
  const feedback = await claim(f, 'feedback');
  assert.equal(await reconcileTrackingAttempt(f.db, feedback.token, later()), 'settled');
  assert.equal(f.data.get(`${BASE}/current`)?.stale, true);
  assert.equal(f.data.get(`${BASE}/current`)?.pendingReason, 'resolve_interrupted');
});

test('earlier attempt gets no final ticket; final busy delivery registers existing owner without takeover', async () => {
  const f = setup(); const lease = await claim(f, 'full', 0);
  assert.equal(f.data.has(`${RECONCILIATION_COLLECTION}/${lease.token}`), false);
  assert.equal(await claimTrackingTask(f.db, JOB, 2, 'full', undefined, () => new Date(T0), 2), 'busy');
  assert.equal(f.data.get(`${BASE}/lease_full`)?.token, lease.token);
  assert.equal(await reconcileTrackingAttempt(f.db, lease.token, later()), 'settled');
});

test('extended same-token lease reschedules instead of settling early', async () => {
  const f = setup(); const lease = await claim(f);
  const deadline = later().getTime() + 10000;
  f.data.set(`${BASE}/lease_full`, { token: lease.token, expiresAtMs: deadline });
  assert.equal(await reconcileTrackingAttempt(f.db, lease.token, later()), 'waiting');
  assert.equal(f.data.get(`${RECONCILIATION_COLLECTION}/${lease.token}`)?.dueAtMs, deadline);
  assert.equal(f.data.get(`${BASE}/progress`)?.outcome, null);
});

test('sweep uses a bounded single-field due query, then invokes the real transactional reconciler', async () => {
  const f = setup(); const lease = await claim(f);
  const original = f.db.collection.bind(f.db);
  const query = {
    where: (field: string, op: string, value: number) => { assert.deepEqual([field, op, value], ['dueAtMs', '<=', later().getTime()]); return query; },
    orderBy: (field: string) => { assert.equal(field, 'dueAtMs'); return query; },
    limit: (limit: number) => { assert.equal(limit, RECONCILIATION_BATCH_SIZE); return query; },
    get: async () => ({ docs: [{ id: lease.token }], size: 1 }),
  };
  f.db.collection = ((name: string) => name === RECONCILIATION_COLLECTION
    ? { ...original(name), ...query } : original(name)) as typeof f.db.collection;
  assert.equal(await sweepTrackingAttempts(f.db, later()), 1);
  assert.equal(f.data.get(`${BASE}/progress`)?.outcome, 'interrupted');
});
