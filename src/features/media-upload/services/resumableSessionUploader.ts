import {
  bytesPerSecond,
  chunkLength,
  contentRangeHeader,
  etaSeconds,
  nextOffsetFromRange,
  offsetQueryHeader,
  type SpeedSample,
} from './chunkPlan';

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
    this.emit(offset, total);

    while (offset < total) {
      if (this.cancelRequested) return 'cancelled';
      if (this.pauseRequested) return 'paused';
      const startOffset = offset;
      offset = await this.withRetries(
        () => this.putChunk(startOffset, total, chunkBytes),
        () => this.queryOffset(),
      );
      this.emit(offset, total);
    }
    return 'complete';
  }

  private async putChunk(offset: number, total: number, chunkBytes: number): Promise<number> {
    const length = chunkLength(offset, total, chunkBytes);
    const body = await this.options.source.read(offset, length);
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

  /** Retries transient failures with backoff; `resync` recovers the committed offset after a failed PUT. */
  private async withRetries(attempt: () => Promise<number>, resync?: () => Promise<number>): Promise<number> {
    const maxFailures = this.options.maxConsecutiveFailures ?? 6;
    let failures = 0;
    let next = attempt;
    for (;;) {
      try {
        return await next();
      } catch (error) {
        const transient = !(error instanceof UploadSessionExpiredError)
          && (!(error instanceof UploadHttpError) || isRetryableStatus(error.status));
        failures += 1;
        if (!transient || failures >= maxFailures || this.cancelRequested) throw error;
        await this.sleep(Math.min(30_000, 500 * 2 ** (failures - 1)));
        if (resync) next = resync;
      }
    }
  }

  private emit(sentBytes: number, totalBytes: number): void {
    const atMs = this.now();
    this.samples = [...this.samples.filter((sample) => atMs - sample.atMs <= 15_000), { atMs, sentBytes }];
    const rate = bytesPerSecond(this.samples, atMs);
    this.options.onProgress?.({
      sentBytes,
      totalBytes,
      bytesPerSecond: rate,
      etaSeconds: etaSeconds(totalBytes - sentBytes, rate),
    });
  }
}
