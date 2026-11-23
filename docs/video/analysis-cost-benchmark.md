# Match-analysis cost benchmark

Deterministic benchmark of the tracking-v3 orchestration (upload, segments, resolve, follow-up questions). It drives the real
task code (`functions/src/analysis/*`) against an in-memory Firestore and the recorded IMG_4809 worker output
(`tests/fixtures/tracking50-img4809-auto.json`, 2035 s, 8 segments, 15 moments, 8 review questions). It calls no network,
provider or worker and enables no production path. Accuracy evaluation is separate: see `analysis-evaluation.md`.

## Reproduce

```
npm run bench:analysis -- --out docs/video/analysis-cost-benchmark/after.json
node scripts/analysis-bench-compare.mjs docs/video/analysis-cost-benchmark/baseline.json docs/video/analysis-cost-benchmark/after.json
node --import ./tests/unit/support/register.mjs --test tests/unit/analysisCostGuards.test.ts tests/unit/reportEval.test.ts
```

Baseline at an earlier revision: `git archive HEAD functions tests/fixtures tests/unit/support | tar -x -C <dir>`, copy
`tests/unit/support/analysisBench.ts` and `scripts/analysis-bench.mjs` in, symlink `node_modules`, run the same command.
`baseline.json` is the retained historical replay at `32ab43f1`. The current review regenerated `after.json`; it did not
re-execute that earlier commit. Runtime changes exercised by the replay are in the three patched Functions source modules.

## Labels

- **Measured**: request counts per worker route, retries, image writes, Firestore reads and writes, publishes, worker calls before
  the first and last published report (30 samples, deterministic; sample count is for CPU timing only).
- **Estimated**: worker seconds and USD, from one recorded L4 run (discovery 507.753 s over 4 chunks, extraction 1051.349 s over
  8 segments, one full resolve 218.069 s, VM USD 0.9273/h). Failed attempts are charged as whole calls and a preliminary resolve
  as a full one, so savings are upper bounds. A single run supports no p95.
- **Missing**: real wall-clock time to first and full report, p95 in production, provider tokens per match (usage capture is new and
  nothing has been logged; the benchmark's token numbers come from a stubbed response and prove the plumbing only), cost of the
  frame-review path, and accuracy on real footage.

The JSON's legacy `cpuMs` field uses `performance.now()`: it measures elapsed time in this local replay, not process CPU
usage or worker latency. `coldFirstRun` is the first harness sample, not a measured service/model cold start. The worker
responses are fixtures, so equal report hashes establish workflow equivalence only, never inference accuracy.

## Results (IMG_4809, 8 segments)

| scenario | worker calls (d/e/r) | est. worker s | est. USD | publishes | img writes | fs reads | calls@first report | calls@last publish | same report |
|---|---|---|---|---|---|---|---|---|---|
| cold_prompt | 4/8/3 | 2213.3 | 0.570 | 3 | 72 | 61 -> 72 | 6 | 15 | true |
| cold_delayed_resolve | 4/8/2 -> 4/8/1 | 1995.2 -> 1777.2 | 0.514 -> 0.458 | 2 -> 1 | 48 -> 24 | 55 | 13 | 14 -> 13 | true |
| cold_no_number_prompt | 0/8/3 | 1705.6 | 0.439 | 3 | 72 | 45 -> 56 | 2 | 11 | true |
| transient_failures | 4/11/3 | 2607.6 | 0.672 | 3 | 72 | 67 -> 78 | 6 | 18 | true |
| interrupted_then_resumed | 4/11/3 | 2607.6 | 0.672 | 3 | 72 | 70 -> 81 | 6 | 18 | true |

before=32ab43f1-baseline after=371520c+uncommitted; samples per scenario: 30
Estimates only: single recorded L4 run, whole-call charging for failed attempts, preliminary resolve charged as full.

Calls at first report are worker calls issued before the first published report, a unit-free proxy for time to first useful
report; it did not change in any scenario. Reasoning: a double-submitted clip explanation went from 2 to 1 frame extractions and
2 to 1 provider requests; repeated rejected answers are still re-asked every time (3 of 3).

## Changes kept

1. `openRouter.ts`: logs and returns provider token counts (counts only), so cost per match can be measured.
2. `trackingCallables.ts`: a preliminary resolve is skipped once every segment is done or the full report exists; review images are
   not stored for a result that cannot replace the current report or was superseded by a correction.
3. `trackingReasoning.ts`: identical simultaneous explanations share one frame extraction and one provider request; consent and
   report version are re-checked before the frames reach the provider and before anything is stored, so a revocation or correction
   during the call drops the answer instead of caching it (a gap that existed before and is now closed).

Cost of the changes: 11 more Firestore reads per prompt run (61 to 72). Each explanation recheck reads the job, current report
and video consent, plus the AI/guardian consent checks. Provider permissions are checked again; a removed provider or cancelled
job blocks the answer. Cached answers and joined requests are also rechecked before return.

## Review of concurrency, consent, corrections and failures

- Coalescing is per instance, database, owner, job and version; callers join only after their own owner, consent and gate checks, so no
  account boundary is crossed. A failed leader leaves nothing in flight; joiners of a failed call see the same error.
- A correction bumps the report version, which changes the key, so later callers never join a stale request.
- A late preliminary retry after the full report returns `stale` before any worker call; feedback and refresh resolves are never skipped.
- The image preflight is best effort: a result can still become stale while uploads are running. The publication transaction
  remains authoritative, but this change does not make Storage and Firestore atomic or reclaim every superseded thumbnail.
- Resolve skip assumes the full resolve was dispatched when the last segment finished. In this branch a full resolve returning
  `rejected` interrupts the analysis; only thrown handler failures trigger Cloud Tasks retries. The local replay does not measure
  HTTP deadlines or real queue behaviour, and does not change them.

## Original verification (local VM: 2 vCPU, Node 22.23.5)

Passed: `tsc` for app, tests and functions; `eslint` for src, functions/src, scripts and tests; all 103 unit files (827 subtests,
run file by file because the suite exceeds this VM's per-command limit). Not run: Firestore rules/emulator tests, Playwright e2e,
worker pytest (no torch), release gate, root-level lint outside the four directories.

## Review verification (Windows, 2026-11-23)

Passed: `npm run typecheck`, `tsc --noEmit -p tests` after the final test edits, `npm run build --prefix functions`,
focused ESLint, Node syntax checks for the CLI scripts, and the full unit suite (858 tests, zero failures).
Regenerated the local fixture benchmark and report evaluation; the report evaluation still has no held-out evidence.
Compiled Functions JavaScript/maps are included with the source changes. Emulator/browser tests, cloud execution and
real-footage inference were not run in this review. Billing was left unchanged.

## Unresolved

- Worker discovery and extraction are about 84% of recorded GPU wall time (confirmed from the report, not re-measured). That GPU
  run failed its relative accuracy gate against the CPU run (claimed recall 0.494 vs 0.621, IDF1 0.661 vs 0.766), so a GPU speed-up
  already changes output and needs a real held-out benchmark. Discovery uses a 416 px detector and extraction 1280 px, so detections
  cannot be shared; each decodes the video again. Models load once per worker process; retries reuse checkpointed segments;
  corrections reuse an in-memory detection cache that is per instance (cold reload cost unmeasured).
- No held-out set, no second reviewer, no event labels; usable share on the development labels is 0 of 1 verified.
- Preliminary-resolve cadence, repeated rejected explanations, 30 superseded thumbnails per cold run (retention decision), cross-instance
  coalescing, and frame-review token cost remain open.
