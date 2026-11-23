import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('offline benchmark stdout is parseable JSON even when the provider usage probe logs', () => {
  const output = execFileSync(process.execPath, ['--import', './tests/unit/support/register.mjs', 'scripts/analysis-bench.mjs'],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const run = JSON.parse(output);
  assert.equal(run.schema, 'pitchproof.analysis-bench.v1');
  assert.equal(run.scenarios.length, 5);
  assert.equal(run.usageCapture.usageSurfaced, true);
});

test('benchmark comparison refuses missing scenarios and never equates two missing reports', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pitchproof-bench-compare-'));
  try {
    const baseline = JSON.parse(readFileSync(join(root, 'docs/video/analysis-cost-benchmark/baseline.json'), 'utf8'));
    const before = join(dir, 'before.json'); const after = join(dir, 'after.json');
    const args = ['scripts/analysis-bench-compare.mjs', before, after];
    writeFileSync(before, JSON.stringify(baseline));
    writeFileSync(after, JSON.stringify({ ...baseline, scenarios: baseline.scenarios.slice(1) }));
    const mismatch = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stderr, /unique scenarios/);
    baseline.scenarios.forEach((s: { published: unknown }) => { s.published = null; });
    writeFileSync(before, JSON.stringify(baseline)); writeFileSync(after, JSON.stringify(baseline));
    const output = execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
    assert.match(output, /unavailable/);
    assert.doesNotMatch(output, /\| true \|/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
