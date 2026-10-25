import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  UPLOAD_LIMITS,
  UPLOAD_STATES as SERVER_STATES,
  isAbandoned,
  matchFootagePath,
  parseQuarantinePath,
  parseUploadRequest,
  quarantinePath,
  sanitizeFileName,
} from '../../functions/src/uploads/model.ts';
import {
  CHUNKED_UPLOAD,
  bytesPerSecond,
  chunkLength,
  contentRangeHeader,
  contentTypeForFileName,
  etaSeconds,
  formatBytes,
  formatEta,
  nextOffsetFromRange,
  offsetQueryHeader,
} from '../../src/features/media-upload/services/chunkPlan.ts';
import {
  ResumableSessionUploader,
  UploadSessionExpiredError,
  UploadProtocolError,
  type ChunkSource,
} from '../../src/features/media-upload/services/resumableSessionUploader.ts';
import {
  UPLOAD_STATES as CLIENT_STATES,
  parsePendingUploads,
  parseServerUploadRecord,
  uploadErrorCodeFor,
} from '../../src/features/media-upload/types.ts';

const KIB256 = 256 * 1024;

type FakeInit = { method: string; headers: Record<string, string>; body?: ArrayBuffer };

/**
 * In-memory GCS resumable session following the documented protocol: 308 + `Range: bytes=0-N`
 * for committed bytes, `bytes * /total` offset queries, 200 on the final byte, non-final chunks
 * committed only in 256 KiB multiples, 404 once the session is gone.
 */
class FakeGcsSession {
  committed = 0;
  data: Buffer;
  finished = false;
  expired = false;
  puts = 0;
  /** Commit the chunk but drop the response, like a connection lost after the server stored it. */
  dropResponseOnPut = new Set<number>();
  failStatusOnPut = new Map<number, number>();
  readonly total: number;

  constructor(total: number) {
    this.total = total;
    this.data = Buffer.alloc(total);
  }

  fetch = async (_url: string, init: FakeInit) => {
    if (this.expired) return this.reply(404);
    const range = init.headers['Content-Range'];
    if (!init.body) {
      assert.equal(range, `bytes */${this.total}`);
      return this.finished ? this.reply(200) : this.reply308();
    }
    this.puts += 1;
    const forced = this.failStatusOnPut.get(this.puts);
    if (forced) return this.reply(forced);
    const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range);
    assert.ok(match, `valid Content-Range: ${range}`);
    const start = Number(match[1]);
    const end = Number(match[2]);
    const body = Buffer.from(init.body);
    assert.equal(body.length, end - start + 1, 'body length matches Content-Range');
    if (start === this.committed) {
      const isFinal = end + 1 === this.total;
      const accepted = isFinal ? body.length : body.length - (body.length % KIB256);
      body.copy(this.data, start, 0, accepted);
      this.committed += accepted;
      if (isFinal) this.finished = true;
    }
    if (this.dropResponseOnPut.has(this.puts)) throw new TypeError('Network request failed');
    return this.finished ? this.reply(200) : this.reply308();
  };

  private reply(status: number) {
    return { status, headers: { get: () => null } };
  }

  private reply308() {
    const header = this.committed > 0 ? `bytes=0-${this.committed - 1}` : null;
    return { status: 308, headers: { get: (name: string) => (name.toLowerCase() === 'range' ? header : null) } };
  }
}

function sourceOf(bytes: Buffer): ChunkSource & { reads: number } {
  const source = {
    reads: 0,
    size: bytes.length,
    read: async (offset: number, length: number) => {
      source.reads += 1;
      const slice = bytes.subarray(offset, offset + length);
      return slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength) as ArrayBuffer;
    },
    close: () => undefined,
  };
  return source;
}

const noSleep = async () => undefined;

describe('chunk plan', () => {
  it('builds Content-Range headers and parses GCS Range replies', () => {
    assert.equal(contentRangeHeader(0, 8, 20), 'bytes 0-7/20');
    assert.equal(offsetQueryHeader(20), 'bytes */20');
    assert.equal(nextOffsetFromRange('bytes=0-8388607'), 8388608);
    assert.equal(nextOffsetFromRange(null), 0);
    assert.equal(nextOffsetFromRange('garbage'), 0);
    assert.equal(chunkLength(16, 20, 8), 4);
    assert.equal(chunkLength(20, 20, 8), 0);
  });

  it('formats bytes, speed and ETA for display', () => {
    assert.equal(formatBytes(512 * 1024), '512 KB');
    assert.equal(formatBytes(15.5 * 1024 * 1024), '15.5 MB');
    assert.equal(formatBytes(1.5 * 1024 ** 3), '1.50 GB');
    assert.equal(formatEta(59), '59s');
    assert.equal(formatEta(125), '2m 05s');
    assert.equal(formatEta(3 * 3600 + 7 * 60), '3h 07m');
    assert.equal(formatEta(null), null);
    const rate = bytesPerSecond([{ atMs: 0, sentBytes: 0 }, { atMs: 2000, sentBytes: 4_000_000 }], 2000);
    assert.equal(rate, 2_000_000);
    assert.equal(etaSeconds(10_000_000, rate), 5);
    assert.equal(bytesPerSecond([{ atMs: 0, sentBytes: 0 }], 0), null);
  });

  it('maps file names to the two accepted container types', () => {
    assert.equal(contentTypeForFileName('IMG_0001.MOV'), 'video/quicktime');
    assert.equal(contentTypeForFileName('match.mp4'), 'video/mp4');
    assert.equal(contentTypeForFileName(undefined), 'video/mp4');
  });

  it('keeps client limits and states in sync with the server', () => {
    assert.equal(CHUNKED_UPLOAD.chunkBytes, UPLOAD_LIMITS.chunkBytes);
    assert.equal(CHUNKED_UPLOAD.maxBytes, UPLOAD_LIMITS.maxBytes);
    assert.equal(CHUNKED_UPLOAD.minBytes, UPLOAD_LIMITS.minBytes);
    assert.equal(CHUNKED_UPLOAD.maxDurationSec, UPLOAD_LIMITS.maxDurationSec);
    assert.equal(CHUNKED_UPLOAD.chunkBytes % KIB256, 0, 'GCS chunk granularity');
    assert.deepEqual([...CLIENT_STATES].sort(), [...SERVER_STATES].sort());
  });
});

describe('ResumableSessionUploader', () => {
  it('does not start analysis when cancellation arrives during the final chunk', async () => {
    const bytes = Buffer.alloc(KIB256);
    const gcs = new FakeGcsSession(bytes.length);
    const uploader: ResumableSessionUploader = new ResumableSessionUploader({
      sessionUri: 'https://storage.example/upload', source: sourceOf(bytes), chunkBytes: KIB256,
      fetchImpl: async (url, init) => {
        const reply = await gcs.fetch(url, init);
        uploader.cancel();
        return reply;
      },
    });
    assert.equal(await uploader.run(0), 'cancelled');
    assert.equal(gcs.finished, true, 'bytes may already be committed, but the caller must still cancel the upload record');
  });

  it('bounds successful 308 replies that never commit bytes', async () => {
    let requests = 0;
    const uploader = new ResumableSessionUploader({
      sessionUri: 'https://storage.example/upload', source: sourceOf(Buffer.alloc(KIB256)), chunkBytes: KIB256,
      fetchImpl: async () => { requests += 1; return { status: 308, headers: { get: () => null } }; },
      maxConsecutiveFailures: 3, sleep: noSleep,
    });
    await assert.rejects(uploader.run(0), /HTTP 408/);
    assert.equal(requests, 5, 'three bounded PUT attempts and two offset queries');
  });

  it('rejects malformed, unsafe and out-of-range committed offsets without restarting at zero', async () => {
    for (const range of ['garbage', 'bytes=1-5', 'bytes=0-9007199254740992', `bytes=0-${KIB256 * 2}`]) {
      const uploader = new ResumableSessionUploader({
        sessionUri: 'https://storage.example/upload', source: sourceOf(Buffer.alloc(KIB256)), chunkBytes: KIB256,
        fetchImpl: async () => ({ status: 308, headers: { get: () => range } }), sleep: noSleep,
      });
      await assert.rejects(uploader.run(), UploadProtocolError, range);
    }
  });

  it('rejects short source reads and premature completion', async () => {
    const source = sourceOf(Buffer.alloc(KIB256 * 2));
    source.read = async () => new ArrayBuffer(1);
    const uploader = new ResumableSessionUploader({ sessionUri: 'https://storage.example/upload', source, chunkBytes: KIB256 });
    await assert.rejects(uploader.run(0), UploadProtocolError);
    const premature = new ResumableSessionUploader({
      sessionUri: 'https://storage.example/upload', source: sourceOf(Buffer.alloc(KIB256 * 2)), chunkBytes: KIB256,
      fetchImpl: async () => ({ status: 200, headers: { get: () => null } }),
    });
    await assert.rejects(premature.run(0), UploadProtocolError);
  });

  it('honours pause during retry backoff without another request', async () => {
    let requests = 0;
    const uploader: ResumableSessionUploader = new ResumableSessionUploader({
      sessionUri: 'https://storage.example/upload', source: sourceOf(Buffer.alloc(KIB256)), chunkBytes: KIB256,
      fetchImpl: async () => { requests += 1; throw new TypeError('offline'); },
      sleep: async (): Promise<void> => { uploader.pause(); },
    });
    assert.equal(await uploader.run(0), 'paused');
    assert.equal(requests, 1);
  });

  it('bounds a hung transport and aborts it', async () => {
    let signal: AbortSignal | undefined;
    const uploader = new ResumableSessionUploader({
      sessionUri: 'https://storage.example/upload', source: sourceOf(Buffer.alloc(KIB256)), chunkBytes: KIB256,
      fetchImpl: async (_url, init) => { signal = init.signal; return new Promise(() => undefined); },
      requestTimeoutMs: 10, maxConsecutiveFailures: 1,
    });
    await assert.rejects(uploader.run(0), /HTTP 408/);
    assert.equal(signal?.aborted, true);
  });

  it('uploads in fixed slices without reading the whole file at once', async () => {
    const bytes = randomBytes(KIB256 * 4 + 777);
    const gcs = new FakeGcsSession(bytes.length);
    const source = sourceOf(bytes);
    const progress: number[] = [];
    const uploader = new ResumableSessionUploader({
      sessionUri: 'https://storage.example/upload',
      source,
      chunkBytes: KIB256,
      fetchImpl: gcs.fetch,
      onProgress: (p) => progress.push(p.sentBytes),
    });
    assert.equal(await uploader.run(0), 'complete');
    assert.ok(gcs.data.equals(bytes));
    assert.equal(source.reads, 5);
    assert.deepEqual(progress, [0, KIB256, KIB256 * 2, KIB256 * 3, KIB256 * 4, bytes.length]);
  });

  it('recovers when the connection drops after the server committed a chunk', async () => {
    const bytes = randomBytes(KIB256 * 3 + 10);
    const gcs = new FakeGcsSession(bytes.length);
    gcs.dropResponseOnPut.add(2);
    const uploader = new ResumableSessionUploader({
      sessionUri: 'https://storage.example/upload',
      source: sourceOf(bytes),
      chunkBytes: KIB256,
      fetchImpl: gcs.fetch,
      sleep: noSleep,
    });
    assert.equal(await uploader.run(0), 'complete');
    assert.ok(gcs.data.equals(bytes));
    assert.equal(gcs.puts, 4, 'the committed chunk is not sent twice');
  });

  it('retries transient 5xx replies and resumes from the committed offset', async () => {
    const bytes = randomBytes(KIB256 * 2 + 5);
    const gcs = new FakeGcsSession(bytes.length);
    gcs.failStatusOnPut.set(2, 503);
    const sleeps: number[] = [];
    const uploader = new ResumableSessionUploader({
      sessionUri: 'https://storage.example/upload',
      source: sourceOf(bytes),
      chunkBytes: KIB256,
      fetchImpl: gcs.fetch,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    assert.equal(await uploader.run(0), 'complete');
    assert.ok(gcs.data.equals(bytes));
    assert.deepEqual(sleeps, [500]);
  });

  it('pauses between chunks and a new uploader resumes from the server offset', async () => {
    const bytes = randomBytes(KIB256 * 4);
    const gcs = new FakeGcsSession(bytes.length);
    const first: ResumableSessionUploader = new ResumableSessionUploader({
      sessionUri: 'https://storage.example/upload',
      source: sourceOf(bytes),
      chunkBytes: KIB256,
      fetchImpl: gcs.fetch,
      onProgress: (p) => {
        if (p.sentBytes >= KIB256 * 2) first.pause();
      },
    });
    assert.equal(await first.run(0), 'paused');
    assert.equal(gcs.committed, KIB256 * 2);

    const resumed = new ResumableSessionUploader({
      sessionUri: 'https://storage.example/upload',
      source: sourceOf(bytes),
      chunkBytes: KIB256,
      fetchImpl: gcs.fetch,
    });
    assert.equal(await resumed.queryOffset(), KIB256 * 2);
    assert.equal(await resumed.run(), 'complete');
    assert.ok(gcs.data.equals(bytes));
    assert.equal(gcs.puts, 4, 'no chunk is re-sent after resume');
  });

  it('stops on cancel and surfaces an expired session without retrying', async () => {
    const bytes = randomBytes(KIB256 * 2);
    const gcs = new FakeGcsSession(bytes.length);
    const cancelled: ResumableSessionUploader = new ResumableSessionUploader({
      sessionUri: 'https://storage.example/upload',
      source: sourceOf(bytes),
      chunkBytes: KIB256,
      fetchImpl: gcs.fetch,
      onProgress: (p) => {
        if (p.sentBytes > 0) cancelled.cancel();
      },
    });
    assert.equal(await cancelled.run(0), 'cancelled');

    gcs.expired = true;
    const sleeps: number[] = [];
    const expired = new ResumableSessionUploader({
      sessionUri: 'https://storage.example/upload',
      source: sourceOf(bytes),
      chunkBytes: KIB256,
      fetchImpl: gcs.fetch,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    await assert.rejects(expired.run(), UploadSessionExpiredError);
    assert.deepEqual(sleeps, []);
  });

  it('gives up after repeated network failures', async () => {
    const bytes = randomBytes(KIB256);
    const uploader = new ResumableSessionUploader({
      sessionUri: 'https://storage.example/upload',
      source: sourceOf(bytes),
      chunkBytes: KIB256,
      fetchImpl: async () => {
        throw new TypeError('Network request failed');
      },
      sleep: noSleep,
      maxConsecutiveFailures: 3,
    });
    await assert.rejects(uploader.run(0), TypeError);
  });
});

describe('upload request model', () => {
  const valid = {
    purpose: 'match_footage',
    jobId: 'match_123456_abc',
    fileName: '../../etc/passwd match.mp4',
    contentType: 'video/mp4',
    sizeBytes: 50 * 1024 * 1024,
    declaredDurationSec: 5400,
    fingerprint: 'a'.repeat(64),
  };

  it('accepts a valid request and sanitizes the file name', () => {
    const parsed = parseUploadRequest(valid);
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.ok(!parsed.value.fileName.includes('/'));
    assert.ok(!sanitizeFileName('a/b\\c.mp4').includes('/'));
  });

  it('rejects unsupported purposes, types, sizes, durations and fingerprints', () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ purpose: 'avatar' }, 'purpose'],
      [{ jobId: '../x' }, 'job'],
      [{ contentType: 'video/webm' }, 'content_type'],
      [{ sizeBytes: 10 }, 'too_small'],
      [{ sizeBytes: UPLOAD_LIMITS.maxBytes + 1 }, 'too_large'],
      [{ declaredDurationSec: UPLOAD_LIMITS.maxDurationSec + 1 }, 'duration'],
      [{ fingerprint: 'xyz' }, 'fingerprint'],
    ];
    for (const [patch, error] of cases) {
      const parsed = parseUploadRequest({ ...valid, ...patch });
      assert.equal(parsed.ok, false, JSON.stringify(patch));
      if (!parsed.ok) assert.equal(parsed.error, error);
    }
  });

  it('round-trips quarantine paths and only matches the exact layout', () => {
    const path = quarantinePath('user1', 'up1');
    assert.equal(path, 'quarantine/user1/up1/source');
    assert.deepEqual(parseQuarantinePath(path), { uid: 'user1', uploadId: 'up1' });
    assert.equal(parseQuarantinePath('quarantine/user1/up1/other'), null);
    assert.equal(parseQuarantinePath('profiles/user1/x'), null);
    assert.equal(matchFootagePath('user1', 'job1'), 'profiles/user1/matchFootage/job1/video.mp4');
  });

  it('marks uploads abandoned after the retention window', () => {
    const now = new Date('2026-10-10T00:00:00.000Z');
    assert.equal(isAbandoned('2026-10-01T00:00:00.000Z', now), true);
    assert.equal(isAbandoned('2026-10-08T00:00:00.000Z', now), false);
  });
});

describe('client upload parsing', () => {
  it('only restores well-formed pending uploads with https session URIs', () => {
    const good = {
      uploadId: 'u1',
      sessionUri: 'https://storage.googleapis.com/upload?upload_id=1',
      fileUri: 'file:///video.mp4',
      sizeBytes: 100,
      jobId: 'job_1',
      chunkBytes: 8,
    };
    const restored = parsePendingUploads(JSON.stringify([good, { ...good, sessionUri: 'http://evil' }, { uploadId: 1 }]));
    assert.equal(restored.length, 1);
    assert.deepEqual(parsePendingUploads('not json'), []);
    assert.deepEqual(parsePendingUploads(null), []);
  });

  it('parses server upload records and ignores unknown states', () => {
    assert.deepEqual(parseServerUploadRecord('u1', { state: 'ready', jobId: 'j' }), {
      uploadId: 'u1',
      state: 'ready',
      jobId: 'j',
      rejectionReason: null,
    });
    assert.equal(parseServerUploadRecord('u1', { state: 'virus_free' }), null);
  });

  it('maps server reason codes and transport failures to user-facing errors', () => {
    const callable = (code: string, reason?: string) =>
      Object.assign(new Error('x'), { code: `functions/${code}`, details: reason ? { reason } : undefined });
    assert.equal(uploadErrorCodeFor(callable('failed-precondition', 'consent_required')), 'consent_required');
    assert.equal(uploadErrorCodeFor(callable('invalid-argument', 'duration')), 'too_long');
    assert.equal(uploadErrorCodeFor(callable('invalid-argument', 'content_type')), 'unsupported_type');
    assert.equal(uploadErrorCodeFor(callable('resource-exhausted', 'limit_reached')), 'limit_reached');
    assert.equal(uploadErrorCodeFor(callable('permission-denied')), 'not_allowed');
    assert.equal(uploadErrorCodeFor(new UploadSessionExpiredError()), 'session_expired');
    assert.equal(uploadErrorCodeFor(new TypeError('Network request failed')), 'offline');
    assert.equal(uploadErrorCodeFor('weird'), 'unknown');
  });
});
