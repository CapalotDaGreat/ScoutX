#!/usr/bin/env node
// Deterministic request/retry/duplicate-work benchmark for the match-analysis orchestration.
//   node --import ./tests/unit/support/register.mjs scripts/analysis-bench.mjs [--out file.json]
// Drives the real task code against an in-memory Firestore and recorded IMG_4809 worker output. It calls no
// network, provider or worker. See docs/video/analysis-cost-benchmark.md for what it does and does not measure.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

try {
  process.env.BENCH_REVISION ??= execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
    + (execFileSync('git', ['status', '--porcelain', '--', 'functions', 'tests/unit'], { encoding: 'utf8' }).trim() ? '+uncommitted' : '');
} catch {
  process.env.BENCH_REVISION ??= 'unknown';
}
const { runBenchmark } = await import('../tests/unit/support/analysisBench.ts');
// The real provider wrapper logs the stubbed usage probe. Keep stdout machine-readable JSON.
const stdoutWrite = process.stdout.write;
let result;
try {
  process.stdout.write = process.stderr.write.bind(process.stderr);
  result = await runBenchmark();
} finally { process.stdout.write = stdoutWrite; }
const json = `${JSON.stringify(result, null, 2)}\n`;
const out = process.argv.indexOf('--out');
if (out > -1 && process.argv[out + 1]) {
  writeFileSync(process.argv[out + 1], json);
  console.log(`wrote ${process.argv[out + 1]}`);
} else {
  process.stdout.write(json);
}
