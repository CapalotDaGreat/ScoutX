# PitchProof GPU + full-match durable ledger (2026-11-09)

**Worktree:** `C:\ZLI\M335\ScoutX-gpu-benchmark`  
**Branch:** `release/pitchproof-5-3-candidate`  
**Immutable GPU baseline:** `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac`  
**Default ScoutX checkout** (`C:\ZLI\M335\ScoutX` on `main`) is older and must not be used for this work.

Update this file after every meaningful experiment. Do not treat stockout or a plan as completion.

---

## Active authorization

| Field | Value |
|---|---|
| Approved search envelope | **NONE** (2026-11-07 exhausted by stockout) |
| Next proposal | `docs/video/gpu-validation-proposal-2026-11-09.md` |
| Active VM / disks | Last evidence: 0 / 0 (2026-11-07). `gcloud` unavailable in this agent shell — re-check before create. |
| Footage uploaded | No |
| Estimated compute charge | USD 0 (no VM) |

---

## Capacity attempts

| When | Zones | Result | Charge |
|---|---|---|---|
| 2026-11-07 | west4-b, west4-c, west4-a, west4-b retry | STOCKOUT ×4 | USD 0 |

**Next retry:** only after the 2026-11-09 APPROVAL block is filled. Prefer west3 then west6 (L4 only).

---

## Experiment commits

| Role | SHA | Status |
|---|---|---|
| GPU comparison baseline | `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac` | Immutable |
| 2026-11-07 Part B freeze | `3381371014d37c91072ff257f280593df374b977` | Stockout; no GPU data |
| Cold Linux CPU full-match | `8e1b63355d725c36e217b3b6df6ce53c93da442e` | **Complete** (see below) |
| Reliability + coaching candidate | `0584c1c177831fa362791739ed3494f406fae55f` | Local fixes + docs; **not** authorized for GPU until APPROVAL names it |

---

## Completed profiles / runs

### GPU matrix on L4 for `51d41c9`

| Profile | Status |
|---|---|
| cpu-onnx / cpu-torch / gpu-fp16-b8 / gpu-fp32-b8 / gpu-fp32-b1 / gpu-fp32-b8-repeat | **Not run** (stockout) |

Older 2026-10-29 L4 balanced FP16 run exists on a different commit and **failed** the CPU-relative accuracy gate. It is not this matrix.

### Cold Linux CPU full-match (`fm-linux-cold-20261106`)

| Check | Result |
|---|---|
| Exit | 0, `status=complete`, `timingComplete=true` |
| Frames | 20350 / 20350, resumedChunks 0 |
| Video / models | SHA matched; models ok |
| Flags | DETOUR=0, E=0, C=1, A/B=0, D not promoted |
| Wall | 21359.427 s (discovery 3094.8, extract 16882.5, resolve 897.6) |
| Peak RSS | 2089.2 MiB; cgroup max 2473242624 B ≈ 2358.6 MiB |
| Labelled T IoU≥0.5 | **313 correct / 0 wrong-player / 31 unmatched / 160 abstained of 504** |
| Recall / IDF1 | 0.621 / 0.766 |
| Aggregate wrong-identity sec | 0.0 |

**Interpretation:** the 2026-11-05 Windows cold baseline allocator failure (`alloc_cpu.cpp`, ~6.39 h, exit 2) is **repaired for cold Linux CPU** under the memory/session fixes. This is **not** an L4 result and **not** full-match accuracy validation beyond the labelled intervals.

**Confounder vs Windows resolve-only (`4d4d860`):** every stage-1 chunk hash differs despite the same settings fingerprint. Cold Linux ≠ resumed Windows chunks. Do not treat the recall lift (0.442 → 0.621) as a pure identity-logic improvement.

### Windows resolve-only 2026-11-06 (prior)

Resumed failed-run chunks; DETOUR=0 and DETOUR=1 both exit 0. DETOUR non-selective → remains experimental, default off.

---

## Open accuracy / reliability items

| ID | Item | Status |
|---|---|---|
| P | Pause-and-resume wrong claim | Strict xfail; A/B off |
| Exchange residual | Confirmed wrong-player 244.5–245.8 on Windows resolve | Cold Linux: those T frames match T as LIKELY; different extract |
| #6 / #17 | Appearance-only windows | Opt-in full-match skips; D not promoted |
| Stage-1 nondeterminism | Same fingerprint, different chunk hashes across hosts/runs | Documented; decoded-frame hashes required on GPU |
| GPU gap | CUDA vs CPU accuracy | **Unmeasured** on `51d41c9` |

---

## Local fixes this pass (candidate)

Demonstrated defects → smallest changes:

1. `extract()` closes detector in `finally` (retry must not keep prior session).  
2. Torch `Detector.close()` + `cuda.empty_cache()` when on GPU.  
3. Atomic `discovery.json` write.  
4. Scoped `np.load` for `scene.npz` and `timeline.npz`.  
5. Coaching `involvement_improve` requires `contactsConfirmedIdentity > 0`.  

Tests: worker focused suite 33 passed / 6 xfailed; `matchReview` + unit suite 740 passed.

---

## Cleanup status

| Resource | Status |
|---|---|
| 2026-11-07 VM/disks | Never created |
| Bucket `runs/` for that session | Never uploaded |
| Orphan check | Pending Cloud SDK on this host |

---

## Next executable action

1. Owner fills APPROVAL in `docs/video/gpu-validation-proposal-2026-11-09.md`.  
2. From a shell with `gcloud`: refresh prices; list instances/disks/quotas; create at most one L4 in the approved zone order with server lifetime + auto-delete.  
3. Run Part A on `51d41c9`; Part B only if lifetime remains and APPROVAL names the tip.  
4. Export, verify manifests, delete runs/VM/disks, record costs.

Until then: continue local identity work; do **not** allocate.
