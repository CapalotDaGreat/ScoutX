# GPU-2 (APPROVED): renew the L4 search for the already approved plan (2026-11-15)

**Why:** the approved 2026-11-09 envelope (`docs/video/gpu-validation-proposal-2026-11-09.md`) is exhausted. All 11
create attempts were made on 2026-11-09 between 15:38 and 18:39 UTC, every one `ZONE_RESOURCE_POOL_EXHAUSTED`. No VM,
disk or upload was ever created and nothing was billed. Its attempt count and 6 h window are used up, so a new search
needs a new approval. Nothing else changes.

**Verified 2026-11-15 17:25 UTC:** project `scoutx-230b0`; 0 instances, 0 disks; the only recent operations are the 11
failed inserts of 2026-11-09; no other operator is running anything; the bucket `scoutx-230b0-benchmarks` holds only old
result manifests. europe-west4 price refreshed: about USD 0.927/h for g2-standard-8 + 200 GB balanced PD, so the
300-minute bound is about USD 4.65 in west4 and USD 6.05 in the dearest approved region (west6, 2026-11-09 rate).

## What to approve (fill in)

```
GPU-2 session approved:                   YES / NO
Operator:                                 Claude cloud workspace only
Plan:                                     unchanged from 2026-11-09 (Part B then Part A, separate timeouts, export after each)
Part B commit:                            84fefc570c001d6909e71ba7ec74fe8dc7755d54
Part A commit:                            51d41c9f5f333c7e93a606b7181ba8cb1cee8eac
Zones, in order:                          europe-west4-b, europe-west4-c, europe-west4-a, europe-west1-b, europe-west1-c,
                                          europe-west2-a, europe-west2-b, europe-west3-b, europe-west3-a, europe-west6-b, europe-west6-c
Machine / GPU / disk / image:             g2-standard-8, 1x NVIDIA L4, 200 GB balanced PD auto-delete,
                                          common-cu129-ubuntu-2204-nvidia-580 family (exact image recorded at create)
Alternate GPU types / Spot / other providers: NO
Max create attempts / search window:      11 (one per zone) / 6 h from the first attempt, START DATE: ________
Backoff after a definitive stockout:      5 / 10 / 20 min, instance and disk list empty before every next attempt
Maximum VM lifetime (server-enforced):    300 min DELETE, guest shutdown at 290 min, >= 20 min export/teardown reserve
Max simultaneous VMs / billable sessions: 1 / 1
Cost ceiling, all-in, before tax:         USD 8.00 (a procedure, not a billing cap)
Footage allowed:                          IMG_4809 10 fps proxy only (SHA-256 b1077af3...fb679c), uploaded after allocation,
                                          deleted at teardown
Exports:                                  numeric/text evidence and hashes only; no footage, crops or frames
```

## Optional addition (separate yes/no)

```
Part C (experimental, only if Part B and Part A finish with >= 40 min of lifetime left, still inside the 300 min):
  commit 0bae8d7ab3d7cd16645684e10500c9934e53cf9f (exp/analysis-dev-2026-11-14), CUDA FP32 batch 8,
  SCOUTX_TELEPORT_SPLIT=1 with and without, IMG_4809 diagnostic windows only, fresh caches:   YES / NO
```

Part C is not part of the earlier approval and will not run without its own yes. Without GPU-2 nothing is allocated;
local CPU work continues (`docs/video/analysis-experiments-2026-11-14.md`).

## APPROVAL (owner, in chat, 2026-11-15)

Owner answer to the GPU-2 question: **"Yes, GPU-2 + Part C"** (recorded 2026-11-15 17:26 UTC). GPU-2 session: YES. Part C: YES.
Search window: 6 h from the first create attempt. Everything else exactly as in the block above.

## Frozen ordered plan (guest script `startup.sh`, archives reproduced with `git archive <sha> workers/football-cv`)

| # | Phase | Commit | Inputs / windows | Budget | Evidence | Stop |
|---|---|---|---|---|---|---|
| 0 | infra: driver >= 580, L4 present, docker + toolkit, input hashes | — | archives A `308c07a4…`, B `4fdc0ea1…`, C `71fd9871…`, tool `c2910667…`, proxy `b1077af3…` | 35 min incl. upload wait | `nvidia-smi`, `gpu.txt`, `timestamps.txt` | any hash or GPU check fails → export, delete |
| 1 | Part B: historical release candidate on the GPU image (production flags) | `84fefc5` | full IMG_4809 match; then labelled intervals 225 1150 1295 1890 400 600 1500 1680 1800 (gpu-fp16-b8); CPU-ONNX same-image control 225, 1150; GPU repeat 225 | 120 min hard | `full_match.json`, envinfo, per-interval json/exit codes, GPU/mem samples | timeout or < 5 min left per step → skip, export |
| 2 | Part A: immutable baseline six-profile matrix, one fresh subprocess + empty caches each | `51d41c9` | windows gap1150 (1150–1180), 3144 (1880–1925), 1073 (1050–1085); cpu-onnx, cpu-torch, gpu-fp16-b8, gpu-fp32-b8, gpu-fp32-b1, gpu-fp32-b8-repeat | 100 min hard; start only with >= 45 min left | `fp32/*` diagnostics, decoded-frame hashes, `matrix_exit.txt` | timeout → partial manifest |
| 3 | Part C: experimental teleport split off/on | `0bae8d7` | intervals 1150, 225; gpu-fp32-b8, fresh out dirs | only with >= 40 min left | per-interval json/exit codes | < 5 min per step → skip |
| 4 | export + teardown | — | numeric/text only, stage 1, crops and media excluded | >= 20 min reserve | `export_manifest.json`, `_DONE`, then operator: delete `runs/…` uploads, verify 0 VMs/disks | — |

Image pinned to `common-cu129-ubuntu-2204-nvidia-580-v20261029` (READY on 2026-11-15; family latest is v20261111,
not used, so Part A stays comparable). The historical baseline is Part A; the current engine candidate is Part B;
the experimental variant is Part C. OCR-variant and owner-anchor candidates need taps and the combined cache, so they
stay local (CPU replays, identical results expected because stage 1 is reused).
