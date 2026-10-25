import { createServer } from 'node:http';
import { once } from 'node:events';
import { ResumableSessionUploader } from '../src/features/media-upload/services/resumableSessionUploader.ts';
import { crc32cUpdate, crc32cToBase64 } from '../src/features/media-upload/services/crc32c.ts';

// A local protocol benchmark, not a physical-device/network or cloud service benchmark.
const total = 64 * 1024 * 1024;
let committed = 0;
let crc = 0;
let declared = null;
let puts = 0;
const server = createServer((request, response) => {
  const range = request.headers['content-range'];
  if (range === `bytes */${total}`) {
    response.writeHead(committed === total ? 200 : 308, committed ? { Range: `bytes=0-${committed - 1}` } : {}).end();
    return;
  }
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range ?? '');
  if (!match || Number(match[1]) !== committed || Number(match[3]) !== total) {
    response.writeHead(400).end(); return;
  }
  puts++;
  let length = 0;
  request.on('data', (chunk) => { length += chunk.length; crc = crc32cUpdate(crc, chunk); });
  request.on('end', () => {
    if (length !== Number(match[2]) - Number(match[1]) + 1) { response.writeHead(400).end(); return; }
    committed += length;
    if (committed === total && crc32cToBase64(crc) !== declared) { response.writeHead(422).end(); return; }
    response.writeHead(committed === total ? 200 : 308, { Range: `bytes=0-${committed - 1}` }).end();
  });
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const results = [];
try {
  for (const chunkBytes of [256 * 1024, 1024 * 1024, 4 * 1024 * 1024, 8 * 1024 * 1024]) {
    committed = 0; crc = 0; declared = null; puts = 0;
    let maxReadBytes = 0;
    const started = performance.now();
    const uploader = new ResumableSessionUploader({
      sessionUri: `http://127.0.0.1:${server.address().port}/session`, chunkBytes,
      source: {
        size: total,
        async read(offset, length) {
          maxReadBytes = Math.max(maxReadBytes, length);
          const bytes = new Uint8Array(length);
          bytes.fill((offset / (256 * 1024)) % 251);
          return bytes.buffer;
        },
        close() {},
      },
      integrity: { async declareFinal(value) { declared = value; } },
    });
    const outcome = await uploader.run(0);
    const seconds = (performance.now() - started) / 1000;
    if (outcome !== 'complete' || committed !== total) throw new Error('Incomplete benchmark transfer');
    results.push({ chunkBytes, bytes: total, puts, seconds, throughputMiBps: total / 1024 ** 2 / seconds, maxReadBytes, crc32cVerified: true });
  }
} finally {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
process.stdout.write(JSON.stringify({ measuredAt: new Date().toISOString(), runtime: process.version, platform: process.platform, scope: 'Node loopback HTTP, synthetic generated chunks, client/server CRC32C; not device/Wi-Fi/GCS performance', results }, null, 2) + '\n');
