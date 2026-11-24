import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readCompatibleTracking, trackingReaderRequest } from '../../functions/src/analysis/trackingReader.ts';
import { TRACKING_STORAGE_ENCODING, encodeTrackingStorage } from '../../functions/src/analysis/trackingStorage.ts';
import { resumeTrackingPolls, subscribeTrackingSlot, trackingReportIsFinal, type TrackingPollRequest } from '../../src/features/match-analysis/services/trackingReader.ts';
import { fakeDb } from './support/analysisBench.ts';

const request = { jobId: 'reader_job', readerEncoding: TRACKING_STORAGE_ENCODING };
const stamp = '2026-11-24T12:00:00.000Z';
const later = '2026-11-24T12:05:00.000Z';
const code = (expected: string) => (error: unknown) => { assert.equal((error as { code: string }).code, expected); return true; };
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const manualTimers = () => {
  const scheduled: Array<{ fn: () => void; delay: number }> = [];
  const timers = { schedule: (fn: () => void, delay: number) => { scheduled.push({ fn, delay }); return scheduled.length as unknown as ReturnType<typeof setTimeout>; },
    cancel: () => undefined };
  return { scheduled, timers };
};
const currentDoc = encodeTrackingStorage({ report: { stateStrip: [[0, 1, 'UNKNOWN']] }, version: 1, scope: 'preliminary', stale: true, updatedAt: stamp });

test('compatible protocol is required per read, with no persistent account-wide grant', async () => {
  const f = fakeDb({ 'matchAnalysisJobs/reader_job': { playerId: 'owner' }, 'matchAnalysisJobs/reader_job/tracking/current': currentDoc });
  for (const readerEncoding of [undefined, 0, 'v0', 'future', true]) {
    await assert.rejects(readCompatibleTracking(f.db, 'owner', { jobId: 'reader_job', readerEncoding }), code('failed-precondition'));
  }
  await assert.rejects(readCompatibleTracking(f.db, undefined, request), code('unauthenticated'));
  await assert.rejects(readCompatibleTracking(f.db, 'other', request), code('permission-denied'));
  assert.equal(f.transactionOptions.at(-1)?.readOnly, true);
  await assert.rejects(readCompatibleTracking(f.db, 'owner', { ...request, jobId: 'missing' }), code('permission-denied'));
  const before = f.counters.writes;
  const value = await readCompatibleTracking(f.db, 'owner', request);
  assert.deepEqual(value.current?.report, { stateStrip: [[0, 1, 'UNKNOWN']] });
  assert.equal(value.discovery, null);
  assert.equal(f.counters.writes, before, 'read helper never creates capability grants or mutates reports');
  assert.ok(f.transactionOptions.every((options) => options?.readOnly === true));
  await assert.rejects(readCompatibleTracking(f.db, 'owner', { jobId: 'reader_job' }), code('failed-precondition'));
});

test('request paths and unknown fields cannot escape the owner-scoped pair of documents', () => {
  for (const input of [null, [], { ...request, jobId: '../other' }, { ...request, path: 'other' }, { ...request, jobId: '' },
    { ...request, documents: [] }, { ...request, documents: ['current', 'current'] }, { ...request, documents: ['progress'] },
    { ...request, documents: ['current'], since: { discovery: stamp } }, { ...request, since: { current: 'yesterday' } }]) {
    assert.throws(() => trackingReaderRequest(input), code('invalid-argument'));
  }
});

test('a read-only snapshot skips unrequested documents and unchanged bodies', async () => {
  const f = fakeDb({ 'matchAnalysisJobs/reader_job': { playerId: 'owner' },
    'matchAnalysisJobs/reader_job/tracking/current': currentDoc,
    'matchAnalysisJobs/reader_job/tracking/discovery': encodeTrackingStorage({ moments: [], generation: 1, updatedAt: later }) });
  const one = await readCompatibleTracking(f.db, 'owner', { ...request, documents: ['current'] });
  assert.equal(f.counters.reads, 2, 'job owner plus the one requested document');
  assert.equal(Object.hasOwn(one, 'discovery'), false);
  assert.equal(one.current?.updatedAt, stamp);
  const same = await readCompatibleTracking(f.db, 'owner', { ...request, documents: ['current'], since: { current: stamp } });
  assert.equal(f.counters.reads, 4);
  assert.equal(Object.hasOwn(same, 'current'), false);
  assert.deepEqual(same.unchanged, { current: true });
  const changed = await readCompatibleTracking(f.db, 'owner', { ...request, documents: ['discovery'], since: { discovery: stamp } });
  assert.equal(changed.discovery?.generation, 1);
  assert.equal(changed.unchanged, undefined);
});

test('future or malformed stored encoding fails without returning a partially decoded bundle', async () => {
  const f = fakeDb({ 'matchAnalysisJobs/reader_job': { playerId: 'owner' },
    'matchAnalysisJobs/reader_job/tracking/current': { tupleEncoding: 'future', updatedAt: stamp } });
  await assert.rejects(readCompatibleTracking(f.db, 'owner', request), code('failed-precondition'));
  const skipped = await readCompatibleTracking(f.db, 'owner', { ...request, documents: ['current'], since: { current: stamp } });
  assert.equal(Object.hasOwn(skipped, 'current'), false, 'a matching update time is not downloaded or decoded again');
  await assert.rejects(readCompatibleTracking(f.db, 'owner', { ...request, documents: ['current'], since: { current: later } }), code('failed-precondition'));
});

test('final means a full unstale report whose follow-up is not still queued', () => {
  const base = { scope: 'full', stale: false, updatedAt: stamp };
  assert.equal(trackingReportIsFinal(base), true);
  assert.equal(trackingReportIsFinal({ ...base, followUp: { status: 'done' } }), true);
  assert.equal(trackingReportIsFinal({ ...base, followUp: { status: 'failed' } }), true);
  assert.equal(trackingReportIsFinal(null), false);
  assert.equal(trackingReportIsFinal({ ...base, scope: 'preliminary' }), false);
  assert.equal(trackingReportIsFinal({ ...base, stale: true }), false);
  assert.equal(trackingReportIsFinal({ ...base, pendingReason: 'resolve_interrupted' }), false);
  assert.equal(trackingReportIsFinal({ ...base, followUp: { status: 'scheduled' } }), false);
  assert.equal(trackingReportIsFinal({ ...base, followUp: { status: 'running' } }), false);
});

test('one job poller asks only for mounted documents and skips unchanged bodies', async () => {
  const reads: TrackingPollRequest[] = [];
  const currentSeen: unknown[] = [];
  const discoverySeen: unknown[] = [];
  const { scheduled, timers } = manualTimers();
  let response: unknown = { readerEncoding: TRACKING_STORAGE_ENCODING,
    current: { report: { stateStrip: [[0, 1, 'UNKNOWN']] }, version: 1, scope: 'preliminary', stale: true, updatedAt: stamp },
    discovery: { moments: [{ indicator: [[1, 2, 3, 4, 5]] }], generation: 1, updatedAt: later } };
  const read = async (input: TrackingPollRequest) => { reads.push(input); return response; };
  const stopCurrent = subscribeTrackingSlot({ key: 'owner\njob', jobId: 'job', slot: 'current', read, onChange: (doc) => currentSeen.push(doc), timers });
  const stopDiscovery = subscribeTrackingSlot({ key: 'owner\njob', jobId: 'job', slot: 'discovery', read, onChange: (doc) => discoverySeen.push(doc), timers });
  await tick();
  assert.equal(reads.length, 1);
  assert.deepEqual(reads[0].documents, ['current', 'discovery']);
  assert.equal(reads[0].since, undefined);
  assert.deepEqual((currentSeen[0] as { report: { stateStrip: unknown } }).report.stateStrip, [[0, 1, 'UNKNOWN']]);
  assert.deepEqual((discoverySeen[0] as { moments: Array<{ indicator: unknown }> }).moments[0].indicator, [[1, 2, 3, 4, 5]]);
  response = { readerEncoding: TRACKING_STORAGE_ENCODING, unchanged: { current: true, discovery: true } };
  assert.equal(scheduled.length, 1);
  scheduled.shift()?.fn(); await tick();
  assert.deepEqual(reads[1].since, { current: stamp, discovery: later });
  assert.equal(currentSeen.length, 1);
  assert.equal(discoverySeen.length, 1);
  stopCurrent();
  assert.equal(scheduled.length, 1);
  scheduled.shift()?.fn(); await tick();
  assert.deepEqual(reads[2].documents, ['discovery']);
  assert.deepEqual(reads[2].since, { discovery: later });
  stopDiscovery();
});

test('network errors keep the last report; permission errors clear it', async () => {
  const seen: unknown[] = []; const errors: string[] = [];
  const { scheduled, timers } = manualTimers();
  let mode: 'ok' | 'offline' | 'denied' = 'ok';
  const stop = subscribeTrackingSlot({ key: 'keep\njob', jobId: 'job', slot: 'current', timers,
    read: async () => {
      if (mode === 'offline') throw Object.assign(new Error('offline'), { code: 'unavailable' });
      if (mode === 'denied') throw Object.assign(new Error('denied'), { code: 'functions/permission-denied' });
      return { readerEncoding: TRACKING_STORAGE_ENCODING, current: { report: { stateStrip: [[0, 1, 'UNKNOWN']] }, version: 1, scope: 'preliminary', stale: true, updatedAt: stamp } };
    },
    onChange: (doc) => seen.push(doc), onError: (error) => errors.push(error.message) });
  await tick();
  assert.equal((seen[0] as { version: number }).version, 1);
  mode = 'offline'; scheduled.shift()?.fn(); await tick();
  assert.equal(seen.length, 1); assert.deepEqual(errors, ['offline']); assert.equal(scheduled.at(-1)?.delay, 30000);
  mode = 'denied'; scheduled.shift()?.fn(); await tick();
  assert.equal(seen.at(-1), null); assert.deepEqual(errors, ['offline', 'denied']);
  stop();
});

test('resume keeps polling a final snapshot until its update time changes', async () => {
  const seen: unknown[] = [];
  const { scheduled, timers } = manualTimers();
  let current: Record<string, unknown> = { version: 1, scope: 'full', stale: false, updatedAt: stamp, report: null };
  const stop = subscribeTrackingSlot({ key: 'resume\njob', jobId: 'job', slot: 'current', timers,
    read: async () => ({ readerEncoding: TRACKING_STORAGE_ENCODING, current }), onChange: (doc) => seen.push(doc) });
  await tick();
  assert.equal(scheduled.length, 0);
  resumeTrackingPolls('job'); await tick();
  assert.equal(scheduled.length, 1, 'the same final snapshot does not stop the resumed loop');
  current = { version: 2, scope: 'full', stale: true, updatedAt: later, report: null };
  scheduled.shift()?.fn(); await tick();
  assert.equal((seen.at(-1) as { stale: boolean }).stale, true);
  assert.equal(scheduled.length, 1);
  stop();
});

test('unsubscribe discards an in-flight result and schedules no more reads', async () => {
  let finish!: (value: unknown) => void; const seen: unknown[] = [];
  const { scheduled, timers } = manualTimers();
  const stop = subscribeTrackingSlot({ key: 'cancel\njob', jobId: 'job', slot: 'current', timers,
    read: () => new Promise((done) => { finish = done; }), onChange: (doc) => seen.push(doc), onError: () => seen.push('error') });
  await Promise.resolve();
  stop();
  finish({ readerEncoding: TRACKING_STORAGE_ENCODING, current: { version: 1 } });
  await tick();
  assert.deepEqual(seen, []); assert.equal(scheduled.length, 0);
});
