import {
  bytesPerSecond,
  chunkLength,
  contentRangeHeader,
  nextOffsetFromRange,
  offsetQueryHeader,
  stableEtaSeconds,
  type SpeedSample,
} from './chunkPlan';
import { crc32cToBase64, crc32cUpdate } from './crc32c';

/** Random-access byte source; implementations read only the requested slice into memory. */
export type ChunkSource = {
  size: number;
  read(offset: number, length: number): Promise<ArrayBuffer>;
  close(): void;
};

export type UploadProgress = {
  sentBytes: number;
  totalBytes: number;
  bytesPerSecond: number | null;
  etaSeconds: number | null;
};

export type SessionUploadOutcome = 'complete' | 'paused' | 'cancelled';

/** CRC32C of the first `offset` bytes of the source (bytes GCS has confirmed as committed). */
export type CommittedChecksum = { offset: number; crc32c: number };

export type UploadIntegrityOptions = {
  /** Restored from the resume record so a resumed upload re-reads only bytes not yet folded in. */
  initial?: CommittedChecksum | null;
  onCommitted?: (state: CommittedChecksum) => Promise<void> | void;
  /**
   * Called with the whole-file CRC32C (GCS base64 form) before the final chunk is sent, so the
   * server can compare it with the CRC32C that Cloud Storage computes for the stored object.
   */
  declareFinal: (crc32cBase64: string) => Promise<void>;
};

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: ArrayBuffer },
) => Promise<{ status: number; headers: { get(name: string): string | null } }>;

export class UploadSessionExpiredError extends Error {
  constructor() {
    super('The upload session is no longer valid.');
    this.name = 'UploadSessionExpiredError';
  }
}

export class UploadHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Upload request failed with HTTP ${status}.`);
    this.name = 'UploadHttpError';
    this.status = status;
  }
}

const isRetryableStatus = (status: number) => status === 408 || status === 429 || status >= 500;

export type ResumableSessionUploaderOptions = {
  sessionUri: string;
  source: ChunkSource;
  chunkBytes: number;
  onProgress?: (progress: UploadProgress) => void;
  integrity?: UploadIntegrityOptions;
  fetchImpl?: FetchLike;
  maxConsecutiveFailures?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

/**
 * Drives a GCS resumable session: PUTs fixed-size slices, follows 308 Range replies,
 * and re-queries the committed offset after any interruption.
 */
export class ResumableSessionUploader {
  private pauseRequested = false;
  private cancelRequested = false;
  private samples: SpeedSample[] = [];
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly options: ResumableSessionUploaderOptions;

  constructor(options: ResumableSessionUploaderOptions) {
    this.options = options;
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
  }

  pause(): void {
    this.pauseRequested = true;
  }

  cancel(): void {
    this.cancelRequested = true;
  }

  /** Returns the next byte GCS expects, or the total size when the object is complete. */
  async queryOffset(): Promise<number> {
    const total = this.options.source.size;
    const response = await this.fetchImpl(this.options.sessionUri, {
      method: 'PUT',
      headers: { 'Content-Range': offsetQueryHeader(total) },
    });
    if (response.status === 200 || response.status === 201) return total;
    if (response.status === 308) return nextOffsetFromRange(response.headers.get('Range'));
    if (response.status === 404 || response.status === 410) throw new UploadSessionExpiredError();
    throw new UploadHttpError(response.status);
  }

  /** `knownOffset` skips the initial offset query for a session that was just created. */
  async run(knownOffset?: number): Promise<SessionUploadOutcome> {
    const { source, chunkBytes } = this.options;
    const total = source.size;
    let offset = knownOffset ?? (await this.withRetries(() => this.queryOffset()));
    if (offset < total) await this.foldCommitted(offset);
    this.emit(offset, total);

    while (offset < total) {
      if (this.cancelRequested) return 'cancelled';
      if (this.pauseRequested) return 'paused';
      offset = await this.putWithRetries(offset, total, chunkBytes);
      if (offset < total) await this.foldCommitted(offset);
      this.emit(offset, total);
    }
    return 'complete';
  }

  private committed: CommittedChecksum = { offset: 0, crc32c: 0 };
  private checksumRestored = false;
  private lastChunk: { offset: number; bytes: Uint8Array } | null = null;

  /** Advances the running CRC32C to `target`, reusing the chunk just sent or reading from disk. */
  private async foldCommitted(target: number): Promise<void> {
    const integrity = this.options.integrity;
    if (!integrity) return;
    if (!this.checksumRestored) {
      this.checksumRestored = true;
      const initial = integrity.initial;
      if (initial && initial.offset <= target) this.committed = { ...initial };
    }
    if (this.committed.offset > target) this.committed = { offset: 0, crc32c: 0 };
    if (this.committed.offset === target) return;

    let { offset, crc32c } = this.committed;
    const chunk = this.lastChunk;
    if (chunk && chunk.offset === offset && offset + chunk.bytes.length >= target) {
      crc32c = crc32cUpdate(crc32c, chunk.bytes.subarray(0, target - offset));
      offset = target;
    }
    while (offset < target) {
      const length = Math.min(this.options.chunkBytes, target - offset);
      crc32c = crc32cUpdate(crc32c, new Uint8Array(await this.options.source.read(offset, length)));
      offset += length;
    }
    this.committed = { offset, crc32c };
    await integrity.onCommitted?.(this.committed);
  }

  private async putChunk(offset: number, total: number, chunkBytes: number): Promise<number> {
    const length = chunkLength(offset, total, chunkBytes);
    const body = await this.options.source.read(offset, length);
    const bytes = new Uint8Array(body);
    this.lastChunk = { offset, bytes };
    const integrity = this.options.integrity;
    if (integrity && offset + length === total) {
      await this.foldCommitted(offset);
      await integrity.declareFinal(crc32cToBase64(crc32cUpdate(this.committed.crc32c, bytes)));
    }
    const response = await this.fetchImpl(this.options.sessionUri, {
      method: 'PUT',
      headers: { 'Content-Range': contentRangeHeader(offset, length, total) },
      body,
    });
    if (response.status === 200 || response.status === 201) return total;
    if (response.status === 308) return nextOffsetFromRange(response.headers.get('Range'));
    if (response.status === 404 || response.status === 410) throw new UploadSessionExpiredError();
    throw new UploadHttpError(response.status);
  }

  private isTransient(error: unknown): boolean {
    return !(error instanceof UploadSessionExpiredError)
      && (!(error instanceof UploadHttpError) || isRetryableStatus(error.status));
  }

  private backoffMs(failures: number): number {
    return Math.min(30_000, 500 * 2 ** (failures - 1));
  }

  /**
   * Sends one chunk; after a transient failure re-queries the committed offset. Failures only
   * reset when the server confirms progress, so a persistent error cannot loop forever.
   */
  private async putWithRetries(startOffset: number, total: number, chunkBytes: number): Promise<number> {
    const maxFailures = this.options.maxConsecutiveFailures ?? 6;
    let failures = 0;
    for (;;) {
      try {
        return await this.putChunk(startOffset, total, chunkBytes);
      } catch (error) {
        failures += 1;
        if (!this.isTransient(error) || failures >= maxFailures || this.cancelRequested) throw error;
        await this.sleep(this.backoffMs(failures));
        const committed = await this.withRetries(() => this.queryOffset());
        if (committed !== startOffset) return committed;
      }
    }
  }

  /** Retries transient failures with backoff. */
  private async withRetries(attempt: () => Promise<number>): Promise<number> {
    const maxFailures = this.options.maxConsecutiveFailures ?? 6;
    let failures = 0;
    for (;;) {
      try {
        return await attempt();
      } catch (error) {
        failures += 1;
        if (!this.isTransient(error) || failures >= maxFailures || this.cancelRequested) throw error;
        await this.sleep(this.backoffMs(failures));
      }
    }
  }

  private emit(sentBytes: number, totalBytes: number): void {
    const atMs = this.now();
    this.samples = [...this.samples.filter((sample) => atMs - sample.atMs <= 15_000), { atMs, sentBytes }];
    this.options.onProgress?.({
      sentBytes,
      totalBytes,
      bytesPerSecond: bytesPerSecond(this.samples, atMs),
      etaSeconds: stableEtaSeconds(this.samples, atMs, totalBytes - sentBytes),
    });
  }
}
