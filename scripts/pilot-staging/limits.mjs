/**
 * Spending and runtime guard for the staging drivers (probe-tasks.mjs, image-revocation.mjs).
 *
 * Every case reserves its worst-case task creations and delivery attempts before it starts (CASE_BUDGET; derivation
 * in docs/release/staging-verification-plan-2026-11-19.md Ã‚Â§6). Usage is kept in one state file shared by both drivers,
 * so the limits hold for the whole run. A reservation that would exceed a limit, or a run past its deadline, trips the
 * guard once: the stop procedure runs and the case does not start.
 *
 * Stop procedure (order matters):
 *   1. pilot kill switch (tracking-pilot-ops.mjs stop): in-flight work can no longer publish (in-transaction gate);
 *   2. retries off: every queue max-attempts 1, so a failing in-flight delivery is not redelivered;
 *   3. dispatch paused: every queue paused (running deliveries finish or time out; their results are discarded by 1.);
 *   4. queued tasks purged (synthetic only), fake worker holds released and min-instances 0.
 * Against the emulators the gcloud steps are recorded, not executed.
 */
import fs from 'node:fs';

/** Driver runtime (STG-06..08, deployment excluded) is the binding cost control: see the plan's Ã‚Â§6 worst case. */
/** @typedef {{ maxTasks: number, maxAttempts: number, maxRuntimeMs: number }} Limits */
/** @type {Readonly<Limits>} */
export const LIMITS = Object.freeze({ maxTasks: 60, maxAttempts: 150, maxRuntimeMs: 90 * 60 * 1000 });

/** Worst case per case: tasks the case creates (driver + app fan-out) and their maximum delivery attempts. */
export const CASE_BUDGET = Object.freeze({
  A1: { tasks: 2, attempts: 4 }, // probe task (max 1) + the resolve it triggers (max 3)
  A2: { tasks: 1, attempts: 1 }, A3: { tasks: 1, attempts: 1 }, A4: { tasks: 1, attempts: 1 }, // rejected, probe queue max 1
  R1: { tasks: 2, attempts: 6 }, // extract (fails once; max 3) + resolve (max 3)
  R2: { tasks: 1, attempts: 3 }, // extract failing 3 times; no resolve
  R3: { tasks: 1, attempts: 2 }, // exhaust probe queue max 2
  D1: { tasks: 2, attempts: 6 }, // named task + re-create after execution (2nd create rejected: an API call, no task)
  D2: { tasks: 3, attempts: 9 }, // 2 unnamed extracts + the resolve the winner triggers
  D3: { tasks: 4, attempts: 12 }, // start (extract + resolve) + 2 repeated resolves
  D4: { tasks: 2, attempts: 6 }, // 2 resolves for the same work while the first executes
  S1: { tasks: 1, attempts: 3 }, // delayed resolve, stale
  IR: { tasks: 7, attempts: 21 }, // discover + extract + resolve, export, reprocess resolve, discarded extract + resolve
});

export const QUEUES = ['extractTrackingSegmentTask', 'discoverTrackingTask', 'resolveTrackingTask', 'refreshTrackingOcrTask',
  'buildDataExport', 'stg-auth-probe', 'stg-exhaust-probe'];

export class LimitError extends Error {}

/** The stop procedure as exact commands (no secrets; the project id is public configuration). */
export function stopCommands(project, region = 'europe-west6', queues = QUEUES) {
  const q = (cmd) => queues.map((name) => ['gcloud', 'tasks', 'queues', ...cmd(name), `--location=${region}`, `--project=${project}`]);
  return [
    ['node', 'scripts/tracking-pilot-ops.mjs', 'stop', '--project', project, '--production-authorized'],
    ...q((n) => ['update', n, '--max-attempts=1']),
    ...q((n) => ['pause', n]),
    ...q((n) => ['purge', n, '--quiet']),
    ['fake-worker', 'POST', '/_ctl/release-all'],
    ['gcloud', 'run', 'services', 'update', 'stg-fake-worker', '--min-instances=0', `--region=${region}`, `--project=${project}`],
  ];
}

/**
 * @param {{ stateFile: string, limits?: Limits, now?: () => number, stop: (reason: string) => Promise<void> | void }} o
 */
export function createGuard({ stateFile, limits = LIMITS, now = Date.now, stop }) {
  const load = () => {
    try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return { startedAt: now(), tasks: 0, attempts: 0, cases: [], tripped: null }; }
  };
  const save = (s) => fs.writeFileSync(stateFile, JSON.stringify(s, null, 1));
  let state = load();
  save(state);
  async function trip(reason) {
    if (!state.tripped) {
      state.tripped = { reason, at: now() };
      save(state);
      await stop(reason);
    }
    throw new LimitError(reason);
  }
  return {
    /** Reserve a case's worst case; trips (stop + throw) instead of starting when a limit would be exceeded. */
    async reserve(caseId) {
      state = load();
      if (state.tripped) throw new LimitError(`guard already tripped: ${state.tripped.reason}`);
      const b = CASE_BUDGET[caseId];
      if (!b) return trip(`no budget defined for case ${caseId}`);
      if (now() - state.startedAt > limits.maxRuntimeMs) return trip(`runtime limit ${limits.maxRuntimeMs} ms exceeded before ${caseId}`);
      if (state.tasks + b.tasks > limits.maxTasks) return trip(`task limit ${limits.maxTasks} would be exceeded by ${caseId}`);
      if (state.attempts + b.attempts > limits.maxAttempts) return trip(`attempt limit ${limits.maxAttempts} would be exceeded by ${caseId}`);
      state.tasks += b.tasks;
      state.attempts += b.attempts;
      state.cases.push({ caseId, ...b, at: now() });
      save(state);
      return b;
    },
    /** Call while waiting inside a long case; trips at the deadline. */
    async checkRuntime() {
      if (now() - state.startedAt > limits.maxRuntimeMs) await trip(`runtime limit ${limits.maxRuntimeMs} ms exceeded`);
    },
    /** Observed deliveries (from worker or attempt logs) above the reservation also trip the guard. */
    async observe(attemptsSeen) {
      state = load();
      state.observedAttempts = attemptsSeen;
      save(state);
      if (attemptsSeen > state.attempts || attemptsSeen > limits.maxAttempts) {
        await trip(`observed ${attemptsSeen} delivery attempts above the reserved ${state.attempts}`);
      }
    },
    /** Trips at the deadline even if a case hangs between reservations; `exit` ends the driver afterwards. */
    /** @param {() => void} [exit] */
    watchdog(exit = () => { process.exit(2); }) {
      const left = Math.max(0, limits.maxRuntimeMs - (now() - load().startedAt));
      const t = setTimeout(() => { trip(`runtime limit ${limits.maxRuntimeMs} ms reached (watchdog)`).catch(() => {}).finally(exit); }, left);
      t.unref?.();
      return t;
    },
    summary: () => ({ ...load(), limits }),
  };
}

/**
 * The guard as the drivers use it: shared state per project, stop procedure executed against staging and recorded
 * (not executed) against the emulators. `ops` is the driver's tracking-pilot-ops runner.
 */
export async function driverGuard(cfg, E, ops, spawn, opIdToken = () => '') {
  const stateFile = process.env.STAGING_LIMITS_STATE ?? `/tmp/pitchproof-staging-limits-${cfg.project}.json`;
  const g = createGuard({
    stateFile,
    stop: async (reason) => {
      E.step('limits.tripped', { reason });
      ops('stop');
      const queues = [...QUEUES.slice(0, -2), cfg.authProbeQueue ?? QUEUES.at(-2), cfg.exhaustProbeQueue ?? QUEUES.at(-1)];
      const cmds = stopCommands(cfg.project, cfg.region, queues).slice(1);
      await fetch(`${cfg.workerBase}/_ctl/release-all`, { method: 'POST', headers: cfg.workerAuth === 'operator' ? { Authorization: `Bearer ${await opIdToken(cfg.workerBase)}` } : {} })
        .then((r) => E.step('limits.fake_worker_release_all', { http: r.status })).catch((e) => E.step('limits.fake_worker_release_all', { error: String(e) }));
      if (cfg.target !== 'staging') { E.step('limits.stop_procedure (recorded, emulator)', { commands: cmds.map((c) => c.join(' ')) }); return; }
      for (const c of cmds.filter((x) => x[0] === 'gcloud')) {
        const r = spawn(c[0], c.slice(1), { encoding: 'utf8', env: { ...process.env, CLOUDSDK_AUTH_ACCESS_TOKEN: '' } });
        E.step('limits.stop_procedure', { command: c.join(' '), exit: r.status });
      }
    },
  });
  g.watchdog();
  return g;
}
