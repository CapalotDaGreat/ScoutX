import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
// @ts-expect-error plain ESM driver module without types
import { CASE_BUDGET, LIMITS, LimitError, QUEUES, createGuard, stopCommands } from '../../scripts/pilot-staging/limits.mjs';

type Budget = Record<string, { tasks: number; attempts: number }>;
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stg-limits-')), 'state.json');

test('staging limits: the full planned matrix fits the task and attempt limits with its worst case', () => {
  const b = CASE_BUDGET as Budget;
  const tasks = Object.values(b).reduce((n, c) => n + c.tasks, 0);
  const attempts = Object.values(b).reduce((n, c) => n + c.attempts, 0);
  assert.equal(tasks, 28);
  assert.equal(attempts, 75);
  assert.ok(tasks <= LIMITS.maxTasks && attempts <= LIMITS.maxAttempts);
  // every task's attempt reservation covers its queue's maximum (3; probe queues 1 and 2)
  for (const [id, c] of Object.entries(b)) assert.ok(c.attempts >= c.tasks, id);
});

test('staging limits: a case that would exceed a limit trips the stop procedure once and does not start', async () => {
  const stops: string[] = [];
  const g = createGuard({ stateFile: tmp(), limits: { maxTasks: 5, maxAttempts: 150, maxRuntimeMs: 1e9 }, stop: (r: string) => { stops.push(r); } });
  await g.reserve('D3'); // 4 tasks
  await assert.rejects(g.reserve('D2'), LimitError); // 4 + 3 > 5
  await assert.rejects(g.reserve('A2'), /already tripped/); // nothing starts after a trip, even a small case
  assert.equal(stops.length, 1);
  assert.match(stops[0], /task limit 5/);
  assert.equal(g.summary().tasks, 4, 'the refused case reserved nothing');
});

test('staging limits: attempt limit, runtime limit, unknown cases and observed overruns all stop the run', async () => {
  for (const [limits, act, re] of [
    [{ maxTasks: 60, maxAttempts: 10, maxRuntimeMs: 1e9 }, async (g: { reserve: (id: string) => Promise<unknown> }) => { await g.reserve('D3'); }, /attempt limit 10/],
    [{ maxTasks: 60, maxAttempts: 150, maxRuntimeMs: 1e9 }, async (g: { reserve: (id: string) => Promise<unknown> }) => { await g.reserve('ZZ'); }, /no budget/],
    [{ maxTasks: 60, maxAttempts: 150, maxRuntimeMs: 1e9 }, async (g: { reserve: (id: string) => Promise<unknown>; observe: (n: number) => Promise<void> }) => {
      await g.reserve('A1'); await g.observe(5); }, /observed 5/],
  ] as const) {
    const stops: string[] = [];
    const g = createGuard({ stateFile: tmp(), limits, stop: (r: string) => { stops.push(r); } });
    await assert.rejects(act(g as never), re);
    assert.equal(stops.length, 1);
  }
  let t = 0;
  const stops: string[] = [];
  const g = createGuard({ stateFile: tmp(), limits: { maxTasks: 60, maxAttempts: 150, maxRuntimeMs: 1000 }, now: () => t, stop: (r: string) => { stops.push(r); } });
  await g.reserve('A2');
  t = 1001;
  await assert.rejects(g.checkRuntime(), /runtime limit/);
  assert.equal(stops.length, 1);
});

test('staging limits: usage is shared between the two drivers through the state file', async () => {
  const file = tmp();
  const a = createGuard({ stateFile: file, stop: () => {} });
  await a.reserve('IR');
  const b = createGuard({ stateFile: file, stop: () => {} });
  await b.reserve('D3');
  assert.equal(b.summary().tasks, 11);
  assert.equal(b.summary().attempts, 33);
});

test('staging limits: stop procedure kills the pilot first, then disables retries, pauses and purges every queue', () => {
  const cmds = (stopCommands('pitchproof-stg-pilot') as string[][]).map((c) => c.join(' '));
  assert.match(cmds[0], /tracking-pilot-ops\.mjs stop --project pitchproof-stg-pilot/);
  const idx = (re: RegExp) => cmds.findIndex((c) => re.test(c));
  assert.ok(idx(/--max-attempts=1/) < idx(/ pause /) && idx(/ pause /) < idx(/ purge /));
  for (const q of QUEUES as string[]) for (const v of ['update', 'pause', 'purge']) assert.ok(cmds.some((c) => c.includes(`queues ${v} ${q} `)), `${v} ${q}`);
  assert.ok(cmds.includes('fake-worker POST /_ctl/release-all'), 'held fake-worker requests are released');
  assert.ok(cmds.filter((c) => !c.startsWith('fake-worker')).every((c) => c.includes('--project=pitchproof-stg-pilot') || c.includes('--project pitchproof-stg-pilot')));
  assert.ok(!cmds.some((c) => c.includes('scoutx-230b0')));
});

test('staging limits: the watchdog stops a run that hangs between reservations', async () => {
  let t = 0;
  const stops: string[] = [];
  const g = createGuard({ stateFile: tmp(), limits: { maxTasks: 60, maxAttempts: 150, maxRuntimeMs: 30 }, now: () => t, stop: (r: string) => { stops.push(r); } });
  await g.reserve('A2');
  const exited = await new Promise<boolean>((resolve) => { t = 31; g.watchdog(() => resolve(true)); });
  assert.ok(exited);
  assert.equal(stops.length, 1);
  assert.match(stops[0], /watchdog/);
});
