import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { resolve, sep, extname } from 'node:path';

const root = resolve('public');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json' };
const server = createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method ?? '')) { response.writeHead(405).end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    if (pathname === '/') { response.writeHead(302, { Location: '/welcome/' }).end(); return; }
    let file = resolve(root, `.${pathname}`);
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    if (statSync(file).isDirectory()) file = resolve(file, 'index.html');
    const stats = statSync(file);
    if (!stats.isFile()) throw new Error('Not a file');
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Content-Length': stats.size, 'Cache-Control': 'no-store' });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).pipe(response);
  } catch { response.writeHead(404).end('Not found'); }
});
const port = Number(process.env.PITCHPROOF_PREVIEW_PORT ?? 8174);
server.listen(port, '127.0.0.1', () => console.log(`PitchProof local preview: http://127.0.0.1:${port}/welcome/`));
