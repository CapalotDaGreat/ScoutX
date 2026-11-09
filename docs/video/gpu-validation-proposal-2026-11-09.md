# GPU validation proposal (2026-11-09)

**Status: PROPOSAL ONLY — awaiting explicit owner approval.**  
Previous approvals (2026-11-01, 2026-11-07) do **not** authorize this session. The 2026-11-07 west4 envelope was filled and exhausted by stockout; estimated compute charge **USD 0**; no VM, no uploads.

## Why a new approval is required

| Prior session | Outcome |
|---|---|
| 2026-11-07 APPROVAL | 4× L4 create attempts in europe-west4-b/c/a → STOCKOUT. `session-state.json`: `stockout_exhausted`. |
| Part A profiles on `51d41c9` | **Never completed** on a GPU host. |
| Part B full match on tip | **Never started** (no VM). |
| Local cold Linux CPU | Completed 2026-11-07 on `8e1b633` (see ledger). Does not substitute for the L4 matrix. |

## Exact experiment pins (do not silently replace)

| Role | Commit | Notes |
|---|---|---|
| **Immutable GPU baseline (Part A)** | `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac` | FP32 comparison only. Never overwritten by later fixes. |
| **Part B candidate (after local reliability commit)** | *freeze at approval time* to the tip that contains the detector-close / atomic-discovery / coaching-contact fixes | Must be named in the APPROVAL block. |
| Prior Part B freeze (superseded for a new session) | `3381371014d37c91072ff257f280593df374b977` | Used only by the stocked-out 2026-11-07 session. |

## Inputs (re-verified 2026-11-09)

| Input | Value | Verified |
|---|---|---|
| Video `IMG_4809_proxy_10fps.mp4` | SHA-256 `b1077af3c975e0e1b5d15a9f0dc3895ac87fa296cad4f41d267368c260fb679c` (1 413 632 177 bytes) | yes |
| Part A archive pin | SHA-256 `308c07a4e209e7b1dbf344247ce9add9cd80f8366e37a7573e040251e795a62f` | matches prior pin |
| Models | `bench/references/model_hashes.json` | local cold run matched all four |
| Decoder | default OpenCV (`SCOUTX_DECODER` unset) | HDR conditions separate |
| Flags (Part B) | C on, E off, D not promoted, A/B off, DETOUR off unless APPROVAL says otherwise | release defaults |

## Search envelope (needs approval)

| Item | Proposed value |
|---|---|
| Preferred hardware | **g2-standard-8, 1× NVIDIA L4**, 200 GB balanced PD auto-delete |
| Image | `common-cu129-ubuntu-2204-nvidia-580-v20261029` |
| Zones, priority order | **1.** europe-west3-b **2.** europe-west3-a **3.** europe-west6-b **4.** europe-west6-c |
| Why these zones | west4-a/b/c stocked out on 2026-11-07. Prefer west3 next (same continent, prior catalogue listing). west6 last. |
| Alternate GPU types | **NO** (keep L4-only so results remain comparable to the 2026-10-29 L4 run) |
| Max simultaneous VMs | **1** |
| Max create attempts | **6** (bounded backoff: 5 min, 10 min, 20 min between zone retries after definitive stockout + empty instance list) |
| Search window | **6 hours** wall clock from first create attempt |
| Max lifetime per VM | **300 min** server-enforced (`--max-run-duration` + `DELETE`) |
| Guest stop | `shutdown -h +290` |
| Max billable sessions | **1** |
| Cost ceiling (procedure, before tax) | **USD 8.00** (estimate at max lifetime ≈ USD 4.72 at 2026-11-06 list rates; refresh prices immediately before create) |
| Footage | IMG_4809 proxy only. IMG_5105 / IMG_4529: **NO** |
| Uploads | archives first after VM exists; video only after allocation succeeds |
| Export | numeric/text + hashes only; **no** private footage/crops in results |
| Cleanup | delete `runs/` objects, confirm 0 instances/disks, save `cleanup_final.json` |

Quota and catalogue presence do **not** establish live capacity.

## Scope once a VM exists

### Infrastructure smoke (must pass before profiles)

- GPU visible; CUDA runtime; no silent CPU fallback inside GPU profiles
- Model/video/archive hash checks
- Export + teardown paths

### Part A — baseline `51d41c9` (isolated caches/out dirs)

1. CPU ONNX FP32 batch 1  
2. CPU Torch FP32 batch 1  
3. CUDA Torch FP16 batch 8  
4. CUDA Torch FP32 batch 8  
5. CUDA Torch FP32 batch 1  
6. CUDA Torch FP32 batch 8 repeat (fresh caches)  

Windows: `gap1150`, `3144`, `1073`. Capture decoded-frame hashes.

### Part B — named tip only if lifetime remains

- Cold full match IMG_4809 (empty stage-1, empty OCR cache), release defaults  
- 9 labelled intervals ×2 on GPU + on-VM CPU control in the same image  
- Record per-stage wall, GPU/host memory peaks, providers/device/dtype  

If lifetime is insufficient for Part B, stop after Part A export/cleanup and request a separate Part B session.

## Cloud CLI note (this machine)

`gcloud` is **not** on PATH in the current Windows agent shell. Last verified empty resource state is `final_instances.json` / `final_disks.json` from 2026-11-07 (`[]`). Before any create under a new approval, re-run authenticated read-only inventory from a shell that has the Cloud SDK.

## APPROVAL template (fill to authorize)

```
GPU session approved:                     YES / NO
Zones, in order:                          europe-west3-b, europe-west3-a, europe-west6-b, europe-west6-c
Machine / GPU / disk / image:             g2-standard-8, 1× NVIDIA L4, 200 GB balanced PD auto-delete,
                                          common-cu129-ubuntu-2204-nvidia-580-v20261029
Alternate GPU types:                      NO
Part A commit:                            51d41c9f5f333c7e93a606b7181ba8cb1cee8eac
Part B commit:                            <exact tip SHA after reliability candidate>
Maximum VM lifetime (server-enforced):    300 min
Max create attempts / search window:      6 / 6 h
Cost ceiling, all-in, before tax:         USD 8.00
Footage allowed:                          IMG_4809 proxy (b1077af3…fb679c); IMG_5105 / IMG_4529: NO
Maximum billable sessions:                1
```
