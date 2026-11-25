import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CPU8_MEASURED, UNMEASURED_COST_LINES, executionRequirement, nonDetectorBudget, resolveBudget,
} from '../../functions/src/analysis/analysisBudget.ts';
import { TRACKING_WORKER_CLIENT_MS } from '../../functions/src/analysis/trackingDeadlines.ts';

test('the 34-minute resolve is the measured figure and fits the current client', () => {
  const requirement = executionRequirement(CPU8_MEASURED.durationSec);
  assert.equal(requirement.resolve.kind, 'measured');
  assert.equal(requirement.resolve.seconds, 610.872);
  assert.equal(requirement.clientBudgetSec, TRACKING_WORKER_CLIENT_MS / 1000);
  assert.equal(requirement.model, 'fits_current_client');
  assert.equal(requirement.sameShapeAsHistoricalBenchmark, false);
  const remainder = nonDetectorBudget(CPU8_MEASURED.durationSec);
  assert.equal(remainder.kind, 'measured');
  assert.ok(Math.abs(remainder.seconds - (6628.491 - 3878.86)) < 1e-9);
});

test('a 140-minute resolve is an extrapolation and misses the current client', () => {
  const requirement = executionRequirement(140 * 60);
  assert.equal(requirement.resolve.kind, 'extrapolated');
  assert.equal(requirement.model, 'exceeds_current_client');
  assert.ok(requirement.resolve.seconds > requirement.clientBudgetSec);
  assert.equal(requirement.sameShapeAsHistoricalBenchmark, false);
  const match = resolveBudget(90 * 60);
  assert.equal(match.kind, 'extrapolated');
  assert.equal(executionRequirement(90 * 60).model, 'fits_current_client');
  assert.ok(UNMEASURED_COST_LINES.includes('retry'));
});
