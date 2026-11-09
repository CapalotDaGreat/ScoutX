# GPU validation proposal (2026-11-09, revised after local audit)

**Status: PROPOSAL ONLY — awaiting explicit owner approval.**  
Previous approvals (2026-11-01, 2026-11-07) do **not** authorize this session. No allocation or footage upload was performed during the 2026-11-09 local audit.

## Why a new approval is required

| Prior session | Outcome |
|---|---|
| 2026-11-07 APPROVAL | 4× L4 create attempts in europe-west4-b/c/a → STOCKOUT. USD 0. |
| Part A on `51d41c9` | **Never completed** on a GPU host. |
| Part B full match | **Never started**. Cold Linux CPU full-match alone was **356 min** wall — cannot share a 300 min L4 lifetime with a full Part A matrix. |

## Exact experiment pins

| Role | Commit | Notes |
|---|---|---|
| **Immutable GPU baseline (Part A)** | `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac` | Never overwritten. |
| **Session-1 engine tip (startup/smoke helpers)** | *freeze at APPROVAL* — current tip includes host-provenance checkpoint refusal | Must be named in APPROVAL if guest scripts come from tip. |
| **Part B candidate (separate session)** | `0584c1c177831fa362791739ed3494f406fae55f` **or later tip named at approval** | Not authorized by Session-1 unless APPROVAL explicitly includes Part B (not recommended). |

## Recommended scope change: two sessions

| Session | Scope | Lifetime | Why |
|---|---|---|---|
| **Session 1 (this request)** | Infra smoke + **Part A only** on `51d41c9` | 180 min server max (enough for 6 profiles × 3 windows + export/teardown margin) | Isolates the GPU accuracy gap. Same-machine CPU controls stay valid. |
| **Session 2 (separate APPROVAL later)** | Part B cold intervals / full-match on named tip | Separate 300 min envelope | Cold CPU full-match was 21359 s; L4 may be faster but must not steal Part A time. |

Do **not** force Parts A and B into one 300 min VM if that would truncate export or skip CPU controls.

## Search envelope (Session 1)

| Item | Value |
|---|---|
| Hardware | **g2-standard-8, 1× NVIDIA L4**, 200 GB balanced PD **auto-delete** |
| Image | `common-cu129-ubuntu-2204-nvidia-580-v20261029` |
| Zones (priority) | **1.** europe-west3-b **2.** europe-west3-a **3.** europe-west6-b **4.** europe-west6-c |
| Alternate GPUs | **NO** |
| Max simultaneous VMs | **1** |
| Max create attempts | **6 total** across the search window (not 6 per zone). Order: try next unused zone after definitive stockout + empty instance/disk list. |
| Backoff | After definitive stockout: wait **5 / 10 / 20** min before the next create (bounded). Do not hammer. |
| Ambiguous create | List instances/disks/operations in that zone; **do not** create a second VM while any instance may exist. |
| Search window | **6 hours** wall clock from first create attempt; stop when a suitable VM exists, attempts exhausted, or window ends. |
| Max lifetime | **180 min** server-enforced (`--max-run-duration=180m --instance-termination-action=DELETE`) |
| Guest stop | `shutdown -h +170` |
| Max billable sessions | **1** |
| Footage | IMG_4809 proxy only (`b1077af3…fb679c`). IMG_5105 / IMG_4529: **NO** |
| Uploads | **After** VM exists: stage small source archive first; upload video only after allocation succeeds; bounded guest wait for objects. |
| Export | numeric/text + hashes only; **no** private footage/crops |
| Cleanup | delete `runs/` objects; confirm 0 instances/disks; `cleanup_final.json` |

Quota/catalogue ≠ capacity.

### Attempt semantics (explicit)

1. List all approved zones for instances/disks.  
2. Create in the next zone with no live resources.  
3. On STOCKOUT / ZONE_RESOURCE_POOL_EXHAUSTED: record log, confirm 0 instances, apply backoff, continue.  
4. On ambiguous operation: wait/poll operation; inspect resources; **never** parallel create.  
5. Stop creates when VM exists or attempts/window exhausted.

## Cost estimate (list USD, before tax; **not a billing cap**)

Source: Cloud Billing Catalog snapshot `workers/football-cv/bench/results/5.3/fp32-proposal-20261102/pricing.json` retrieved **2026-11-02T20:18:57Z** (USD list).  
**Not refreshed on 2026-11-09** — `gcloud` binary not found in this agent shell despite `AppData\Roaming\gcloud` config for `clusiola4@gmail.com`. Refresh immediately before create.

g2-standard-8 = 8 vCPU + 32 GiB RAM.

| Region | Core $/h | RAM $/h | L4 $/h | PD $/GiBy·mo | **VM+GPU $/h** | **180 min VM+GPU+PD+IP** | **300 min (Session 2 ref)** |
|---|---:|---:|---:|---:|---:|---:|---:|
| europe-west4 (ref only) | 0.02626×8 | 0.00308×32 | 0.58863 | 0.11 | **0.932** | ~2.85 | ~4.72 |
| europe-west3 (Frankfurt) | 0.02945×8 | 0.00345×32 | 0.66003 | 0.12 | **1.006** | ~3.08 | ~5.11 |
| europe-west6 (Zurich) | 0.03274×8 | 0.00384×32 | 0.78344 | 0.13 | **1.168** | ~3.57 | ~5.93 |

Assumptions in the 180 min column: ephemeral external IP ≈ $0.005/h; PD hourly ≈ monthly/720; same-day GCS video storage < $0.01; results egress ≤ 0.5 GiB @ ~$0.12/GiB ≤ $0.06. Contingency ~25% for setup/idle between profiles.

| Budget item | Session 1 (Part A, 180 min) |
|---|---|
| Expected useful compute | 60–120 min → ≈ **$1.0–$2.3** at west3 rates |
| Max-lifetime bound (west6 worst among approved zones) | ≈ **$3.6** compute+disk+IP + ≤$0.07 storage/egress ≈ **$3.7** |
| Proposed approval ceiling | **USD 6.00 before tax** (procedure limit, not Cloud Billing hard cap) |
| Prior USD 8 / 300 min figure | Oversized for Session 1; understated west6 vs west4 if someone assumed west4 rates for Zurich |

Refresh prices before create; refuse create if max-lifetime estimate exceeds the approved ceiling.

## Prioritized time-bounded plan (Session 1)

Measured uncertainty: Part A never ran on L4 for `51d41c9`. Prior harness budget was 5400 s for the matrix. Guest lifetime 170 min usable.

| Priority | Stage | Commit | Profiles / windows | Expected runtime | Artifacts | Pass / stop |
|---|---|---|---|---|---|---|
| 0 | Infra smoke | archive of `51d41c9` | GPU visible; CUDA; providers; model/video/archive hashes; export dry path | 10–20 min | `envinfo`, provider list, `_DONE` dry | **Stop session** on CPU fallback inside GPU profile, hash mismatch, or missing GPU |
| 1 | Minimum accuracy-gap pair | `51d41c9` | `cpu-torch` then `gpu-fp32-b1` on `gap1150` (+ decoded-frame hashes) | 20–40 min | per-profile out dir, OCR cache isolated, `precision_diagnostics.json` | Continue only if both complete with matching decoded-frame hashes across device |
| 2 | Precision / batch | `51d41c9` | `gpu-fp16-b8`, `gpu-fp32-b8` on same window | 20–40 min | same | Stop if silent dtype/provider change |
| 3 | Remaining Part A | `51d41c9` | `cpu-onnx`; `gpu-fp32-b1` other windows; `gpu-fp32-b8-repeat` | remainder before T−25 min | full matrix dirs | Drop lowest-priority windows before cutting export |
| 4 | Export + teardown | n/a | manifest verify; delete runs/; delete VM | **reserve 20–25 min** | `export_manifest.json`, `cleanup_final.json` | Always attempt; guest shutdown before server kill |

**Out of Session 1:** Part B full-match / 9-interval cold on tip. Propose Session 2 after Part A analysis.

### Failure behaviour

- No silent CPU fallback inside GPU profiles (hard error).  
- No unapproved source hotfixes on the VM.  
- No lifetime extension beyond APPROVAL.  
- No second VM while outcome uncertain.  
- Preserve partial results with explicit incomplete status.

## Local audit completed before this request (2026-11-09)

| Work | Result |
|---|---|
| 31 unmatched T claims | Reproduced 313/0/31/160 of 504. **30** = +0.1 s label-time alignment (`evaluation_alignment_defect`); **1** @ 244.4 s = `missing_or_uncertain_annotation`. Evidence: `bench/results/5.3/unmatched-audit-20261109/`. Independent review **not** performed. |
| Cross-host stage-1 | Fingerprints match; divergence at **frame 0**; decoded pixels differ (OpenCV/FFmpeg builds). Not a pure identity-logic delta. Host provenance now recorded on new checkpoints without changing historical fingerprints. |
| Coaching | Fixture/object-graph E2E harness passed (5/5); not live Firebase/device. `contactsConfirmedIdentity` gate verified. |
| Cloud SDK | Config present (`clusiola4@gmail.com`); **`gcloud` binary missing** in agent PATH — live inventory not re-run. Last empty resource evidence: 2026-11-07. |

## APPROVAL template — Session 1 Part A only

```
GPU session approved:                     YES / NO
Session scope:                            Part A only (51d41c9). Part B: NO
Zones, in order:                          europe-west3-b, europe-west3-a, europe-west6-b, europe-west6-c
Machine / GPU / disk / image:             g2-standard-8, 1× NVIDIA L4, 200 GB balanced PD auto-delete,
                                          common-cu129-ubuntu-2204-nvidia-580-v20261029
Alternate GPU types:                      NO
Part A commit:                            51d41c9f5f333c7e93a606b7181ba8cb1cee8eac
Maximum VM lifetime (server-enforced):    180 min
Max create attempts / search window:      6 total / 6 h
Cost ceiling, all-in, before tax:         USD 6.00
Footage allowed:                          IMG_4809 proxy (b1077af3…fb679c); IMG_5105 / IMG_4529: NO
Maximum billable sessions:                1
Price refresh required immediately before create: YES
```
