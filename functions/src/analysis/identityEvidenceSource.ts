import { createHash } from 'node:crypto';
import { addAbortSignal } from 'node:stream';
import { getStorage } from 'firebase-admin/storage';

export type SourceVersion = { generation: string; sizeBytes: number };
export type SourceWitness = SourceVersion & { sha256: string };
export interface RetainedSourceVerifier {
  version(path: string): Promise<SourceVersion>;
  verify(path: string, checkpoint?: () => Promise<void>): Promise<SourceWitness>;
}
const MAX_SOURCE_BYTES = 4 * 1024 * 1024 * 1024;

function ownedVideo(path: string): void {
  if (!/^profiles\/[^/]+\/matchFootage\/[A-Za-z0-9_-]{6,80}\/video\.mp4$/.test(path)) throw new Error('Invalid retained source');
}

export const retainedSourceVerifier: RetainedSourceVerifier = {
  async version(path) {
    ownedVideo(path);
    const [metadata] = await getStorage().bucket().file(path).getMetadata();
    const generation = String(metadata.generation ?? '');
    const sizeBytes = Number(metadata.size);
    if (!/^[0-9]{1,32}$/.test(generation) || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_SOURCE_BYTES) {
      throw new Error('Invalid retained source version');
    }
    return { generation, sizeBytes };
  },
  async verify(path, checkpoint) {
    const before = await this.version(path);
    const stream = getStorage().bucket().file(path, { generation: before.generation }).createReadStream({ validation: true });
    addAbortSignal(AbortSignal.timeout(8 * 60 * 1000), stream);
    const hash = createHash('sha256');
    let bytes = 0;
    let checkedAt = Date.now();
    try {
      for await (const chunk of stream) {
        const data: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        bytes += data.byteLength;
        if (bytes > before.sizeBytes || bytes > MAX_SOURCE_BYTES) throw new Error('Source exceeds declared size');
        hash.update(data);
        if (checkpoint && Date.now() - checkedAt >= 5000) {
          await checkpoint();
          checkedAt = Date.now();
        }
      }
    } finally { stream.destroy(); }
    const after = await this.version(path);
    if (bytes !== before.sizeBytes || after.generation !== before.generation || after.sizeBytes !== before.sizeBytes) {
      throw new Error('Retained source changed');
    }
    return { ...before, sha256: hash.digest('hex') };
  },
};

/** Only local demo tests may replace storage reads; production always uses GCS. */
export function sourceVerifierFor(testVerifier?: RetainedSourceVerifier): RetainedSourceVerifier {
  const emulated = process.env.FUNCTIONS_EMULATOR === 'true' || Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  return emulated && testVerifier ? testVerifier : retainedSourceVerifier;
}

export function parseSourceWitness(value: unknown): SourceWitness | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.generation !== 'string' || !/^[0-9]{1,32}$/.test(input.generation)
    || typeof input.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.sha256)
    || typeof input.sizeBytes !== 'number' || !Number.isSafeInteger(input.sizeBytes)
    || input.sizeBytes <= 0 || input.sizeBytes > MAX_SOURCE_BYTES) return null;
  return { generation: input.generation, sizeBytes: input.sizeBytes, sha256: input.sha256 };
}
