/** Validates the recorded worker output with the real server parser and writes it for the preview. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseDiscoveryMoments, parseTrackingReport } from '../../functions/src/analysis/trackingV3.ts';

type Fixture = { report?: unknown; timeline?: { states: string[]; times: number[] }; moments?: { start: number }[] };

function fixture(name: string): Fixture {
  const url = new URL(`../../tests/fixtures/${name}`, import.meta.url);
  try {
    return JSON.parse(readFileSync(url, 'utf8'));
  } catch (error) {
    throw new Error(`review-preview: cannot read committed fixture tests/fixtures/${name} (${(error as Error).message})`);
  }
}

const out: Record<string, unknown> = {};
for (const name of ['auto', 'answers']) {
  const raw = fixture(`tracking40-img4809-${name}.json`);
  const report = parseTrackingReport(raw.report, raw.timeline);
  if (!report) throw new Error(`fixture ${name} failed server validation`);
  out[name] = report;
}
// 5.0 engine output (7 discovery sightings attached, off-ball sequences), validated the same way.
for (const name of ['auto', 'answers']) {
  const raw = fixture(`tracking50-img4809-${name}.json`);
  const report = parseTrackingReport(raw.report, raw.timeline);
  if (!report) throw new Error(`5.0 fixture ${name} failed server validation`);
  out[`${name}50`] = report;
}
// 4.1 discovery sightings recorded on IMG_4809 (images removed), validated per 600 s chunk.
const disc = fixture('tracking41-img4809-discovery.json');
const discovery = [];
for (let a = 0; a < 2035; a += 600) {
  const chunk = { startSec: a, endSec: Math.min(2035, a + 600) };
  const parsed = parseDiscoveryMoments((disc.moments ?? []).filter((m: { start: number }) => m.start >= chunk.startSec && m.start < chunk.endSec),
    chunk, 2035, '20');
  if (!parsed) throw new Error('discovery fixture failed server validation');
  discovery.push(...parsed);
}
out.discovery = discovery;
mkdirSync(new URL('./.generated/', import.meta.url), { recursive: true });
writeFileSync(new URL('./.generated/reports.json', import.meta.url), JSON.stringify(out));
console.log('preview reports validated');
