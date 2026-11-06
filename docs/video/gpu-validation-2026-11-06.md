# GPU validation session plan (2026-11-06)

**Status: proposal ready. GPU session is not approved.** The APPROVAL block in the launch prompt is still a template (`[YES / NO]`). No VM was created. No footage was uploaded. No cloud resources were changed.

Tip used for Part B archive and dry run: `8e1b63355d725c36e217b3b6df6ce53c93da442e` on `release/pitchproof-5-3-candidate`. Freeze the tip again immediately before any approved launch.

## Exact plan

1. Local cold Linux CPU container job (empty stage-1, empty OCR cache, release defaults, DETOUR off) — **running** at start of this proposal; results go into the evidence ledger when it exits.
2. Read-only cloud inventory + price refresh (no creates).
3. On explicit APPROVAL only: one VM, Part A then Part B in sequence, export, verify, cleanup.

Part A and Part B contents are fixed in section 4 of the launch prompt and are not changed here.

### Part A (unchanged from `docs/video/gpu-fp32-proposal-2026-11-02.md`)

- Commit: `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac`
- Profiles: `cpu-onnx`, `cpu-torch`, `gpu-fp16-b8`, `gpu-fp32-b8`, `gpu-fp32-b1`, `gpu-fp32-b8-repeat`
- Windows: `gap1150`, `3144`, `1073` (automatic; owner anchor for 1073 reported separately)
- Isolated pairs: backend / device / precision / batching / repeatability
- No candidates

### Part B (release tip, `Dockerfile.tracker-gpu`, release defaults)

- Full match IMG_4809, cold (empty stage-1, empty OCR cache)
- 9 labelled intervals, default decoder, cold, twice
- Negative/other clips only if APPROVAL says YES
- On-VM CPU run of the 9 intervals in the same image
- Record per-stage wall, GPU memory peak, host memory peak, device/dtype/providers, decoded-frame hashes
- CPU provider inside a GPU profile is a hard error

## Inputs and hashes

| Input | Value | Verified |
|---|---|---|
| Part A `git archive … workers/football-cv` | SHA-256 `308c07a4e209e7b1dbf344247ce9add9cd80f8366e37a7573e040251e795a62f` (10 772 480 bytes) | yes, matches pin |
| Part B `git archive 8e1b633… workers/football-cv` | SHA-256 `5ecf3efbe1f9b446847e18f510d0c181918030fe1da61511c48ac0158d09a682` (47 667 200 bytes) | yes |
| Video `IMG_4809_proxy_10fps.mp4` | SHA-256 `b1077af3c975e0e1b5d15a9f0dc3895ac87fa296cad4f41d267368c260fb679c` | yes |
| Models | `bench/references/model_hashes.json` (yolox_s, craft, english_g2, parseq) | all four digests match local cache |
| Startup | `workers/football-cv/bench/results/5.3/gpu-validation-20261106/startup.sh` | dry-run exit 0 |
| Dry run | Ubuntu 24.04 container, `SCOUTX_DRY_RUN=1`, tiny lavfi clip | `_DONE` + `export_manifest.json` written; media excluded |

Archives live outside git: `C:\ZLI\M335\ScoutX\.local\gpu-session-20261106\archives\` (hashes in `hashes.json`).

## Profiles, windows, and timeouts (proposed)

| Stage | Budget | Notes |
|---|---|---|
| Guest `shutdown -h` | 290 min | below a 300 min server lifetime |
| Part A matrix | 5400 s | same as the 2026-11-01 harness |
| Part B full match | 7200 s | cold extract + resolve on L4 |
| Part B intervals (GPU ×2 + CPU) | 3600 s each envelope | separate out dirs and OCR caches |
| Export margin | remainder of lifetime | `_DONE` always attempted |

Together these fit a **300 min** server-enforced lifetime with margin. If the owner picks a shorter lifetime, the budgets must be cut before create.

## Cost table (list USD, before tax; estimate is not a cap)

Refreshed **2026-11-06T22:47:09Z** from the Cloud Billing Catalog API (`workers/football-cv/bench/results/5.3/gpu-validation-20261106/fetch_pricing.py` → `pricing_20261106.json`). Same list rates as 2026-11-03. Refresh again immediately before create.

| Item | Per hour | 60–90 min expected | 300 min max lifetime |
|---|---|---|---|
| g2-standard-8 compute | $0.3086 | $0.31–$0.46 | $1.54 |
| NVIDIA L4 | $0.5886 | $0.59–$0.88 | $2.94 |
| 200 GiB balanced PD | $0.0301 | $0.03–$0.05 | $0.15 |
| Ephemeral external IPv4 | $0.005 | $0.01 | $0.03 |
| **Compute subtotal** | **$0.9323** | **$0.93–$1.40** | **$4.66** |
| GCS storage (video ~1.32 GiB, same-day delete) | — | < $0.01 | < $0.01 |
| Results egress (≤ 0.5 GiB @ $0.12/GiB) | — | ≤ $0.06 | ≤ $0.06 |
| **Worst-case total at max lifetime** | — | — | **≈ $4.72** |

Proposed approval ceiling: **USD 8.00 before tax** (leaves headroom above $4.72). This is an approval limit enforced by procedure, not a Cloud Billing budget. The estimate is not a cap.

## Enforcement table

| Control | How |
|---|---|
| Max VM lifetime | **Server:** `--max-run-duration` + `--instance-termination-action=DELETE` |
| Guest stop before server kill | **Guest:** `shutdown -h +290` (or the approved value minus margin) |
| Boot disk cleanup | **Server:** boot-disk auto-delete |
| At most one VM | **Procedure:** list every approved zone before create or retry; never a second create while one may exist |
| Cost ceiling | **Procedure:** refresh prices; refuse create if max-lifetime estimate exceeds the approved ceiling; stop when `_DONE` arrives |
| Commit pin | **Guest:** image label + `--expected-commit`; archive SHA checked before build |
| Footage lifetime | **Procedure:** upload only after VM exists; delete `runs/` after manifest verify |
| Device fallback | **Harness:** CPU provider inside a GPU profile is a hard error |
| Export on failure | **Guest:** `trap` exports manifest + `_DONE` with status, then deletes the VM |

## Cleanup procedure

1. Wait for `gs://scoutx-230b0-benchmarks/results/gpu-validation-20261106/_DONE`.
2. Download the export; verify every SHA-256 in `export_manifest.json`.
3. Delete this run’s `runs/gpu-validation-20261106/**` (source archives + footage).
4. Confirm the VM and its disk are gone; delete manually if needed.
5. Re-list instances, disks, snapshots, and the bucket; save `cleanup_final.json`.
6. Record actual lifetime and computed cost against the ceiling.

## Local cold Linux CPU job

- Image: `pitchproof-tracker-cpu:measure` (Ubuntu 24.04 + the CPU package set used for the 2026-11-06 resolve peak). **Not** `Dockerfile.tracker-gpu` (CUDA build assert; this host has no NVIDIA driver).
- Flags: C on, E off, D not promoted, A/B off, DETOUR off, `PYTHONHASHSEED=0`.
- Empty stage-1, empty OCR cache. Overnight wall time expected. **In progress** as of this commit (discovery after model init).
- Peak memory is sampled per phase (cgroup `memory.max_usage_in_bytes` / observed current).
- Field-level compare to the Windows baseline timeline (states, boxes, evidence, presence); ignore one-ulp `speed` differences.
- **The GPU worker image’s memory is not yet measured.** Only the CPU measurement image has a container peak so far (resolve-only 1275.5 MiB on 2026-11-06). Part B on L4 is required for the GPU image figure.

Artifacts: `C:\ZLI\M335\ScoutX\.local\fm-linux-cold-20261106\`.

## Read-only cloud check (2026-11-06T22:45Z)

Saved as `workers/football-cv/bench/results/5.3/gpu-validation-20261106/cleanup_check.json`:

- instances 0, disks 0, snapshots 0, custom images 0
- bucket: 111 objects under `results/` only; no `runs/` prefix
- `NVIDIA_L4_GPUS` limit 1, usage 0 in europe-west3/4/6
- image `common-cu129-ubuntu-2204-nvidia-580-v20261029` READY (family also has a newer Ubuntu 24.04 sibling READY)
- `nvidia-l4` listed in europe-west4-a/b/c and europe-west3-a/b (and previously west6-b/c)

## Readiness dry run

Command (2026-11-06): Docker `ubuntu:24.04` with `SCOUTX_DRY_RUN=1`, Part A/B archives bind-mounted, tiny lavfi `tiny.mp4`.

- Exit: **0**
- Wrote `_DONE` (`exportComplete: true`, `dryRun: true`) and `export_manifest.json` with `mediaExcluded: true`
- Proves export, manifest and cleanup paths only — not GPU behaviour

## Proposed APPROVAL block (for the owner to fill)

```
GPU session approved:                     YES
Zones, in order:                          europe-west4-b, europe-west4-c, europe-west4-a
Machine / GPU / disk / image:             g2-standard-8, 1× NVIDIA L4, 200 GB balanced PD auto-delete,
                                          common-cu129-ubuntu-2204-nvidia-580-v20261029 (or family latest if still READY)
Commits:                                  Part A 51d41c9f5f333c7e93a606b7181ba8cb1cee8eac;
                                          Part B <freeze tip at launch; currently 8e1b63355d725c36e217b3b6df6ce53c93da442e>
Maximum VM lifetime (server-enforced):    300 min
Cost ceiling, all-in, before tax:         USD 8.00
Footage allowed:                          IMG_4809 proxy (b1077af3…fb679c); IMG_5105 / IMG_4529: NO unless named YES
Maximum number of VM create attempts:     4
```

Until that block is filled with YES and concrete values, no create runs.
