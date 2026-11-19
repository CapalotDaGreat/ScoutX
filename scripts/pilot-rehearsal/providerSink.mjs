#!/usr/bin/env node
/**
 * Records any request that would have gone to the AI provider (OPENROUTER_BASE_URL points here during the
 * rehearsal) and answers 503, so nothing is ever forwarded. GET /_sink/log lists what arrived (method, path,
 * body size only - bodies are not stored).
 */
import http from 'node:http';

const PORT = Number(process.env.PROVIDER_SINK_PORT ?? 8791);
const log = [];
http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/_sink/log') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(log));
  }
  let size = 0;
  req.on('data', (c) => { size += c.length; });
  req.on('end', () => {
    log.push({ at: new Date().toISOString(), method: req.method, path: req.url, bytes: size });
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end('{"error":"rehearsal sink"}');
  });
}).listen(PORT, '127.0.0.1', () => console.log(`provider sink on 127.0.0.1:${PORT}`));
