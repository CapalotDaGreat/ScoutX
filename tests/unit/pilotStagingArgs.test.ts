import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDriverArgs } from '../../scripts/pilot-staging/lib.mjs';

test('staging driver args: the value of --only is never taken as the evidence file (regression, 2026-11-19 audit)', () => {
  assert.deepEqual(parseDriverArgs(['--only', 'S1']), { out: null, only: ['S1'], dryRun: false });
  assert.deepEqual(parseDriverArgs(['--only', 'A1,A2', 'ev.json']), { out: 'ev.json', only: ['A1', 'A2'], dryRun: false });
  assert.deepEqual(parseDriverArgs(['ev.json', '--dry-run']), { out: 'ev.json', only: [], dryRun: true });
});
