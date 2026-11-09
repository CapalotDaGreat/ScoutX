# GPU validation proposal (2026-11-09) — Session APPROVED for Claude operator

**Status: APPROVED — single operator: Claude cloud workspace.**  
Cursor documents and freezes commits only. Cursor **must not** create VMs, upload footage, or run creates for this session (no `gcloud` in Cursor’s Windows shell; dual operators risk two VMs).

Supersedes the earlier Cursor “Part A only / west3→west6 / USD 6” draft.

## Owner corrections accepted (2026-11-09)

1. **Part B first, then Part A**, each with its own timeout and export. CPU cold full-match was 356 min; L4 is expected to be much faster. Part B decides how tracking ships; Part A explains the pinned GPU gap.  
2. **Add Belgium and London** (never tried; L4 quota present per owner). Prefer west4 first (bucket region).  
3. **Freeze Part B** at tip **`84fefc570c001d6909e71ba7ec74fe8dc7755d54`** (includes host-provenance after `0584c1c` / `01f2650`). Do not silently substitute a newer tip.

## Exact experiment pins

| Role | Commit | Notes |
|---|---|---|
| **Part A (immutable baseline)** | `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac` | FP32 matrix only. Never overwritten. |
| **Part B (release tip)** | `84fefc570c001d6909e71ba7ec74fe8dc7755d54` | Frozen for this session. Includes reliability, coaching gate, unmatched/cross-host audit, host provenance. |
| Prior Part B candidates | `0584c1c`, `01f2650` | Ancestors of the freeze; not the session tip. |

## Order inside the session

| Phase | Commit | Budget (guest) | Stop / export |
|---|---|---|---|
| 0. Infra smoke | Part B image build from `84fefc5` archive (or tip tree on VM) | 15–25 min | Hard fail on missing GPU, CPU fallback in GPU path, hash mismatch |
| 1. **Part B first** | `84fefc5` | **120 min** hard timeout | Cold/labelled IMG_4809 work as in launch prompt; export+manifest; continue only if smoke+Part B allow remaining lifetime |
| 2. **Part A second** | `51d41c9` | **100 min** hard timeout | Six profiles × windows with isolated caches; decoded-frame hashes; same-machine CPU controls |
| 3. Final teardown | — | remainder (≥20 min reserved) | Verify exports; delete `runs/`; delete VM/disks; `cleanup_final.json` |

Server lifetime **300 min** with guest `shutdown -h +290`. If Part B overruns its budget, **skip Part A**, export what exists, tear down. Do not extend lifetime. Do not start Part A without a successful Part B export attempt (success or failed-with-manifest).

## Search envelope

| Item | Value |
|---|---|
| Operator | **Claude cloud workspace only** |
| Hardware | g2-standard-8, 1× NVIDIA L4, 200 GB balanced PD auto-delete |
| Image | `common-cu129-ubuntu-2204-nvidia-580-v20261029` (or family current latest if READY and recorded) |
| Zones, in order | europe-west4-b, europe-west4-c, europe-west4-a, europe-west1-b, europe-west1-c, europe-west2-a, europe-west2-b, europe-west3-b, europe-west3-a, europe-west6-b, europe-west6-c |
| Alternate GPU / Spot | **NO** |
| Max simultaneous VMs | **1** |
| Max create attempts | **11** (one per zone, in order) |
| Search window | **6 h** from first create |
| Backoff | After definitive stockout + empty instance list: 5 / 10 / 20 min before next zone |
| Ambiguous create | List instances/disks/operations; **never** a second create while one may exist |
| Max lifetime | **300 min** server-enforced DELETE |
| Footage | IMG_4809 proxy only (`b1077af3…fb679c`) |
| Uploads | After VM exists; archives first; video after allocation; bounded guest wait |
| Export | numeric/text + hashes only; no private footage/crops |
| Max billable sessions | **1** |
| Cost ceiling | **USD 8.00** before tax (procedure; not a Cloud Billing hard cap) |

## Prices (owner refresh 2026-11-09)

Recorded in `workers/football-cv/bench/results/5.3/gpu-validation-20261109/pricing_owner_refresh_20261109.md`.

| Region | $/h (L4 machine + disk, as reported) | 300 min bound |
|---|---:|---:|
| west4 | 0.93 | ~4.65 |
| west1 | ~0.98 | ~4.90 |
| west2 | 1.01 | ~5.05 |
| west3 | 1.04 | ~5.20 |
| west6 | 1.21 | ~6.10 |

Worst-case among approved zones ≈ **$6.10** at max lifetime before cross-region copy/egress (few cents extra if not west4). Ceiling **USD 8.00** covers that with contingency. Refresh + instance/disk listing immediately before create; **stop if worst case exceeds ceiling**.

Inventory at refresh: **0 VMs, 0 disks**.

## Failure behaviour

- No silent CPU fallback inside GPU profiles.  
- No unapproved source hotfixes.  
- No session extension beyond 300 min.  
- No second VM.  
- Preserve partial results with incomplete status.  
- Cursor does not allocate for this session.

## APPROVAL (filled 2026-11-09)

```
GPU session approved:                     YES
Operator:                                 Claude cloud workspace  (only one; Cursor must not create)
Order inside the session:                 Part B first, then Part A, each with its own timeout; export after each part
Part B commit:                            84fefc570c001d6909e71ba7ec74fe8dc7755d54
Part A commit:                            51d41c9f5f333c7e93a606b7181ba8cb1cee8eac
Zones, in order:                          europe-west4-b, europe-west4-c, europe-west4-a, europe-west1-b, europe-west1-c, europe-west2-a, europe-west2-b, europe-west3-b, europe-west3-a, europe-west6-b, europe-west6-c
Machine / GPU / disk / image:             g2-standard-8, 1× NVIDIA L4, 200 GB balanced PD auto-delete,
                                          common-cu129-ubuntu-2204-nvidia-580-v20261029 (or the family's current latest)
Alternate GPU types / Spot:               NO
Maximum VM lifetime (server-enforced):    300 min
Max create attempts / search window:      11 (one per zone, in order) / 6 h
Cost ceiling, all-in, before tax:         USD 8.00
Footage allowed:                          IMG_4809 proxy only
Maximum billable sessions:                1
Price refresh + instance/disk listing immediately before create: YES; stop if the worst case exceeds the ceiling
```

## Cursor handoff for Claude

1. Ensure `release/pitchproof-5-3-candidate` at **`84fefc5`** (or this docs commit) is reachable for archive/build.  
2. Refresh prices; list instances/disks (`--project=scoutx-230b0`).  
3. Create at most one L4 in zone order; Part B → export → Part A → export → cleanup.  
4. Return export manifests, profile exit codes, costs, and cleanup evidence to the durable ledger.
