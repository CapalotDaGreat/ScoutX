import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  downloadToQuarantine,
  importContentType,
  linkFingerprint,
  pinnedLookup,
  type Hop,
  type HopOpener,
  type ImportSink,
} from '../../functions/src/uploads/linkImport.ts';
import { processLinkImport } from '../../functions/src/uploads/linkImportJobs.ts';
import { crc32cToBase64, crc32cUpdate } from '../../functions/src/uploads/crc32c.ts';

type Firestore = Parameters<typeof processLinkImport>[0];

const PUBLIC = async () => ['93.184.216.34'];
const MP4_HEAD = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]);

function videoBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  out.set(MP4_HEAD.subarray(0, Math.min(16, n)));
  for (let i = 16; i < n; i += 1) out[i] = i % 251;
  return out;
}

async function* chunks(data: Uint8Array, size: number): AsyncIterable<Uint8Array> {
  for (let i = 0; i < data.length; i += size) yield data.subarray(i, i + size);
}

function hop(status: number, headers: Record<string, string>, body: Uint8Array = new Uint8Array(0), size = 1000): Hop {
  return { status, headers, body: chunks(body, size), destroy: () => undefined };
}

function memorySink() {
  const state = { written: 0, declared: null as string | null, ended: false, aborted: false };
  const sink: ImportSink = {
    async write(c) { state.written += c.length; },
    async beforeEnd(crc) { state.declared = crc; },
    async end() { state.ended = true; },
    async abort() { state.aborted = true; },
  };
  return { sink, state };
}

const notCancelled = async () => false;

test('streams a direct link, checks magic bytes and declares the CRC32C before finalising', async () => {
  const data = videoBytes(5000);
  const open: HopOpener = async () => hop(200, { 'content-length': '5000', 'content-type': 'video/mp4' }, data);
  const { sink, state } = memorySink();
  const out = await downloadToQuarantine({ url: 'https://cdn.example.com/m.mp4', expectedBytes: 5000, maxBytes: 10_000,
    open, sink, isCancelled: notCancelled, resolve: PUBLIC });
  assert.equal(out.ok, true);
  assert.equal(state.written, 5000);
  assert.equal(state.ended, true);
  assert.equal(state.declared, crc32cToBase64(crc32cUpdate(0, data)));
  assert.equal(out.ok && out.crc32c, state.declared);
});

test('redirects are re-validated: a hop to a private address is refused', async () => {
  const resolve = async (host: string) => (host === 'internal.example.com' ? ['10.0.0.5'] : ['93.184.216.34']);
  const open: HopOpener = async (url) =>
    url.hostname === 'cdn.example.com'
      ? hop(302, { location: 'https://internal.example.com/secret' })
      : hop(200, { 'content-length': '5000' }, videoBytes(5000));
  const { sink, state } = memorySink();
  const out = await downloadToQuarantine({ url: 'https://cdn.example.com/m.mp4', expectedBytes: 5000, maxBytes: 10_000,
    open, sink, isCancelled: notCancelled, resolve });
  assert.deepEqual(out, { ok: false, reason: 'private_address' });
  assert.equal(state.aborted, true);
  const loop: HopOpener = async () => hop(302, { location: 'https://cdn.example.com/again' });
  const looped = await downloadToQuarantine({ url: 'https://cdn.example.com/m.mp4', expectedBytes: 5000, maxBytes: 10_000,
    open: loop, sink: memorySink().sink, isCancelled: notCancelled, resolve: PUBLIC });
  assert.deepEqual(looped, { ok: false, reason: 'too_many_redirects' });
  const plain = await downloadToQuarantine({ url: 'http://cdn.example.com/m.mp4', expectedBytes: 5000, maxBytes: 10_000,
    open, sink: memorySink().sink, isCancelled: notCancelled, resolve: PUBLIC });
  assert.equal(plain.ok, false);
});

test('size, type and limit violations abort the write', async () => {
  const run = async (headers: Record<string, string>, body: Uint8Array, expected = 5000, max = 10_000) => {
    const { sink, state } = memorySink();
    const out = await downloadToQuarantine({ url: 'https://cdn.example.com/m.mp4', expectedBytes: expected, maxBytes: max,
      open: async () => hop(200, headers, body), sink, isCancelled: notCancelled, resolve: PUBLIC });
    return { out, state };
  };
  // Header promises 5000, body sends more.
  let r = await run({ 'content-length': '5000' }, videoBytes(6000));
  assert.deepEqual(r.out, { ok: false, reason: 'size_mismatch' });
  assert.equal(r.state.ended, false);
  // Header differs from what inspection recorded.
  r = await run({ 'content-length': '4000' }, videoBytes(4000));
  assert.deepEqual(r.out, { ok: false, reason: 'size_mismatch' });
  // Truncated body.
  r = await run({ 'content-length': '5000' }, videoBytes(3000));
  assert.deepEqual(r.out, { ok: false, reason: 'size_mismatch' });
  // Not an MP4/MOV container.
  r = await run({ 'content-length': '5000' }, new Uint8Array(5000).fill(0x41));
  assert.deepEqual(r.out, { ok: false, reason: 'not_video' });
  // Over the plan limit.
  r = await run({ 'content-length': '5000' }, videoBytes(5000), 5000, 4000);
  assert.deepEqual(r.out, { ok: false, reason: 'too_large' });
  r = await run({}, videoBytes(5000));
  assert.deepEqual(r.out, { ok: false, reason: 'size_mismatch' }, 'missing Content-Length is refused');
});

test('cancellation is observed between chunks and the partial write is aborted', async () => {
  let checks = 0;
  const { sink, state } = memorySink();
  const out = await downloadToQuarantine({ url: 'https://cdn.example.com/m.mp4', expectedBytes: 50_000, maxBytes: 100_000,
    open: async () => hop(200, { 'content-length': '50000' }, videoBytes(50_000), 1000), sink, resolve: PUBLIC,
    isCancelled: async () => (checks += 1) >= 2, limits: { cancelCheckBytes: 10_000 } });
  assert.deepEqual(out, { ok: false, reason: 'cancelled' });
  assert.equal(state.aborted, true);
  assert.ok(state.written < 50_000);
});

test('a stalled source times out', async () => {
  async function* stall(): AsyncIterable<Uint8Array> {
    yield videoBytes(100);
    await new Promise(() => undefined);
  }
  const { sink } = memorySink();
  const out = await downloadToQuarantine({ url: 'https://cdn.example.com/m.mp4', expectedBytes: 5000, maxBytes: 10_000,
    open: async () => ({ status: 200, headers: { 'content-length': '5000' }, body: stall(), destroy: () => undefined }),
    sink, isCancelled: notCancelled, resolve: PUBLIC, limits: { idleTimeoutMs: 30 } });
  assert.deepEqual(out, { ok: false, reason: 'timeout' });
});

test('pinned lookup refuses private records (DNS rebinding) and returns validated public ones', async () => {
  const call = (resolve: (h: string) => Promise<string[]>, all: boolean) =>
    new Promise<{ err: NodeJS.ErrnoException | null; addr: unknown }>((done) => {
      (pinnedLookup(resolve) as unknown as (h: string, o: object, cb: (e: NodeJS.ErrnoException | null, a?: unknown) => void) => void)(
        'x.example.com', { all }, (err, addr) => done({ err, addr }));
    });
  const mixed = await call(async () => ['93.184.216.34', '169.254.169.254'], false);
  assert.equal(mixed.err?.code, 'EPRIVATEADDR');
  const ok = await call(async () => ['93.184.216.34'], true);
  assert.deepEqual(ok.addr, [{ address: '93.184.216.34', family: 4 }]);
});

test('link fingerprints are per owner/job/url and content types normalise', () => {
  assert.notEqual(linkFingerprint('u1', 'job_1', 'https://a/x.mp4'), linkFingerprint('u2', 'job_1', 'https://a/x.mp4'));
  assert.match(linkFingerprint('u1', 'job_1', 'https://a/x.mp4'), /^[a-f0-9]{64}$/);
  assert.equal(importContentType('video/quicktime'), 'video/quicktime');
  assert.equal(importContentType('application/octet-stream'), 'video/mp4');
});

// ---------------------------------------------------------------------------- task body with a fake Firestore

function fakeDb(seed: Record<string, Record<string, unknown>>) {
  const data = new Map<string, Record<string, unknown>>(Object.entries(seed));
  const snap = (path: string) => ({ exists: data.has(path), data: () => data.get(path), get: (k: string) => data.get(path)?.[k] });
  const docRef = (path: string): Record<string, unknown> => ({
    path,
    collection: (name: string) => collectionRef(`${path}/${name}`),
    get: async () => snap(path),
    set: async (value: Record<string, unknown>, opts?: { merge?: boolean }) => {
      data.set(path, opts?.merge ? { ...(data.get(path) ?? {}), ...value } : value);
    },
    update: async (value: Record<string, unknown>) => {
      data.set(path, { ...(data.get(path) ?? {}), ...value });
    },
    delete: async () => {
      data.delete(path);
    },
  });
  const collectionRef = (path: string) => ({ doc: (id: string) => docRef(`${path}/${id}`) });
  const db = {
    collection: collectionRef,
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn({
      get: async (ref: { path: string }) => snap(ref.path),
      set: (ref: { path: string }, value: Record<string, unknown>, opts?: { merge?: boolean }) => {
        data.set(ref.path, opts?.merge ? { ...(data.get(ref.path) ?? {}), ...value } : value);
      },
      update: (ref: { path: string }, value: Record<string, unknown>) => {
        data.set(ref.path, { ...(data.get(ref.path) ?? {}), ...value });
      },
    }),
  };
  return { db: db as unknown as Firestore, data };
}

function seed(state = 'uploading') {
  return {
    'mediaUploads/up_1': { ownerId: 'u1', jobId: 'job_123456', state, source: 'link', sizeBytes: 5000,
      contentType: 'video/mp4', storagePath: 'quarantine/u1/up_1/source' },
    'mediaImportSources/up_1': { ownerId: 'u1', url: 'https://cdn.example.com/m.mp4' },
    'matchAnalysisJobs/job_123456': { playerId: 'u1', status: 'uploading' },
    'videoProcessingConsents/job_123456': { uid: 'u1', revokedAt: null },
  };
}

test('task: imports into quarantine, declares the checksum and deletes the server-only source link', async () => {
  const { db, data } = fakeDb(seed());
  const { sink, state } = memorySink();
  const out = await processLinkImport(db, 'up_1', {
    sinkFor: () => ({ ...sink, beforeEnd: async (crc, bytes) => {
      await sink.beforeEnd(crc, bytes);
      data.set('mediaUploads/up_1', { ...data.get('mediaUploads/up_1'), declaredCrc32c: crc });
    } }),
    open: async () => hop(200, { 'content-length': '5000' }, videoBytes(5000)),
    resolve: PUBLIC,
  });
  assert.equal(out, 'imported');
  assert.equal(state.ended, true);
  assert.ok(data.get('mediaUploads/up_1')?.declaredCrc32c);
  assert.equal(data.has('mediaImportSources/up_1'), false, 'source URL (may hold a token) is deleted');
  assert.equal(data.get('mediaUploads/up_1')?.state, 'uploading', 'the quarantine trigger, not the importer, validates');
});

test('task: failures reject the upload, fail the job with a translatable code; cancelled/withdrawn imports stop', async () => {
  const bad = fakeDb(seed());
  assert.equal(await processLinkImport(bad.db, 'up_1', {
    sinkFor: () => memorySink().sink,
    open: async () => hop(200, { 'content-length': '5000' }, new Uint8Array(5000)),
    resolve: PUBLIC,
  }), 'failed');
  assert.equal(bad.data.get('mediaUploads/up_1')?.state, 'rejected');
  assert.equal(bad.data.get('mediaUploads/up_1')?.rejectionReason, 'link_not_video');
  assert.equal(bad.data.get('matchAnalysisJobs/job_123456')?.errorCode, 'link_import_failed');
  assert.equal(bad.data.has('mediaImportSources/up_1'), false);

  const withdrawn = fakeDb({ ...seed(), 'videoProcessingConsents/job_123456': { uid: 'u1', revokedAt: '2026-10-26T00:00:00Z' } });
  const { sink, state } = memorySink();
  assert.equal(await processLinkImport(withdrawn.db, 'up_1', {
    sinkFor: () => sink,
    open: async () => hop(200, { 'content-length': '5000' }, videoBytes(5000)),
    resolve: PUBLIC,
  }), 'failed');
  assert.equal(state.aborted, true, 'consent withdrawn mid-import: nothing is finalised');
  assert.equal(withdrawn.data.get('mediaUploads/up_1')?.state, 'cancelled');

  const done = fakeDb(seed('cancelled'));
  assert.equal(await processLinkImport(done.db, 'up_1', { sinkFor: () => memorySink().sink, resolve: PUBLIC }), 'skipped');
});

test('the real HTTPS opener never connects to a host that resolves to loopback', async () => {
  const { createServer } = await import('node:net');
  let connected = false;
  const server = createServer((socket) => { connected = true; socket.destroy(); });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()));
  const port = (server.address() as { port: number }).port;
  const { httpsOpener } = await import('../../functions/src/uploads/linkImport.ts');
  const open = httpsOpener(async () => ['127.0.0.1']);
  await assert.rejects(open(new URL(`https://rebind.example.com:${port}/x.mp4`), new AbortController().signal),
    (error: NodeJS.ErrnoException) => error.code === 'EPRIVATEADDR');
  server.close();
  assert.equal(connected, false);
});
