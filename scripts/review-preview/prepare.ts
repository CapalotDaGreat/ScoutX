/** Validates the recorded worker output with the real server parser and writes it for the preview. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseTrackingReport } from '../../functions/src/analysis/trackingV3.ts';

const out: Record<string, unknown> = {};
for (const name of ['auto', 'answers']) {
  const raw = JSON.parse(readFileSync(new URL(`../../tests/fixtures/tracking40-img4809-${name}.json`, import.meta.url), 'utf8'));
  const report = parseTrackingReport(raw.report, raw.timeline);
  if (!report) throw new Error(`fixture ${name} failed server validation`);
  out[name] = report;
}
mkdirSync(new URL('./.generated/', import.meta.url), { recursive: true });
writeFileSync(new URL('./.generated/reports.json', import.meta.url), JSON.stringify(out));
console.log('preview reports validated');
