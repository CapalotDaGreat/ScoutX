# B-26 integration and capacity validation runbook

**Status: PREPARED / NOT EXECUTED.** This document does not authorize billing, deployment, uploads, inference or a
benchmark rerun. Billing stays unlinked during preparation. The [CPU production plan](cpu-production-plan-2026-11-21.md)
and [blocker register](blocker-register-2026-11-04.md) remain authoritative; B-26 stays OPEN.

## 1. Scope, frozen inputs and prerequisites

Validate the real task workflow, chunk layout, timeout recovery and supported recording length. The existing CPU8
pass is the reference, not permission to expose continuous CV. B-09 independent identity evidence and explicit
worker/model approval remain separate gates.

Before any later execution, record an owner-approved private validation environment, named operator, exact resource
allowlist, authorized footage/transfers, retention/soft-delete policy, start/end window, spend/instance/task limits,
stop conditions and rollback revision. An alert alone is not a spend limit. Unset fields mean **BLOCKED**.

Freeze and hash these inputs before seeing candidate output:

- Worker digest `sha256:7e8d48728c75be551a8d5c057f9cc9020580b43682bd87cea9e9cd1b94263e2d`, source `bc5a9d1`;
  Functions source/build including `72efc2c` or a separately reviewed successor; actual deployed revisions.
- 8 vCPU / 32 GiB, CPU execution provider, balanced mode, model hashes, decoder/color path, precision, sampling,
  thread settings and effective provider sessions. Record visible logical CPUs separately from the allocation.
- Input stream hash, target settings, label hash/time basis, consent version, feedback revision, discovery output,
  sampling timestamps and cache state. No new precision/model/decoder experiments in this protocol.
- The recovered CPU8 reference and claims hashes from the [session summary](cpu8-regate-session-summary-2026-11-23.md),
  plus `workers/football-cv/bench/gates/balanced_5.2.json`. Keep the frozen reference immutable.

Record private service IAM, owner-only storage, request timeout **at least 1,800 s**, worker concurrency and instance
limits. Source queue caps are discovery 6, extraction 6, resolve 4 and OCR refresh 2. Worker concurrency 1 does not
limit aggregate requests across instances. Reconcile all active queues and simultaneous jobs with the approved
worker capacity; do not silently raise instance caps or assume six dispatches fit one busy instance. Include queue
wait, HTTP 429/503 responses and retry exhaustion in this check.

**Tooling/gating prerequisites still open:**

1. The opt-in full-claims exporter is implemented with synthetic regression tests; see the
   [tooling contract](../../workers/football-cv/bench/B26.md). It preserves every sampled timestamp/state/box,
   validates hashed checkpoints and frozen sampling, and writes private attempts before temporary output cleanup.
   The API still returns only its roughly 2 Hz strip. No real export or instrumentation parity is established.
   The changed execution code is a new configuration requiring review and parity against the historical anchor.
2. `bench/compare_b26.py` implements explicit mixed-plan A-to-B, schedule-only B-to-C and direct A-to-C comparisons,
   recomputing accuracy and agreement with unchanged `balanced_5.2` thresholds. It validates frozen metadata,
   sidecars, plans and sampling rather than editing unlike layouts to appear equivalent. Synthetic tests are not
   real-data evidence. `compare_runs.py` remains unchanged and still requires matching `configuration.chunkSec`.
3. Production `APPROVED_CV_WORKER` is null. Emulator approval seams are for local tests only. Do not set emulator
   environment variables on a cloud service or fabricate a production approval to get through the gate. A live
   validation path must be independently authorized and isolated from production users before deployment.
4. Final-attempt reconciliation is implemented locally (not deployed): an atomic server-only ticket accompanies
   the final resolve/OCR lease claim, and a bounded scheduled sweep settles abandoned state after expiry. See
   [reconciliation contract](b26-final-attempt-reconciliation-2026-11-24.md). Unit tests and 18 local Firestore-emulator
   cases cover owner/lifecycle fencing and concurrent transactions. Live scheduler delivery, outage/backlog recovery
   and killed-process behavior still need separately authorized validation. The nested-array report-persistence
   blocker is fixed locally with populated indicator/state-strip round trips; compatible reader/writer rollout
   remains required, as documented in that contract.
   Lease expiry alone does not run the sweep.

## 2. Evidence bundle and execution order

Use one private bundle per case, with a manifest, exact segment plan/hash, immutable input/configuration hashes,
full claims and their hash, raw report, task events, before/after state snapshots and a result of
`PASS`, `FAIL`, `BLOCKED` or `NOT_RUN`. Log scope, generation, revision, round, attempt and elapsed times; hash lease
tokens in exported traces. Keep source URLs, credentials, footage/crops and owner identifiers out of public reports.
Record whether evidence came from a stub, emulator or real worker. Synthetic responses never establish accuracy.

Execute only after the prerequisites and future execution scope are approved:

1. Local synthetic fault tests and Firestore-emulator integration: no footage, provider calls or Google Cloud work.
   Existing `trackingDeadlines.test.ts` is a starting point; its fake database is not proof of real transaction races.
2. Review the collector/parity adapter and validate it against known records and intentionally incompatible inputs.
3. In an approved isolated environment, validate real queue/HTTP timing with a controlled fault worker. Small local
   fake-clock tests do not prove the deployed 1,680/1,800 s clocks. Do not shorten production constants and call it
   a real-deadline test. Long delay injections need their own bounded resource/time allowance.
4. Run the approved real-worker parity/capacity cases only within the authorized envelope. No public release flags
   or production users are needed or authorized by this runbook.
5. Export and verify evidence before teardown; apply rollback/cleanup below. An incomplete export is not a pass.

## 3. P-series: chunk and publication parity

For the 2,035 s development recording, preserve these half-open bounds (the final end equals recording duration):

- **A, recorded layout:** `[0,300), [300,600), [600,900), [900,1200), [1200,1500), [1500,1800), [1800,2035)`.
- **B, production layout:** `[0,120), [120,420), [420,720), [720,1020), [1020,1320), [1320,1620), [1620,1920), [1920,2035)`.
- **C, real scheduling:** the same exact plan as B, with the orchestrator's discovery-first, sightings-prioritized
  extraction, preliminary/full publication and approved concurrency/retry behavior.

Generate plans from `planSegments`, not by copying the example for other durations. It merges tails shorter than
30 s: a 421 s recording yields `[0,120), [120,421)`, including a **301 s** segment. Long inputs can also grow the
base segment size. Check continuity, coverage, unique indices, actual maximum length and all worker limits; any
out-of-envelope segment is BLOCKED pending validation or an admission/planner fix. Do not silently drop its tail.

| Case | Method | Acceptance / evidence |
|---|---|---|
| P-01 | Verify plan generation for 120, 121, 420, 421, 449, 450, 2,035, 5,400 and 8,400 s; add boundary cases near plan growth | Exact bounds and hash recorded; no gaps/duplicates/truncation. Identify merged tails and reject unsupported sizes |
| P-02 | Compare A with sequential B; isolate layout as the only intended change | Full claims and labelled accuracy exported. Same pixels, model/configuration, labels, target, discovery and feedback; changed layout explicitly declared |
| P-03 | Compare sequential B with scheduled C | All other settings and explicit plan identical; no stale publication, lost coverage or extra identity claims caused by task ordering |
| P-04 | Repeat C with out-of-order extraction, a cached segment retry and a resume | Completed compatible chunks reused; fresh extraction/resolve timings distinguished from reused work; final result meets the same gate |
| P-05 | Compare early and final publication, then apply a correction and deferred OCR | Preliminary never overwrites fuller output; a newer revision supersedes old work; reference images/report versions correspond to the accepted result |
| P-06 | Reuse an incompatible checkpoint in a throwaway namespace, then switch worker instance | Incompatible plan/input/settings are refused or regenerated, never accepted as valid cached work; legitimate shared artifacts remain accessible after instance replacement |

Use separate job/artifact namespaces for A/B/C and separate trials. Record cold versus warm caches; never seed a
candidate with a different layout's stage-1 results. Partial and resumed runs may prove recovery but cannot supply
cold end-to-end timings. Preserve absolute video timestamps at every boundary; investigate every changed claimed
segment around cuts, crossings, occlusions and number sightings, including changes outside labelled windows.
Compare semantic claims and report content separately from expected job ids, image paths and publication timestamps;
retain those metadata differences in the evidence rather than normalizing away identity or coverage changes.
The recovered A report/claims do not establish availability of its complete discovery/OCR/cache artifacts. If those
inputs cannot be frozen consistently, mark the paired comparison BLOCKED. A newly collected paired A/B/C reference
would require separate execution authorization and must itself be checked against the historical gate anchor;
do not label unequal auxiliary cache states as a layout-only comparison.

### Parity scoring contract (adapter prerequisite)

The adapter must validate all ordinary `pp_bench.comparable` inputs and the explicit plan hashes. For A→B, allow
only the declared layout difference; for B→C allow only declared scheduling differences. Verify every other setting
separately, including those not checked by the generic comparator. Do not suppress an unexpected objection.

Recompute candidate accuracy with the frozen labels using the existing worker scorer, and compute timestamp/box
agreement from the full claims using `pp_bench.claims_agreement`. Apply `evaluate_gate` and `agreement_failures` from
`pp_bench` with the unchanged `balanced_5.2.json` thresholds:

- Wrong identity and confirmed-wrong identity: **0 s**; overlap-ambiguous time at most **1.0 s**.
- Relative to the frozen reference: IDF1 drop at most **0.01**, claimed-recall drop **0.02**, confirmed-correct drop
  **0.5 s**, overlap-ambiguous rise **0.3 s**.
- State agreement and conditional box agreement: each at least **0.97**, using the scorer's missing-data/vacuous rules.

Gate B and C against A as well as C against B, so tolerated changes cannot accumulate. Missing claims, unmatched
timeline coverage, non-comparable inputs or unreviewed claimed-identity changes cannot be converted into a pass by
padding/interpolating frames or trimming the comparison window. Keep abstentions explicit. Validate exporter and
adapter failures with altered hashes, dropped/duplicate timestamps and incomplete reports before using real output.

These are development parity checks. New independent footage needs frozen, blinded labels and the separate B-09
review/approval process. Neither temporal report support nor the existing interval gate proves whole-match identity.

## 4. R-series: delivery failures, leases and state fencing

Expected source settings: client **1,680 s**, task/dispatch **1,800 s**, lease **1,860 s**, minimum retry backoff
**240 s**; resolve **3 total attempts**, OCR refresh **2**. Retries are zero-based. Backoff can grow and queueing
can delay delivery; assert lower bounds, not an exact four-minute arrival. Without earlier termination, the first
timeout/retry timeline is approximately 28 minutes + at least 4 minutes, after the 31-minute lease expires.

Capture queue delivery status, worker call count, `progress.resolving/outcome`, current report/version,
`lease_<scope>` ownership/expiry, feedback and `followUp`. Different scopes have independent leases; do not assert
one global lock. Duplicate responses of `busy` must not settle the owning attempt's slot.

| Case | Fault / observation | Required result |
|---|---|---|
| R-01 | Resolve client deadline on attempts 0 and 1; attempt 2 succeeds | Typed timeout escapes handler to retry; lease retained; no early interruption; retry acquires expired lease and publishes current output |
| R-02 | Resolve deadline on every attempt | Exactly three permitted attempts; last full resolve returns terminal timeout, clears its resolving slot and records `interrupted`; no automatic fourth attempt |
| R-03 | OCR deadline then recovery; separately exhaust both attempts | First timeout keeps the same round `running` and retryable; last fails only that follow-up, not the full analysis; no extra round/quota charge from duplicate delivery |
| R-04 | Duplicate delivery during a live same-key lease, including a higher retry count | `busy`, one owner calls worker; no report/image write or slot clear by the duplicate. Verify real queue acknowledgements do not lose required recovery |
| R-05 | Deliver a delayed old result after lease expiry and takeover | Token/generation fence rejects old publication and failure settlement; old cleanup cannot release the replacement token |
| R-06 | Change feedback, create a newer generation, or schedule a newer OCR round while an old attempt runs | Old result cannot replace current state; stale OCR cannot steal a newer round's lease. A normal resume may keep the same generation; do not expect it to increment automatically |
| R-07 | Cancel/delete the throwaway analysis during work | No subsequent accepted publication; cancelled state is not changed to interrupted; deleted jobs do not gain lease/progress metadata |
| R-08 | Stop the owning Functions attempt without its `finally` running, including on the final permitted attempt | Lease survives; a remaining eligible delivery recovers after expiry. If the budget is exhausted, the reviewed reconciliation path must record interruption safely. Expiry alone is not recovery, and a manual retry must not disguise a new budget |
| R-09 | HTTP 500, network reset, service timeout response, or worker-capacity 429 | Preserve existing null/rejected behavior; these are not the typed client-deadline retry path. Record terminal outcome and ensure no retry storm; discovery/extraction keep their own null-response retries |
| R-10 | Concurrent preliminary/full work; reload worker instance between completed extracts and resolve | Independent scopes cannot starve each other; durable compatible artifacts survive; publication remains monotonic and owner-scoped |

Also verify a 17-minute-old claim is still live and that takeover occurs only after expiry. Check OCR's existing
400-new-crops **per request**, three-round cap and daily quota; retry attempts must not invent additional rounds.
Record actual crop/cache work on retries rather than assuming a timed-out remote request stopped. Fencing protects
publication; it does not cancel remote inference or guarantee that no background CPU work overlaps.

Use controlled stubs for deliberate long delays, never misleading synthetic accuracy claims. Consent/kill-switch
withdrawal, unauthenticated invocation and cross-owner access are mandatory negative controls: no accepted output
or unauthorized processing. A blocked approval seam is **BLOCKED**, not permission to bypass authorization.

## 5. C-series: supported-length capacity and admission

Pre-register the supported duration/resolution/FPS, number of simultaneous matches, queue caps, worker concurrency,
instance cap and cost/time envelope. Start with the validated 8-vCPU allocation. Changing resources, image or
decoder is outside this protocol's fixed configuration until independently evaluated.

The saved 34-minute resolve was **610.872 s**. A linear 90-minute estimate is **1,620.987 s**, leaving about **59 s**
under the client deadline. This is neither a measurement nor adequate evidence of tail latency.

| Class | Required observations |
|---|---|
| C-01 cold start | Model initialization, first request, memory peak and total client elapsed, including waiting for an instance |
| C-02 extraction | First 120 s, ordinary 300 s, final/merged-tail segments, difficult lighting/blur/same-kit scenes and worker replacement |
| C-03 resolve | Full-recording resolve at each proposed supported length, high tracklet/occlusion load, feedback correction and final publication overhead |
| C-04 OCR refresh | Deferred work near the crop limit, cold/warm cache, bounded rounds and timeout recovery without duplicated quota |
| C-05 contention | The proposed multi-match workload with all active queues; admission/queue wait, 429/503, retry load and instance cap respected |

Record raw per-task client, worker and function durations separately, cache/resume state, memory/CPU allocation,
startup and publication overhead, failures, queue wait, retries, first useful/full report times and costs by the
actual resource SKU. Do not use the saved job's G2/L4 VM estimate as CPU Cloud Run billing evidence.

**Proposed acceptance margin, to approve before execution:** normal (non-injected) task client elapsed at most
**1,440 s**, leaving 240 s under the client limit, with all function post-processing below 1,800 s. Any normal task
reaching 1,680 s fails the admitted envelope. The 1,440 s margin is a proposed validation criterion, not a newly
approved production SLO. Record the agreed bound before collecting candidate timings; do not relax it after failure.

Collect cold and warm observations at each admitted length and workload. Report sample counts and maxima. Do not
publish p95 from fewer than 20 measured samples per claimed class, or treat repeated fixture replays as independent
production observations. If the approved budget permits only a few trials, label the result exploratory and leave
capacity closure BLOCKED. A 90-minute or larger envelope remains blocked until it meets the agreed bound; otherwise
restrict the admitted input or separately design/review a longer-running job route. Retry is not capacity expansion.

## 6. Stop, rollback and cleanup

Stop on identity/privacy violation, altered frozen inputs, missing evidence, unexpected billing/resource scope,
normal-request deadline exhaustion, lost task recovery, artifact isolation failure or unapproved capacity growth.
Only the pre-authorized validation resources and test records may be changed in these steps:

1. Stop new validation admissions/producers; leave production CV fail-closed. Pause the exact allowlisted validation
   queues and record their outstanding deliveries. Do not purge shared queues or silently discard user analyses.
2. Cancel the validation analyses through the approved cancellation path. Preserve consent withdrawals and newer
   feedback. Observe in-flight Functions/worker requests and lease expiry; do not delete leases to speed recovery.
   A 31-minute wait alone is not proof that remote processing stopped.
3. Quarantine test reports and hashes. Confirm late responses cannot publish. Drain or explicitly terminate only
   isolated approved test workers once no unrelated work is attached; record any residual compute/partial uploads.
4. Restore the pre-recorded private worker digest/revision and compatible Functions configuration only if the
   rollback is approved. Do **not** restore 600 s/900 s handlers while long tasks remain queued/running, or roll
   back token-aware code against active new leases. If no compatible safe revision exists, remain disabled.
5. Resume only the permitted test queues/admission after a controlled smoke check, or leave the environment
   disabled pending review. Never restore an old database snapshot over current consent/cancellation/review state.
6. Verify exported JSON and sidecars against their recorded hashes and open them before deleting source evidence.
   Check each exact session resource after removal; retain shared/pinned images only by an explicit recorded
   decision. Account for buckets, objects/versions, soft-deleted copies, scratch artifacts, builds and running
   tasks/services. Absence is not proof of permanent erasure. Do not touch unrelated resources.
7. Record cleanup exceptions, remaining retention/expiry dates and actual charges privately. If a future session
   explicitly authorized billing linkage, end it as authorized and verify the final state; preparation itself
   keeps billing unlinked. Publish only a sanitized result summary.

## 7. B-26 closure record

For every required P/R/C case, record evidence location/hash, inputs/revisions, sample counts, actual versus stub
execution, expected/observed outcome and reviewer. Missing, incompatible or unexecuted evidence remains BLOCKED/
NOT_RUN. Required tooling, isolation/authorization, parity, real queue recovery, admitted capacity and rollback
checks must all be accepted before closing B-26. Keep known identity issues and B-09 approval independently open.

Operator and reviewer sign-off must name the exact allowed configuration, duration and concurrency envelope,
remaining exclusions, rollback path and cleanup status. Filing this runbook does not close any execution criterion.
