/** Validates the recorded worker output with the real server parser and writes it for the preview. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseDiscoveryMoments, parseTrackingReport } from '../../functions/src/analysis/trackingV3.ts';

const out: Record<string, unknown> = {};
for (const name of ['auto', 'answers']) {
  const raw = JSON.parse(readFileSync(new URL(`../../tests/fixtures/tracking40-img4809-${name}.json`, import.meta.url), 'utf8'));
  const report = parseTrackingReport(raw.report, raw.timeline);
  if (!report) throw new Error(`fixture ${name} failed server validation`);
  out[name] = report;
}
// 4.1 discovery sightings recorded on IMG_4809 (images removed), validated per 600 s chunk.
const disc = JSON.parse(readFileSync(new URL('../../tests/fixtures/tracking41-img4809-discovery.json', import.meta.url), 'utf8'));
const discovery = [];
for (let a = 0; a < 2035; a += 600) {
  const chunk = { startSec: a, endSec: Math.min(2035, a + 600) };
  const parsed = parseDiscoveryMoments(disc.moments.filter((m: { start: number }) => m.start >= chunk.startSec && m.start < chunk.endSec),
    chunk, 2035, '20');
  if (!parsed) throw new Error('discovery fixture failed server validation');
  discovery.push(...parsed);
}
out.discovery = discovery;
mkdirSync(new URL('./.generated/', import.meta.url), { recursive: true });
writeFileSync(new URL('./.generated/reports.json', import.meta.url), JSON.stringify(out));
console.log('preview reports validated');
