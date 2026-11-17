# PitchProof GPU + full-match durable ledger (2026-11-09)

**Worktree:** `C:\ZLI\M335\ScoutX-gpu-benchmark`  
**Branch:** `release/pitchproof-5-3-candidate`  
**Immutable GPU baseline:** `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac`  
**Part B freeze (this session):** `84fefc570c001d6909e71ba7ec74fe8dc7755d54`

Update this file after every meaningful experiment. Do not treat stockout or a plan as completion.

---

## Active authorization

| Field | Value |
|---|---|
| Approved search envelope | **YES** — see `docs/video/gpu-validation-proposal-2026-11-09.md` |
| Operator | **Claude cloud workspace only** (Cursor must not create) |
| Order | Part B first (`84fefc5`), then Part A (`51d41c9`), separate timeouts, export after each |
| Zones | west4-b/c/a → west1-b/c → west2-a/b → west3-b/a → west6-b/c (11 attempts) |
| Lifetime / ceiling | 300 min / USD 8.00 before tax |
| Active VM / disks | 0 / 0 (verified 2026-11-15 17:25 UTC: `instances list`, `disks list` empty; last operations are the 11 failed inserts of 2026-11-09) |
| Footage uploaded | Never (upload was gated on a VM existing) |
| Estimated compute charge | USD 0 (no VM was ever created) |
| **Envelope status** | **EXHAUSTED on 2026-11-09**: all 11 approved attempts used inside the 6 h window, every one `ZONE_RESOURCE_POOL_EXHAUSTED`. A new search needs a renewed approval (`docs/release/gpu-session-request-2026-11-15.md`) |
| **GPU-2 (2026-11-15)** | Approved with Part C; **EXHAUSTED** the same day (11/11 stockouts) |
| **GPU-3 (2026-11-15)** | **APPROVED as written** (`docs/release/gpu-session-request-gpu3-2026-11-15.md`): 72 h, ≤ 240 attempts, 1 VM, 2 sessions, USD 8/session, USD 16 total; controller `workers/football-cv/bench/gcp/gpu3/`, live state in its `state.json`/`attempts.jsonl` |

---

## Capacity attempts

| When | Zones | Result | Charge |
|---|---|---|---|
| 2026-11-07 | west4-b/c/a (+retry) | STOCKOUT ×4 | USD 0 |
| 2026-11-15 17:26–20:27 UTC (Claude, GPU-2) | all 11 approved zones in order, backoff 5/10/20 min | **STOCKOUT ×11** (`ZONE_RESOURCE_POOL_EXHAUSTED`); 0 VMs, 0 disks, 0 uploads, no pending operations verified 20:30 UTC; evidence `workers/football-cv/bench/results/5.3/gpu-validation-20261115/` | USD 0 |
| 2026-11-09 15:38–18:39 UTC (Claude) | all 11 approved zones in order, backoff 5/10/20 min | **STOCKOUT ×11** (`ZONE_RESOURCE_POOL_EXHAUSTED`, g2-standard-8 + 1× L4); 0 VMs, 0 disks, 0 uploads verified after; evidence `workers/football-cv/bench/results/5.3/gpu-validation-20261109/SESSION_OUTCOME.json`, `attempts.log` | USD 0 |

---

## Experiment commits

| Role | SHA | Status |
|---|---|---|
| Part A baseline | `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac` | Immutable |
| Part B freeze | `84fefc570c001d6909e71ba7ec74fe8dc7755d54` | **Authorized for Claude session** |
| Cold Linux CPU | `8e1b63355d725c36e217b3b6df6ce53c93da442e` | Complete (CPU reference) |
| Reliability gate | `0584c1c…` | Ancestor of Part B freeze |
| Host provenance / audit | `01f2650…` | Ancestor of Part B freeze |

---

## Prices (2026-11-09 owner refresh)

| Region | $/h | Notes |
|---|---:|---|
| west4 | 0.93 | Bucket region |
| west1 | ~0.98 | Newly added; never tried |
| west2 | 1.01 | Newly added; never tried |
| west3 | 1.04 | |
| west6 | 1.21 | 300 min ≈ $6.10 worst among list |

Evidence: `workers/football-cv/bench/results/5.3/gpu-validation-20261109/pricing_owner_refresh_20261109.md`.

---

## Verified vs uncertain

### Verified (local / owner read-only)

- Cold Linux: 313/0/31/160 of 504 T frames; peak ~2.4 GB; no crash; production-relevant CPU reference.
- Unmatched audit: 30 alignment / 1 uncertain @ 244.4 s.
- Cross-host: decoded-pixel divergence; host provenance on new checkpoints.
- Coaching fixture path; not live device.
- Owner: 0 VMs / 0 disks; refreshed regional $/h.

### Uncertain until Claude session completes

- L4 Part B behaviour of `84fefc5`.
- L4 Part A matrix on `51d41c9`.
- Whether both parts finish inside 300 min (Part B timeout protects Part A).

---

## Cursor role this session

- Update docs, freeze commits, **do not allocate**.  
- No `gcloud` in Cursor Windows shell.  
- Dual operators forbidden.

## Status 2026-11-15

- The 2026-11-09 envelope is used up (11 of 11 attempts, window closed). Its "1 billable session" was never consumed,
  but attempts and window are the binding limits, so no allocation was made on 2026-11-15.
- Prices refreshed 2026-11-15 (Cloud Billing catalog): europe-west4 G2 core 0.026264, RAM 0.003077 /GiB, L4 0.58863,
  balanced PD 0.11 /GiB-month → g2-standard-8 + 200 GB ≈ USD 0.927/h, unchanged.
- Renewal request with the same plan: `docs/release/gpu-session-request-2026-11-15.md` (GPU-2).

## GPU-3 status (live state: `/home/claude/work/gpusearch/state.json`, mirrored here at each update)

- 2026-11-15 22:24 UTC: attempts 3 of 240 (west4-b, west4-c, west4-a: `ZONE_RESOURCE_POOL_EXHAUSTED`, project
  verified empty after each); window 21:49 UTC 15 Nov → 21:49 UTC 18 Nov; sessions 0 of 2; spent USD 0.
- 2026-11-16 03:50 UTC: attempts 22 of 240, 2 full rounds, every attempt `ZONE_RESOURCE_POOL_EXHAUSTED`, project
  empty after each; sessions 0; USD 0. Gap with no attempts: 15 Nov 22:24–23:44 UTC (workspace idle).
- 2026-11-16 19:52 UTC: attempts 45 of 240; session 1 used (attempt 25, failed on permissions, USD ≈ 0.24, cleaned
  up); GPU-3a approved; since the resume at 15:06 UTC every attempt stocked out. Sessions left 2; no VM; USD ≈ 0.24.
- 2026-11-17 01:20 UTC: attempts 67 of 240 (6 rounds); one allocation so far (attempt 25, 16 Nov 04:46 UTC); all
  42 attempts since the resume stocked out. Workspace restarts at 16 Nov 20:42 and 22:28 UTC ended the controller; it
  was restarted from `state.json` each time after an empty inventory check. Stale session-1 upload markers were
  archived (`s1-upload_*.txt`) so that the next VM gets its inputs.
- 2026-11-17 12:39 UTC: attempts 93 of 240 (8 rounds), all stockouts since the resume; project empty; USD ≈ 0.24;
  sessions left 2. **No attempts 08:03–12:39 UTC** (the workspace was idle and the controller had ended). Slice
  restarted 12:39; window ends 2026-11-18 21:49 UTC. `check.sh` renews the bounded runner and the watcher.
- **Authorization check 2026-11-17 12:45 UTC** (against `docs/release/gpu-session-request-gpu3-2026-11-15.md`):
  - Matches the record: 11 EU zones in the approved order; g2-standard-8 + 1× standard L4 with the pinned image;
    D1–D4 off; 1 live VM; 300 min server lifetime; USD 8 per session and USD 16 total; 72 h / 240 attempts; window
    start 2026-11-15 21:49:47 UTC, so the deadline is **2026-11-18 21:49 UTC** (it was never reset); IMG_4809 proxy
    only; numeric exports only.
  - **Discrepancy:** the 2026-11-17 brief says "at most two billable sessions". The record has **three**: GPU-3a,
    approved in chat 2026-11-16, after session 1 failed on a harness bug. Following the record (1 used, 2 left).
    The owner can lower it to two with `envelope.json` → `maxBillableSessions: 2` or by saying so.
- Input check 2026-11-17: archives A, B, C, the tool and the proxy all match `inputs.sha256`. Script hashes:
  s1 `94a04c1f…` (rerun, results prefix `-s1b`), s2 `383ec7ad…`.
- Prices refreshed 2026-11-17 12:43 UTC (unchanged): 300 min costs ≤ USD 6.02 in the dearest zone (west6), within
  USD 8. A lifetime limit is not a billing cap.
- `check.sh` (used by scheduled continuations) now refuses to start anything after the deadline, at the attempt,
  session or budget limit, with a STOP flag, or while a controller already runs.
- The controller runs in 115-minute slices. A follow-up is scheduled into this conversation every ~110 min to start
  the next slice. Between slices, and whenever this workspace is not running, **no attempts happen**; gaps are
  visible in `attempts.jsonl`.
- Resume by hand: `cd workers/football-cv/bench/gcp/gpu3 && python3 gpu_search.py status` then
  `python3 gpu_search.py run --max-runtime-min 115` (state files must be copied from the workspace first).
  Stop: `python3 gpu_search.py stop "reason"` or say "stop GPU-3".
- Local pre-allocation checks done: script syntax, config parsing, export filter (stage 1, crops and media excluded),
  input hashes; the candidate tree with flags off reproduces the release tap failure locally (`c1_off_t4`).

## Next executable action (historical, GPU-2)

1. Refresh prices + list instances/disks (`--project=scoutx-230b0`).  
2. Create ≤1 L4 in zone order under the APPROVAL.  
3. Part B (`84fefc5`) → export → Part A (`51d41c9`) → export → cleanup.  
4. Append results, costs, cleanup to this ledger.

## GPU-3 session 2 (2026-11-17): complete

- **Run:**
  - Attempt 110 created `pp-gpu-val-gpu3` in europe-west6-b at 18:22:32 UTC.
  - Machine: 8 vCPU + NVIDIA L4. Image torch 2.14.1, onnxruntime-gpu 1.29.0, docTR 1.1.0.
  - Startup script s1 with the `drun` permission fix; inputs verified by checksum.
  - Finished 20:05:24 with exit 0; the VM was deleted at 20:06:42.
- **Cleanup verified:** 0 instances and 0 disks in `scoutx-230b0`; `runs/gpu-validation-gpu3/` inputs were deleted (including the footage proxy). Results are under `results/gpu-validation-gpu3-s1b/` and exported to `bench/results/5.3/gpu3-s2-20261117/` (no footage).
- **Cost:** estimated **USD 1.95** (1.74 h). Reconciled `spentUsdEstimate` = USD 2.19 (session 1 USD 0.24 + session 2).
- **Search stopped** (STOP flag). The owner brief says 2 sessions while the record says 3 (GPU-3a). A third session needs explicit owner confirmation.

**Timing:** release (E0), IMG_4809, 33.9 min at 10 fps.

| Stage | CPU (2 cores) | GPU (L4, 8 vCPU) | Speed-up |
|---|---|---|---|
| Discovery / detection | 2,532 s | 510 s | 5.0× |
| Resolve / identity | 1,582 s | 231 s | 6.8× |
| Peak RSS | 1,761 MiB | 3,052 MiB | — |
| End-to-end | — | 1,876 s (1.08× real time) | — |

**Accuracy parity:** release benchmark summary.

| Run | Claimed correct | Confirmed correct | Wrong identity | IDF1 |
|---|---|---|---|---|
| CPU | 25.3 s | 2.3 s | 1.1 s (LIKELY, 1,301.6–1,305.7 s) | 0.659 |
| GPU | 24.9 s | 10.0 s | 0.0 s | 0.661 |

**Candidate replays** (same cached stage-1 inputs on each side; `compare_frames.py`, CPU → GPU):
- T+D+C + 4 taps: correct 406 → 318; 88 correct→abstain; no new wrong-player frames.
- T+D+C without taps: correct 307 → 272; 69 correct→abstain, 34 abstain→correct; no new wrong-player frames.

**Reading:**
- **Parity is not exact.** The GPU path is safer or equal on wrong-player attribution in every run, but it abstains more on the candidates.
- The CPU and GPU differ in fp16 inference and OCR/embedding numerics, so the identity decisions differ.
- A promotion proposal needs the remaining gap explained (the likely source is the OCR read thresholds under fp16). Until then, the CPU numbers above are not a production forecast.
