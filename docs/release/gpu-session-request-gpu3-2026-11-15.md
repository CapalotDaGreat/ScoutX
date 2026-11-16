# GPU-3: sustained, resumable L4 capacity search (2026-11-15) — APPROVED

**Why:** GPU-1 (2026-11-09) and GPU-2 (2026-11-15 17:26–20:27 UTC) each used all 11 approved attempts with
`ZONE_RESOURCE_POOL_EXHAUSTED` in every zone. One pass through the zones per approval is too little. GPU-3 asks
once for a bounded, multi-day search so later stockouts don't need another request.

**Verified 2026-11-15 ~21:00 UTC:**
- Project `scoutx-230b0`: 0 instances, 0 disks, no operations after 20:30 UTC, no `runs/` objects.
- Quota: `NVIDIA_L4_GPUS` = 1 in europe-west4, `GPUS_ALL_REGIONS` = 1.
- The 11 approved zones are all the EU zones that offer L4 (`gcloud compute accelerator-types list`). Widening the
  search inside the EU therefore adds nothing; any other option is a scope change (section D).

## A. Search envelope (unchanged hardware and zones; new: duration, rounds, two sessions)

| Item | Proposed value |
|---|---|
| Operator | Claude cloud workspace only; one controller (file lock); Cursor and other agents do not create |
| Zones, priority order (by price) | europe-west4-b, -c, -a → europe-west1-b, -c → europe-west2-a, -b → europe-west3-b, -a → europe-west6-b, -c, then repeat |
| Machine / GPU / disk / image | g2-standard-8, 1× L4, 200 GB balanced PD auto-delete, `common-cu129-ubuntu-2204-nvidia-580-v20261029` (pinned; still READY) |
| Spot / other GPU / other region / other provider | **NO** (see section D) |
| Search window | **72 h** from the first attempt |
| Spacing | ≥ 10 min + 0–3 min random jitter between attempts; extra 30 min after each full round of 11 |
| Max create attempts | **240** (≈ 27 rounds; the window normally ends first) |
| Before every create | list instances, disks and unfinished operations; any VM, disk or pending operation → stop for review |
| Ambiguous create (timeout, unknown error) | stop; inspect; never retry while a resource may exist |
| Live VMs | **at most 1**; the search pauses as soon as one exists |
| Lifetime per VM | **300 min** server-enforced DELETE, guest shutdown at 290 min, ≥ 20 min export/teardown reserve |
| Billable sessions | **max 2** (session 1, then session 2, below) |
| Cost ceiling | **USD 8.00 per session, USD 16.00 total**, before tax (a procedure, not a billing cap) |
| Footage | IMG_4809 10 fps proxy only (SHA-256 `b1077af3…fb679c`, 1.41 GB, not the original MOV); uploaded only after a VM exists; deleted at teardown |
| Exports | numeric/text evidence and hashes only; no footage, frames or crops |
| Stop | `python3 gpu_search.py stop "reason"` (durable flag), or say "stop GPU-3" in chat; ends automatically at 72 h, 240 attempts or 2 sessions |

**Failed attempts vs billable sessions.** A stocked-out create returns an error and no VM or disk exists; both
searches so far confirmed this after every attempt (operations end in `ZONE_RESOURCE_POOL_EXHAUSTED`). The
controller still verifies an empty project after each failure, and stops if anything was left behind. Only a
created VM starts billing.

## B. Sessions (frozen commits and archives)

| Session | Purpose | Commits (archive SHA-256) | Steps |
|---|---|---|---|
| 1 | Release behaviour on GPU, and candidate parity on the known identity failures | Part B `84fefc570c001d6909e71ba7ec74fe8dc7755d54` (`4fdc0ea1…`); Part C `0bae8d7ab3d7cd16645684e10500c9934e53cf9f` (`71fd9871…`) | infra smoke (driver ≥ 580, L4, hashes) → Part B full match + 9 labelled intervals + CPU control + repeat (120 min hard) → **Part C1**: the 0bae8d7 resolve on Part B's GPU stage 1 with fresh caches and `SCOUTX_REQUIRE_GPU_OCR=1`: release flags with 4 taps, T+D+C with 4 taps, T+D+C no taps, release flags no taps → export |
| 2 | Historical baseline comparison | Part A `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac` (`308c07a4…`) + Part C intervals | infra → Part A six-profile FP32 matrix, one fresh subprocess per profile (100 min hard) → Part C2 teleport split off/on on intervals 1150, 225 (gpu-fp32-b8) → export |

**Order change vs GPU-2.** GPU-2 ran Part A in the same VM after Part B. The approved phase budgets (35 + 120 + 100 min plus
reserve) do not fit 290 min together with candidate parity. So Part A moves to its own session 2, unchanged in
content. Session 1 runs Part B unchanged and then Part C1 in place of Part A. Part A's purpose stays the same; it runs
later.

## C. Costs (Cloud Billing catalog, list prices, refreshed 2026-11-15)

| Region | g2-standard-8 + L4 + 200 GB, USD/h | 300 min |
|---|---:|---:|
| europe-west4 | 0.927 | 4.64 |
| europe-west1 | 0.970 | 4.85 |
| europe-west2 | 1.005 | 5.02 |
| europe-west3 | 1.039 | 5.19 |
| europe-west6 | 1.204 | 6.02 |

Extras per session, a few cents: GCS storage of ~1.5 GB for at most 5 h, cross-region read of the proxy (bucket is in
europe-west6), result export. API calls and failed creates: no charge. Worst case is 2 × 6.02 + extras ≈ USD 12.2,
below USD 16.

## D. Fallbacks (each a separate yes; not part of GPU-3)

| Option | Price (USD/h, 2026-11-15) | Implications |
|---|---|---|
| D1 Spot L4, same EU zones | 0.57–0.73 | Can be preempted at any time; partial sessions; the result stays comparable (same hardware) |
| D2 On-demand L4 in a non-EU region (e.g. us-central1) | not refreshed | Private footage leaves Europe: needs the privacy review (PRIV-1); comparable hardware |
| D3 Other GPU in the EU (T4 or A100) | not refreshed | Not comparable with L4 numbers; T4 has no FP8/bf16 parity; A100 costs much more |
| D4 Other provider | — | New data processor and contract; privacy review; not comparable infrastructure |

## E. Controller (`workers/football-cv/bench/gcp/gpu3/`)

`gpu_search.py` is a single-owner controller:
- **Ownership:** `flock` on `lock` makes it the only controller.
- **Durable state:** progress lives in `state.json`, and every attempt, zone, time and provider error is appended to
  `attempts.jsonl`.
- **Bounded runs:** each run is a time slice (`--max-runtime-min`) and exits by itself. It is restarted from the saved
  state, so nothing runs as an orphan loop.
- **Pinned scripts:** the startup scripts are SHA-256 pinned in `envelope.json` and checked before every create.
- **Approval gate:** it refuses to run while `approved` is false.

A dry run tested the slicing, resuming, limits, the stop flag and the lock.

**Continuity:** this workspace runs the controller only while a session is active; it stops a few minutes after
replies end, so the search is not continuous then. Gaps appear in `attempts.jsonl` as missing times.

## APPROVAL (fill in)

```
GPU-3 approved (sections A-C exactly):      YES / NO
Search window start:                          on approval / date: ______
Fallbacks D1 / D2 / D3 / D4:                  NO unless written here: ______
```

**Owner answer in chat, 2026-11-15:** "Approve GPU-3 as written". Window starts at the first attempt. Fallbacks D1–D4: NO.

## Session 1 result (2026-11-16) and amendment GPU-3a (APPROVED)

- **Allocation:** attempt 25, europe-west4-a, VM created 04:46:32 UTC. The controller stopped searching at once.
  Inputs were hash-verified on the guest; the proxy (not the MOV) was uploaded 04:47:28–04:48:06.
- **Failure:** every container failed within seconds with `PermissionError: '/out/...'`. The tracker image runs as
  uid 10001 (`USER worker`, Dockerfile line 97–98, same in 51d41c9 and 84fefc5), and the guest script mounted
  root-owned output directories. A harness bug, present since the 2026-11-09 script, which had never run before.
  Part B produced no measurements; Part C1 was skipped (no stage 1).
- **Cleanup:** the guest exported and self-deleted at 05:01:55 UTC (VM and disk gone, verified). The 5 `runs/` objects
  (1.42 GiB, footage and sources) were deleted at about 06:00 UTC. Lifetime ≈ 15.5 min ≈ **USD 0.24** (estimate from
  list price; not billing evidence). Note: the bucket keeps deleted objects for 7 days (soft delete), so the
  proxy is recoverable until about 2026-11-23 unless the owner changes the bucket policy.
- **Fix (harness only, no experiment commit changed):** `/usr/local/bin/drun` gives `/data/out` and `/data/c1` to uid
  10001 before every container start. Reproduced and verified locally (uid 10001 cannot create the work dir
  without it, can with it). New script hashes: s1 `d62ce907…`, s2 `383ec7ad…` (old `dad55a11…`, `75d92649…`).

**GPU-3a asks:** (1) accept the harness fix (new script hashes); (2) allow **3 billable sessions instead of 2**, so
that the failed session does not consume Part A's slot. Aggregate ceiling unchanged at USD 16 (0.24 spent; two more
sessions at most 2 × 6.02 + extras). Window, zones, attempts, lifetime and footage are unchanged.

**Owner answer in chat 2026-11-16: "Approve GPU-3a".** Applied: 3 sessions, spent reconciled to USD 0.24, search resumed 15:05:57 UTC (no attempts 05:02–15:05 UTC). The rerun writes to `results/gpu-validation-gpu3-s1b`; final s1 hash `94a04c1f…`.
