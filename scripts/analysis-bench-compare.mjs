#!/usr/bin/env node
// Before/after table from two analysis-bench JSON files, with worker seconds and cost ESTIMATED from the one recorded
// L4 run in docs/video/intelligence-5.3-gpu-benchmark-report.md (discovery 507.753 s over 4 chunks, extraction 1051.349 s
// over 8 segments, one full resolve 218.069 s, VM $0.9273387923/h). Per-call seconds are averages of that single run, a
// failed attempt is charged as a whole call (upper bound) and a preliminary resolve is charged as a full one (upper bound).
//   node scripts/analysis-bench-compare.mjs before.json after.json
import { readFileSync } from 'node:fs';

const REC = { discover: 507.753 / 4, extract: 1051.349 / 8, resolve: 218.069, usdPerSec: 0.9273387923 / 3600 };
const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) { console.error('usage: analysis-bench-compare.mjs before.json after.json'); process.exit(2); }
const before = JSON.parse(readFileSync(beforePath, 'utf8'));
const after = JSON.parse(readFileSync(afterPath, 'utf8'));
const scenarioIds = (run) => run.scenarios.map((s) => s.id).sort();
const idsBefore = scenarioIds(before); const idsAfter = scenarioIds(after);
if (before.schema !== after.schema || before.fixture !== after.fixture || before.segments !== after.segments
  || JSON.stringify(idsBefore) !== JSON.stringify(idsAfter)
  || new Set(idsBefore).size !== idsBefore.length || new Set(idsAfter).size !== idsAfter.length) {
  throw new Error('Benchmark runs must use the same schema, fixture, segment count and unique scenarios.');
}
const seconds = (w) => w.discover * REC.discover + w.extract * REC.extract + w.resolve * REC.resolve;
const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const rows = [['scenario', 'worker calls (d/e/r)', 'est. worker s', 'est. USD', 'publishes', 'img writes', 'fs reads', 'calls@first report', 'calls@last publish', 'same report']];
for (const a of after.scenarios) {
  const b = before.scenarios.find((s) => s.id === a.id);
  if (!b) continue;
  const w = (x) => `${x.counts.workerRequests.discover}/${x.counts.workerRequests.extract}/${x.counts.workerRequests.resolve}`;
  const sb = seconds(b.counts.workerRequests); const sa = seconds(a.counts.workerRequests);
  const pair = (x, y) => (x === y ? String(x) : `${x} -> ${y}`);
  const usd = (s) => (s * REC.usdPerSec).toFixed(3);
  rows.push([a.id, pair(w(b), w(a)), pair(fmt(sb), fmt(sa)), pair(usd(sb), usd(sa)), pair(b.counts.publishes, a.counts.publishes),
    pair(b.counts.imageWrites, a.counts.imageWrites), pair(b.counts.firestoreReads, a.counts.firestoreReads),
    pair(b.counts.workerCallsBeforeFirstReport, a.counts.workerCallsBeforeFirstReport),
    pair(b.counts.workerCallsAtLastPublish, a.counts.workerCallsAtLastPublish),
    b.published?.reportSha256 && a.published?.reportSha256
      ? String(b.published.reportSha256 === a.published.reportSha256) : 'unavailable']);
}
for (const r of rows) console.log(`| ${r.join(' | ')} |`);
console.log(`\nbefore=${before.revision} after=${after.revision}; samples per scenario: ${after.scenarios[0]?.samples}`);
console.log('Estimates only: single recorded L4 run, whole-call charging for failed attempts, preliminary resolve charged as full.');
