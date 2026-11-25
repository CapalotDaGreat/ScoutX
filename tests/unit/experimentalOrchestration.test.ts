import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cancelExperimentalJob, deliverStage, newExperimentalJob, restoreJob, serialiseJob,
} from '../../functions/src/analysis/experimentalOrchestration.ts';

test('a finished extract survives a failed resolve, and a repeat does not run again', () => {
  let calls = 0;
  const started = deliverStage(newExperimentalJob(), 1, 'extract', () => {
    calls += 1;
    return 'extract-a';
  });
  assert.equal(started.delivery, 'applied');
  assert.equal(calls, 1);
  const again = deliverStage(started.job, 1, 'extract', () => {
    calls += 1;
    return 'extract-b';
  });
  assert.equal(again.delivery, 'duplicate');
  assert.equal(again.job.stages.extract.output, 'extract-a');
  assert.equal(calls, 1);
  const failed = deliverStage(started.job, 1, 'resolve', () => { throw new Error('resolve exceeded the client'); });
  assert.equal(failed.delivery, 'applied');
  assert.equal(failed.job.stages.resolve.status, 'failed');
  assert.equal(failed.job.stages.extract.status, 'done');
  assert.equal(failed.job.stages.extract.output, 'extract-a');
  const recovered = deliverStage(failed.job, 1, 'resolve', () => 'resolve-a');
  assert.equal(recovered.job.stages.resolve.output, 'resolve-a');
  assert.equal(recovered.job.stages.extract.output, 'extract-a');
});

test('stale generations, cancellation and a resolve without an extract are rejected', () => {
  const job = newExperimentalJob(3);
  assert.equal(deliverStage(job, 2, 'extract', () => 'nope').delivery, 'stale');
  assert.equal(job.stages.extract.status, 'empty');
  assert.equal(deliverStage(job, 3, 'resolve', () => 'early').delivery, 'rejected');
  const cancelled = cancelExperimentalJob(job);
  const blocked = deliverStage(cancelled, 3, 'extract', () => 'late');
  assert.equal(blocked.delivery, 'cancelled');
  assert.equal(blocked.job.stages.extract.status, 'empty');
});

test('a restored extract survives a failed resolve after the record is reloaded', () => {
  const started = deliverStage(newExperimentalJob(), 1, 'extract', () => 'extract-a');
  const restored = restoreJob(serialiseJob(started.job));
  const failed = deliverStage(restored, 1, 'resolve', () => { throw new Error('worker stopped'); });
  assert.equal(failed.job.stages.extract.output, 'extract-a');
  assert.equal(failed.job.stages.resolve.status, 'failed');
  assert.throws(() => restoreJob('{"generation":1}'), /incomplete/);
});
