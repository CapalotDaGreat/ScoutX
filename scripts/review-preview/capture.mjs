#!/usr/bin/env node
/**
 * Builds the Match Review preview (scripts/review-preview/PreviewApp.tsx) as a static web export
 * and captures phone-sized screenshots of each state with Playwright.
 *
 *   node scripts/review-preview/capture.mjs <outDir> [excerpt.mp4]
 *
 * package.json "main" is pointed at the preview entry only for the duration of the export and is
 * always restored. Nothing here is shipped in the app.
 */
import { execSync, spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const outDir = resolve(process.argv[2] ?? 'review-preview-shots');
const excerpt = process.argv[3];
const dist = resolve('.review-preview-dist');
const pkgPath = resolve('package.json');
const original = readFileSync(pkgPath, 'utf8');

if (process.env.SKIP_EXPORT !== '1') {
execSync('node --import ./tests/unit/support/register.mjs scripts/review-preview/prepare.ts', { stdio: 'inherit' });
try {
  writeFileSync(pkgPath, original.replace('"main": "index.ts"', '"main": "scripts/review-preview/index.ts"'));
  execSync(`npx expo export --platform web --output-dir ${dist} --clear`, { stdio: 'inherit', env: { ...process.env, EXPO_OFFLINE: '1', CI: '1' } });
} finally {
  writeFileSync(pkgPath, original);
}
}
if (excerpt) copyFileSync(excerpt, join(dist, 'excerpt.mp4'));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp4': 'video/mp4',
  '.ttf': 'font/ttf', '.png': 'image/png', '.ico': 'image/x-icon' };
/** Static server with HTTP Range support (needed for video seeking). */
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  let file = join(dist, decodeURIComponent(url.pathname));
  try { if (statSync(file).isDirectory()) file = join(file, 'index.html'); } catch { file = join(dist, 'index.html'); }
  let size;
  try { size = statSync(file).size; } catch { res.writeHead(404).end(); return; }
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Number(range[2]) : size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(8123, r));

const { chromium } = await import('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text().slice(0, 500)); });
page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 800)));
mkdirSync(outDir, { recursive: true });
const shots = [
  ['01-workspace', 'workspace'], ['02-early-results', 'early'], ['03-review-simple', 'review'], ['04-review-auto', 'review-auto'],
  ['05-review-detailed', 'detailed'], ['06-scout-view', 'scout'], ['07-coach-illustrative', 'coach'], ['08-interrupted', 'interrupted'],
  ['09-review-de', 'review&lang=de'], ['10-early-es', 'early&lang=es'],
];
for (const [name, hash] of shots) {
  await page.goto(`http://localhost:8123/#${hash}`);
  await page.reload();
  await page.waitForSelector('[data-testid="preview-root"]', { timeout: 60_000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: true });
}
// Ask PitchProof: one supported and one unsupported question.
await page.goto('http://localhost:8123/#review-auto');
await page.reload();
await page.waitForSelector('[data-testid="ask-input"]', { timeout: 60_000 });
await page.fill('[data-testid="ask-input"]', 'How many km did I run?');
await page.click('[data-testid="ask-send"]');
await page.waitForTimeout(500);
await page.locator('[data-testid="review-ask"]').screenshot({ path: join(outDir, '11-ask-km.png') });
await page.fill('[data-testid="ask-input"]', 'How sure are you it was me?');
await page.click('[data-testid="ask-send"]');
await page.waitForTimeout(500);
await page.locator('[data-testid="review-ask"]').screenshot({ path: join(outDir, '12-ask-identity.png') });
if (excerpt) {
  await page.goto('http://localhost:8123/#player');
  await page.reload();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: join(outDir, '13-moment-player.png'), fullPage: false });
}
await browser.close();
server.close();
console.log(`screenshots in ${outDir}`);
void spawn;
