import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import { integrityVerdict, normalizeCrc32c, parseUploadRequest } from '../../functions/src/uploads/model.ts';
import { stableEtaSeconds } from '../../src/features/media-upload/services/chunkPlan.ts';
import { crc32cToBase64, crc32cUpdate } from '../../src/features/media-upload/services/crc32c.ts';
import {
  ResumableSessionUploader,
  type ChunkSource,
  type CommittedChecksum,
} from '../../src/features/media-upload/services/resumableSessionUploader.ts';
import {
  UPLOAD_COPY_MAX_AGE_MS,
  isSweepableCopy,
  uploadCopyCreatedAt,
  uploadCopyName,
} from '../../src/features/media-upload/services/uploadCopyNames.ts';
import {
  UPLOAD_REJECTION_REASONS,
  UploadFileChangedError,
  parsePendingUploads,
  uploadErrorCodeFor,
} from '../../src/features/media-upload/types.ts';

const KIB256 = 256 * 1024;

/** Bit-at-a-time reference implementation, independent of the table-driven one. */
function referenceCrc32c(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) crc = crc & 1 ? (crc >>> 1) ^ 0x82f63b78 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

describe('CRC32C', () => {
  it('matches the published check value and RFC 3720 test vectors', () => {
    assert.equal(crc32cUpdate(0, new TextEncoder().encode('123456789')), 0xe3069283);
    assert.equal(crc32cUpdate(0, new Uint8Array(32)), 0x8a9136aa);
    assert.equal(crc32cUpdate(0, new Uint8Array(32).fill(0xff)), 0x62a8ab43);
    assert.equal(crc32cUpdate(0, Uint8Array.from({ length: 32 }, (_, i) => i)), 0x46dd794e);
    assert.equal(crc32cUpdate(0, Uint8Array.from({ length: 32 }, (_, i) => 31 - i)), 0x113fdb5c);
    assert.equal(crc32cUpdate(0, new Uint8Array(0)), 0);
  });

  it('agrees with a bitwise reference for random lengths and is composable across chunks', () => {
    for (const length of [1, 7, 8, 9, 63, 1000, 4099]) {
      const bytes = randomBytes(length);
      assert.equal(crc32cUpdate(0, bytes), referenceCrc32c(bytes), `length ${length}`);
      const cut = Math.floor(length / 3);
      assert.equal(crc32cUpdate(crc32cUpdate(0, bytes.subarray(0, cut)), bytes.subarray(cut)), referenceCrc32c(bytes));
    }
  });

  it('encodes the GCS base64 big-endian form', () => {
    assert.equal(crc32cToBase64(0xe3069283), Buffer.from([0xe3, 0x06, 0x92, 0x83]).toString('base64'));
    for (const value of [0, 1, 0xffffffff, 0x12345678]) {
      const expected = Buffer.alloc(4);
      expected.writeUInt32BE(value);
      assert.equal(crc32cToBase64(value), expected.toString('base64'));
    }
  });
});

describe('server integrity verdict', () => {
  const declared = crc32cToBase64(0xe3069283);
  it('treats a client checksum as proof only when it equals the CRC32C Storage computed', () => {
    assert.equal(integrityVerdict('crc32c', declared, declared), 'verified');
    assert.equal(integrityVerdict('crc32c', declared, crc32cToBase64(1)), 'mismatch');
    assert.equal(integrityVerdict('crc32c', undefined, declared), 'missing_declaration');
    assert.equal(integrityVerdict('crc32c', 'not-a-crc', declared), 'missing_declaration');
    assert.equal(integrityVerdict('crc32c', declared, undefined), 'no_server_hash');
    assert.equal(integrityVerdict('none', declared, crc32cToBase64(1)), 'not_requested');
  });

  it('normalizes the emulator decimal form to the base64 form', () => {
    assert.equal(normalizeCrc32c(String(0xe3069283)), declared);
    assert.equal(normalizeCrc32c(declared), declared);
    assert.equal(normalizeCrc32c('99999999999'), null);
    assert.equal(normalizeCrc32c(42), null);
  });

  it('only switches on integrity when the client asks for it', () => {
    const base = {
      purpose: 'match_footage',
      jobId: 'match_123456_abc',
      fileName: 'm.mp4',
      contentType: 'video/mp4',
      sizeBytes: 4096,
      declaredDurationSec: 60,
      fingerprint: 'a'.repeat(64),
    };
    const on = parseUploadRequest({ ...base, integrity: 'crc32c' });
    const off = parseUploadRequest({ ...base, integrity: 'md5' });
    assert.ok(on.ok && on.value.integrity === 'crc32c');
    assert.ok(off.ok && off.value.integrity === 'none');
  });
});

class FakeSession {
  committed = 0;
  data: Buffer;
  finished = false;
  puts = 0;
  dropResponseOnPut = new Set<number>();
  readonly total: number;

  constructor(total: number) {
    this.total = total;
    this.data = Buffer.alloc(total);
  }

  fetch = async (_url: string, init: { headers: Record<string, string>; body?: ArrayBuffer }) => {
    if (!init.body) return this.finished ? this.reply(200) : this.reply308();
    this.puts += 1;
    const [, s, e] = /^bytes (\d+)-(\d+)\/\d+$/.exec(init.headers['Content-Range']) ?? [];
    const start = Number(s);
    const body = Buffer.from(init.body);
    if (start === this.committed) {
      const isFinal = Number(e) + 1 === this.total;
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

describe('uploader integrity', () => {
  it('declares the whole-file CRC32C before the final chunk and checkpoints committed offsets', async () => {
    const bytes = randomBytes(KIB256 * 3 + 123);
    const gcs = new FakeSession(bytes.length);
    const source = sourceOf(bytes);
    const declared: Array<{ crc: string; committedBefore: number }> = [];
    const checkpoints: CommittedChecksum[] = [];
    const uploader = new ResumableSessionUploader({
      sessionUri: 'https://storage.example/upload',
      source,
      chunkBytes: KIB256,
      fetchImpl: gcs.fetch,
      integrity: {
        onCommitted: (state) => {
          checkpoints.push(state);
        },
        declareFinal: async (crc) => {
          declared.push({ crc, committedBefore: gcs.committed });
        },
      },
    });
    assert.equal(await uploader.run(0), 'complete');
    assert.ok(gcs.data.equals(bytes));
    assert.deepEqual(declared, [{ crc: crc32cToBase64(referenceCrc32c(bytes)), committedBefore: KIB256 * 3 }]);
    assert.deepEqual(checkpoints.map((c) => c.offset), [KIB256, KIB256 * 2, KIB256 * 3]);
    for (const checkpoint of checkpoints) {
      assert.equal(checkpoint.crc32c, referenceCrc32c(bytes.subarray(0, checkpoint.offset)));
    }
    assert.equal(source.reads, 4, 'the checksum reuses each sent chunk instead of re-reading the file');
  });

  it('resumes from a stored checkpoint and folds in bytes committed while the response was lost', async () => {
    const bytes = randomBytes(KIB256 * 4 + 9);
    const gcs = new FakeSession(bytes.length);
    gcs.dropResponseOnPut.add(2);
    const first: ResumableSessionUploader = new ResumableSessionUploader({
      sessionUri: 'https://storage.example/upload',
      source: sourceOf(bytes),
      chunkBytes: KIB256,
      fetchImpl: gcs.fetch,
      sleep: async () => undefined,
      onProgress: (p) => {
        if (p.sentBytes >= KIB256 * 2) first.pause();
      },
      integrity: { declareFinal: async () => assert.fail('not final yet') },
    });
    assert.equal(await first.run(0), 'paused');

    // The app was killed after the first checkpoint was persisted; GCS already holds two chunks.
    const stored: CommittedChecksum = { offset: KIB256, crc32c: referenceCrc32c(bytes.subarray(0, KIB256)) };
    let finalCrc = '';
    const resumed = new ResumableSessionUploader({
      sessionUri: 'https://storage.example/upload',
      source: sourceOf(bytes),
      chunkBytes: KIB256,
      fetchImpl: gcs.fetch,
      integrity: {
        initial: stored,
        declareFinal: async (crc) => {
          finalCrc = crc;
        },
      },
    });
    assert.equal(await resumed.run(), 'complete');
    assert.ok(gcs.data.equals(bytes));
    assert.equal(finalCrc, crc32cToBase64(referenceCrc32c(bytes)));
  });

  it('a stale checkpoint beyond the committed offset is discarded and recomputed from disk', async () => {
    const bytes = randomBytes(KIB256 * 2 + 1);
    const gcs = new FakeSession(bytes.length);
    let finalCrc = '';
    const uploader = new ResumableSessionUploader({
      sessionUri: 'https://storage.example/upload',
      source: sourceOf(bytes),
      chunkBytes: KIB256,
      fetchImpl: gcs.fetch,
      integrity: {
        initial: { offset: KIB256 * 2, crc32c: 12345 },
        declareFinal: async (crc) => {
          finalCrc = crc;
        },
      },
    });
    assert.equal(await uploader.run(), 'complete');
    assert.equal(finalCrc, crc32cToBase64(referenceCrc32c(bytes)));
  });

  it('a refused declaration stops before the final bytes are sent', async () => {
    const bytes = randomBytes(KIB256 + 50);
    const gcs = new FakeSession(bytes.length);
    class Closed extends Error {}
    const uploader = new ResumableSessionUploader({
      sessionUri: 'https://storage.example/upload',
      source: sourceOf(bytes),
      chunkBytes: KIB256,
      fetchImpl: gcs.fetch,
      sleep: async () => undefined,
      maxConsecutiveFailures: 2,
      integrity: {
        declareFinal: async () => {
          throw new Closed('closed');
        },
      },
    });
    await assert.rejects(uploader.run(0), Closed);
    assert.equal(gcs.finished, false, 'the object is never finalized without a declared checksum');
  });
});

describe('ETA stability', () => {
  const steady = (count: number, stepMs: number, bytesPerStep: number) =>
    Array.from({ length: count }, (_, i) => ({ atMs: i * stepMs, sentBytes: i * bytesPerStep }));

  it('stays unknown until throughput has been observed long enough', () => {
    assert.equal(stableEtaSeconds(steady(2, 1000, 1_000_000), 1000, 10_000_000), null);
    assert.equal(stableEtaSeconds(steady(4, 1000, 1_000_000), 3000, 10_000_000), null, 'only 3 s observed');
    assert.equal(stableEtaSeconds(steady(7, 1000, 1_000_000), 6000, 10_000_000), 10);
  });

  it('withholds an estimate while the rate swings', () => {
    const samples = [
      { atMs: 0, sentBytes: 0 },
      { atMs: 2000, sentBytes: 200_000 },
      { atMs: 4000, sentBytes: 400_000 },
      { atMs: 6000, sentBytes: 8_400_000 },
    ];
    assert.equal(stableEtaSeconds(samples, 6000, 10_000_000), null);
  });
});

describe('resume records and copies', () => {
  it('keeps the fingerprint and a valid checksum checkpoint, dropping malformed checkpoints', () => {
    const base = {
      uploadId: 'u1',
      sessionUri: 'https://storage.googleapis.com/upload?upload_id=1',
      fileUri: 'file:///video.mp4',
      sizeBytes: 100,
      jobId: 'job_1',
      chunkBytes: 8,
      fingerprint: 'f'.repeat(64),
    };
    const [good, bad] = parsePendingUploads(JSON.stringify([
      { ...base, committedChecksum: { offset: 8, crc32c: 0xe3069283 } },
      { ...base, uploadId: 'u2', committedChecksum: { offset: -1, crc32c: 'x' } },
    ]));
    assert.deepEqual(good.committedChecksum, { offset: 8, crc32c: 0xe3069283 });
    assert.equal(good.fingerprint, 'f'.repeat(64));
    assert.equal(bad.committedChecksum, undefined);
  });

  it('maps a changed file and the new rejection reasons', () => {
    assert.equal(uploadErrorCodeFor(new UploadFileChangedError()), 'file_changed');
    for (const reason of ['integrity_mismatch', 'integrity_missing', 'consent_withdrawn']) {
      assert.ok((UPLOAD_REJECTION_REASONS as readonly string[]).includes(reason));
    }
  });

  it('names copies with their creation time and sweeps only unreferenced, expired copies', () => {
    const now = Date.UTC(2026, 9, 9);
    const name = uploadCopyName('job/../x', '.MOV', now);
    assert.equal(name, `job____x-${now}.mov`);
    assert.equal(uploadCopyCreatedAt(name), now);
    assert.equal(isSweepableCopy(name, false, now + UPLOAD_COPY_MAX_AGE_MS - 1), false);
    assert.equal(isSweepableCopy(name, false, now + UPLOAD_COPY_MAX_AGE_MS), true);
    assert.equal(isSweepableCopy(name, true, now + 10 * UPLOAD_COPY_MAX_AGE_MS), false, 'a paused upload keeps its copy');
    assert.equal(isSweepableCopy('IMG_0001.MOV', false, now + 10 * UPLOAD_COPY_MAX_AGE_MS), false, 'unknown files are left alone');
  });
});
