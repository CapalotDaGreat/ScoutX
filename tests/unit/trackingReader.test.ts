import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readCompatibleTracking, trackingReaderRequest } from '../../functions/src/analysis/trackingReader.ts';
import { TRACKING_STORAGE_ENCODING, encodeTrackingStorage } from '../../functions/src/analysis/trackingStorage.ts';
import { pollTrackingReader } from '../../src/features/match-analysis/services/trackingReader.ts';
import { fakeDb } from './support/analysisBench.ts';
const request = { jobId: 'reader_job', readerEncoding: TRACKING_STORAGE_ENCODING };
const code = (expected: string) => (error: unknown) => { assert.equal((error as { code: string }).code, expected); return true; };
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test('compatible protocol is required per read, with no persistent account-wide grant', async () => {
  const f = fakeDb({ 'matchAnalysisJobs/reader_job': { playerId: 'owner' },
    'matchAnalysisJobs/reader_job/tracking/current': encodeTrackingStorage({ report: { stateStrip: [[0, 1, 'UNKNOWN']] }, version: 1 }) });
  for (const readerEncoding of [undefined, 0, 'v0', 'future', true]) {
    await assert.rejects(readCompatibleTracking(f.db, 'owner', { jobId: 'reader_job', readerEncoding }), code('failed-precondition'));
  }
  await assert.rejects(readCompatibleTracking(f.db, undefined, request), code('unauthenticated'));
  await assert.rejects(readCompatibleTracking(f.db, 'other', request), code('permission-denied'));
  await assert.rejects(readCompatibleTracking(f.db, 'owner', { ...request, jobId: 'missing' }), code('permission-denied'));
  const before = f.counters.writes;
  const value = await readCompatibleTracking(f.db, 'owner', request);
  assert.deepEqual(value.current?.report, { stateStrip: [[0, 1, 'UNKNOWN']] });
  assert.equal(value.discovery, null);
  assert.equal(f.counters.writes, before, 'read helper never creates capability grants or mutates reports');
  await assert.rejects(readCompatibleTracking(f.db, 'owner', { jobId: 'reader_job' }), code('failed-precondition'));
});

test('request paths and unknown fields cannot escape the owner-scoped pair of documents', () => {
  for (const input of [null, [], { ...request, jobId: '../other' }, { ...request, path: 'other' }, { ...request, jobId: '' }]) {
    assert.throws(() => trackingReaderRequest(input), code('invalid-argument'));
  }
});

test('future or malformed stored encoding fails without returning a partially decoded bundle', async () => {
  const f = fakeDb({ 'matchAnalysisJobs/reader_job': { playerId: 'owner' },
    'matchAnalysisJobs/reader_job/tracking/current': { tupleEncoding: 'future' } });
  await assert.rejects(readCompatibleTracking(f.db, 'owner', request), code('failed-precondition'));
});

test('poller negotiates response encoding, clears stale values on failure and has no direct-read fallback', async () => {
  const seen: unknown[] = []; const errors: Error[] = [];
  const scheduled: Array<() => void> = [];
  const timers = { schedule: (fn: () => void) => { scheduled.push(fn); return 1 as unknown as ReturnType<typeof setTimeout>; }, cancel: () => undefined };
  let value: unknown = { readerEncoding: TRACKING_STORAGE_ENCODING, current: { report: null }, discovery: null };
  let calls = 0;
  const stop = pollTrackingReader(async () => { calls += 1; return value; }, (v) => seen.push(v), (e) => errors.push(e), timers);
  await tick();
  assert.deepEqual(seen[0], { current: { report: null }, discovery: null });
  value = { readerEncoding: 'future', current: {}, discovery: null };
  scheduled.shift()!(); await tick();
  assert.equal(seen[1], null); assert.equal(errors.length, 1); assert.equal(calls, 2);
  const decoded = { report: { stateStrip: [[0, 1, 'UNKNOWN']], moments: [{ indicator: [[1, 2, 3, 4, 5]] }] }, version: 2 };
  const discovery = { moments: [{ indicator: [[1, 2, 3, 4, 5]] }], generation: 1 };
  value = { readerEncoding: TRACKING_STORAGE_ENCODING, current: decoded, discovery };
  scheduled.shift()!(); await tick();
  assert.deepEqual(seen[2], { current: decoded, discovery });
  value = { readerEncoding: TRACKING_STORAGE_ENCODING, current: { tupleEncoding: 'future' }, discovery: null };
  scheduled.shift()!(); await tick();
  assert.equal(seen[3], null); assert.equal(errors.length, 2);
  stop();
});

test('unsubscribe/auth-switch cancellation discards old in-flight results and schedules no more reads', async () => {
  let finish!: (value: unknown) => void; let writes = 0; let scheduled = 0;
  const stop = pollTrackingReader(() => new Promise((done) => { finish = done; }), () => { writes += 1; }, () => { writes += 1; },
    { schedule: () => { scheduled += 1; return 1 as unknown as ReturnType<typeof setTimeout>; }, cancel: () => undefined });
  stop(); finish({ readerEncoding: TRACKING_STORAGE_ENCODING, current: {}, discovery: null });
  await tick(); assert.equal(writes, 0); assert.equal(scheduled, 0);
});
