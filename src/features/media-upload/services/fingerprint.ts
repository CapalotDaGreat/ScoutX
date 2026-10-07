import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { CHUNKED_UPLOAD } from './chunkPlan';
import { type ChunkSource } from './resumableSessionUploader';

/** Byte ranges hashed for duplicate detection: the head and tail of the file. */
export function fingerprintRanges(size: number, edgeBytes: number = CHUNKED_UPLOAD.fingerprintEdgeBytes) {
  const headLength = Math.min(edgeBytes, size);
  const tailLength = Math.min(edgeBytes, Math.max(0, size - headLength));
  return { head: { offset: 0, length: headLength }, tail: { offset: size - tailLength, length: tailLength } };
}

export function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * SHA-256 over the size plus the first and last 8 MiB. It identifies re-selections of the same
 * file for resume and dedupe; it is not an integrity proof of the full content.
 */
export async function computeUploadFingerprint(source: ChunkSource): Promise<string> {
  const { head, tail } = fingerprintRanges(source.size);
  const sizeBytes = new TextEncoder().encode(`${source.size}:`);
  const headBytes = new Uint8Array(await source.read(head.offset, head.length));
  const tailBytes = tail.length > 0 ? new Uint8Array(await source.read(tail.offset, tail.length)) : new Uint8Array(0);
  const combined = new Uint8Array(sizeBytes.length + headBytes.length + tailBytes.length);
  combined.set(sizeBytes, 0);
  combined.set(headBytes, sizeBytes.length);
  combined.set(tailBytes, sizeBytes.length + headBytes.length);
  return toHex(await digest(CryptoDigestAlgorithm.SHA256, combined));
}
