/**
 * CRC32C (Castagnoli, reflected polynomial 0x82F63B78) as used by Google Cloud Storage object
 * metadata. Slicing-by-8 tables keep a multi-GB pass practical. (Same algorithm as the app copy
 * in src/features/media-upload/services/crc32c.ts; functions cannot import app sources.)
 */
const POLY = 0x82f63b78;

function buildTables(): Uint32Array[] {
  const tables = Array.from({ length: 8 }, () => new Uint32Array(256));
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? (c >>> 1) ^ POLY : c >>> 1;
    tables[0][n] = c >>> 0;
  }
  for (let n = 0; n < 256; n += 1) {
    let c = tables[0][n];
    for (let t = 1; t < 8; t += 1) {
      c = tables[0][c & 0xff] ^ (c >>> 8);
      tables[t][n] = c >>> 0;
    }
  }
  return tables;
}

const [T0, T1, T2, T3, T4, T5, T6, T7] = buildTables();

/**
 * Extends `crc` (the finished CRC32C of the preceding bytes, 0 for none) with `bytes`, so
 * `crc32c(a ++ b) === crc32cUpdate(crc32cUpdate(0, a), b)`.
 */
export function crc32cUpdate(crc: number, bytes: Uint8Array): number {
  let c = ~crc >>> 0;
  let i = 0;
  const length = bytes.length;
  const aligned = length - (length % 8);
  while (i < aligned) {
    const lo = (c ^ (bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24))) >>> 0;
    c =
      T7[lo & 0xff]
      ^ T6[(lo >>> 8) & 0xff]
      ^ T5[(lo >>> 16) & 0xff]
      ^ T4[lo >>> 24]
      ^ T3[bytes[i + 4]]
      ^ T2[bytes[i + 5]]
      ^ T1[bytes[i + 6]]
      ^ T0[bytes[i + 7]];
    i += 8;
  }
  while (i < length) {
    c = T0[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    i += 1;
  }
  return ~c >>> 0;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** GCS form: base64 of the big-endian 32-bit value (e.g. `crc32c` metadata, `X-Goog-Hash`). */
export function crc32cToBase64(crc: number): string {
  const b = [(crc >>> 24) & 0xff, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff];
  return (
    BASE64[b[0] >> 2]
    + BASE64[((b[0] & 3) << 4) | (b[1] >> 4)]
    + BASE64[((b[1] & 15) << 2) | (b[2] >> 6)]
    + BASE64[b[2] & 63]
    + BASE64[b[3] >> 2]
    + BASE64[(b[3] & 3) << 4]
    + '=='
  );
}
