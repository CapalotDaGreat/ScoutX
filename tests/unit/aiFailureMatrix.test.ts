import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { canAcquireLease, canTransitionJob } from '../../functions/src/analysis/stateMachine.ts';
import { normalizeObservations } from '../../functions/src/analysis/validation.ts';
import {
  ANALYSIS_DAILY_QUOTA,
  CV_WORKER_STAGES,
  dailyQuotaCount,
  isDailyQuotaReached,
  unavailableCvOutputs,
} from '../../functions/src/analysis/workerContract.ts';
import { NOT_ENOUGH_EVIDENCE } from '../../functions/src/analysis/askThisMatch.ts';

describe('AI failure matrix', () => {
  test('CV worker stages are unavailable rather than completed with invented tracking', () => {
    const outputs = unavailableCvOutputs();
    assert.equal(outputs.length, CV_WORKER_STAGES.length);
    for (const output of outputs) {
      assert.equal(output.status, 'unavailable');
      assert.match(output.reason, /will not invent/i);
    }
  });

  test('lease cannot be stolen while another holder is live', () => {
    const until = new Date(Date.now() + 60_000).toISOString();
    assert.equal(canAcquireLease({ holder: 'run-a', until }, 'run-b', Date.now()), false);
    assert.equal(canAcquireLease({ holder: 'run-a', until }, 'run-a', Date.now()), true);
    assert.equal(canAcquireLease(undefined, 'run-b', Date.now()), true);
  });

  test('an expired lease can be acquired by a new run', () => {
    const until = new Date(Date.now() - 1_000).toISOString();
    assert.equal(canAcquireLease({ holder: 'run-a', until }, 'run-b', Date.now()), true);
  });

  test('daily quota does not carry yesterday’s count and blocks at the limit', () => {
    assert.equal(dailyQuotaCount('2026-10-05', 8, '2026-10-06'), 0);
    assert.equal(dailyQuotaCount('2026-10-06', 8, '2026-10-06'), 8);
    assert.equal(isDailyQuotaReached(ANALYSIS_DAILY_QUOTA), true);
    assert.equal(isDailyQuotaReached(ANALYSIS_DAILY_QUOTA - 1), false);
  });

  test('observations that do not cite a sampled frame are dropped, not guessed', () => {
    const kept = normalizeObservations(
      [
        { frameId: 'frame_0', timestampSec: 12, label: 'Press', kind: 'observation' },
        { frameId: 'invented', timestampSec: 12, label: 'Shot', kind: 'observation' },
        { timestampSec: 12, label: 'No frame' },
      ],
      new Set(['frame_0']),
      90,
    );
    assert.equal(kept.length, 1);
    assert.equal(kept[0]?.frameId, 'frame_0');
  });

  test('Ask This Match has a fixed insufficient phrase and never a generated fallback', () => {
    assert.equal(NOT_ENOUGH_EVIDENCE, 'Not enough evidence yet');
  });

  test('jobs cannot skip from uploading to complete', () => {
    assert.equal(canTransitionJob('uploading', 'complete'), false);
    assert.equal(canTransitionJob('processing', 'failed'), true);
  });
});
