import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

test('partial player annotations yield positive presence, never inferred target absence', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pitchproof-label-derivation-'));
  try {
    const input = join(dir, 'partial-boxes.json');
    writeFileSync(input, JSON.stringify({
      note: 'Selected orange players only',
      times: { 0: 0, 1: 0.1, 2: 0.2, 3: 0.3, 4: 0.4, 5: 0.5 },
      frames: {
        0: [{ label: 'N' }],
        1: [{ label: 'N' }, { label: '?' }],
        2: [],
        3: [{ label: 'T' }, { label: 'N' }],
        4: [{ label: 'T' }],
        5: [{ label: 'N' }],
      },
    }));
    const script = fileURLToPath(new URL('../../scripts/analysis-eval-labels-from-gt.mjs', import.meta.url));
    const labels = JSON.parse(execFileSync(process.execPath, [script, input], { encoding: 'utf8' }));
    assert.deepEqual(labels.visibleIntervals, [[0.3, 0.5]]);
    assert.deepEqual(labels.absentIntervals, [], 'N is a box label, not a frame-level absence assertion');
    assert.equal(labels.eventsLabelled, false);
    assert.equal(labels.split, 'development');
    assert.ok(labels.tags.includes('presence_only_partial_box_annotations'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
