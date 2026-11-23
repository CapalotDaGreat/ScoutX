#!/usr/bin/env node
// Report-level evaluation of match-analysis output against human labels, with development and held-out kept apart.
//   node --import ./tests/unit/support/register.mjs scripts/analysis-eval.mjs --corpus <corpus.json> [--out file.json]
// corpus.json: { datasetId, clips: [{ clipId, split: "development"|"heldout", report: "<path>", answers?: "<path>",
//                scope?: "preliminary"|"full", timings?: { firstUsefulSec, fullSec }, labels?: "<path to ClipLabels json>" }] }
// Paths resolve relative to the corpus file. Clips without labels only get structural checks and never count as evidence.
// See docs/video/analysis-evaluation.md. No network, worker or provider is called.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const { adaptReport, scoreCorpus } = await import('../tests/unit/support/reportEval.ts');
const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : undefined; };
const corpusPath = arg('--corpus');
if (!corpusPath) { console.error('usage: analysis-eval.mjs --corpus corpus.json [--out result.json]'); process.exit(2); }
const read = (base, p) => JSON.parse(readFileSync(resolve(dirname(base), p), 'utf8'));
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));
const clips = corpus.clips.map((c) => {
  if (c.scope !== undefined && c.scope !== 'preliminary' && c.scope !== 'full') throw new Error(`invalid scope for ${c.clipId}`);
  const extra = { ...(c.timings ?? {}), ...(c.scope ? { scope: c.scope } : {}), ...(c.answers ? { answers: read(corpusPath, c.answers) } : {}) };
  return { clipId: c.clipId, split: c.split, labels: c.labels ? read(corpusPath, c.labels) : null,
    report: c.report ? adaptReport(read(corpusPath, c.report), extra) : null };
});
const thresholds = JSON.parse(readFileSync(new URL('../workers/football-cv/eval/thresholds.json', import.meta.url), 'utf8'));
const result = { datasetId: corpus.datasetId, thresholdStatus: thresholds.status, ...scoreCorpus(clips, thresholds) };
const json = `${JSON.stringify(result, null, 2)}\n`;
const out = arg('--out');
if (out) { writeFileSync(out, json); console.log(`wrote ${out}`); } else process.stdout.write(json);
