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
| Approved search envelope | **NONE** (2026-11-07 exhausted; revised Session-1 proposal awaits APPROVAL) |
| Next proposal | `docs/video/gpu-validation-proposal-2026-11-09.md` (**Part A only**, 180 min, USD 6 ceiling) |
| Active VM / disks | Last evidence: 0 / 0 (2026-11-07). **`gcloud` binary missing** in 2026-11-09 agent shell — re-inventory before create. |
| Footage uploaded | No |
| Estimated compute charge | USD 0 |

---

## Capacity attempts

| When | Zones | Result | Charge |
|---|---|---|---|
| 2026-11-07 | west4-b, west4-c, west4-a, west4-b retry | STOCKOUT ×4 | USD 0 |

**Next retry:** only after Session-1 APPROVAL is filled. Prefer west3 then west6 (L4 only).

---

## Experiment commits

| Role | SHA | Status |
|---|---|---|
| GPU comparison baseline | `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac` | Immutable |
| Cold Linux CPU full-match | `8e1b63355d725c36e217b3b6df6ce53c93da442e` | Complete |
| Reliability + coaching gate | `0584c1c177831fa362791739ed3494f406fae55f` | Local; not GPU-authorized |
| Host-provenance checkpoint | *tip after this ledger update* | Refuses cross-host resume when provenance recorded; historical fingerprints unchanged |

---

## Verified vs uncertain

### Verified

- Cold Linux full-match exit 0, 20350 frames, timingComplete, labelled **313 / 0 / 31 / 160 of 504** (T, IoU≥0.5, original labels).
- Zero matched wrong-player on that labelled partition is **not** full-match identity proof.
- Of 31 unmatched: **30** become T IoU≥0.5 under documented +0.1 s label-time correction (evaluation alignment); **1** at 244.4 s remains uncertain annotation/occlusion.
- Cross-host stage-1: same settings fingerprint, different decoded pixels from frame 0; Windows artifacts complete.
- Defaults in source: C on, E off, DETOUR off, A/B off; D appearance-only LIKELY still code-default on / not promoted.
- Coaching fixture harness (5/5) + unit suites; involvement improve requires `contactsConfirmedIdentity`.

### Uncertain / not done

- Any L4 Part A profile for `51d41c9`.
- Live Cloud inventory/price refresh (no `gcloud` binary here).
- Independent human review of disputed unmatched cases.
- Live Firebase / device coaching journey.
- Whether L4 cold full-match fits 300 min (CPU cold was 356 min).

---

## Unmatched-claim audit (cold Linux)

Artifacts: `workers/football-cv/bench/results/5.3/unmatched-audit-20261109/`  
Frames/crops kept only under `.local/_tmp_unmatched_audit/` (not git).

| Class | Count |
|---|---:|
| evaluation_alignment_defect (+0.1 s time basis) | 30 |
| missing_or_uncertain_annotation (244.4 s) | 1 |
| possible_wrong_player / likely_correct_geometry_fail / ambiguous_overlap / unresolved | 0 |

Disputed packet prepared: `disputed_for_independent_review.json` (`review_status: not_performed`).  
Note: 1168.5 s has N closer than T on the **stored** basis (0.491 vs 0.459) but T after +0.1 s — include in independent review.

`pp_bench.accuracy()` omits sub-0.5 claims from returned categories; ledger unmatched uses `classify_claim` / interval partition.

---

## Cross-host stage-1

Artifacts: `workers/football-cv/bench/results/5.3/crosshost-20261109/`

- Fingerprint `bb0899ea…` identical; **frame 0** first divergence (12 vs 15 dets).
- ~19 289 frames differ; crop JPEG pixels differ on aligned boxes → decoded-pixel / OpenCV-FFmpeg build difference primary; ORT numerical effects possible secondary.
- Fingerprint omitted host/OpenCV build; **fix:** new checkpoints store `hostProvenance` and refuse cross-host resume when both sides have it. Old checkpoints without the field remain resumable (no retroactive certainty).

Do not treat Linux vs Windows identity score deltas as pure logic changes.

---

## Coaching

| Check | Result |
|---|---|
| Mode | Fixture / production-helper object graph — **not** live auth/device |
| Evidence | `bench/results/5.3/coaching-e2e-20261109/coaching_e2e_results.json` + unit tests |
| Cases | insufficient → limitations only; confirmed-contact gate; confirmed improve+drill; synthesis citation/drill/criterion; scout view without coaching cards |
| Live product UI / Firebase | **Not executed** |

---

## Completed GPU profiles

None for `51d41c9`. Stockout only.

---

## Cleanup status

| Resource | Status |
|---|---|
| VMs/disks this task | None created |
| Prior session orphans | Last check 2026-11-07 empty; re-check with Cloud SDK before next create |

---

## Next executable action

1. Owner fills **Session-1 APPROVAL** in `docs/video/gpu-validation-proposal-2026-11-09.md` (Part A only).  
2. On a machine with `gcloud`: `gcloud compute instances list --project=scoutx-230b0` (and disks/quotas); refresh Billing Catalog prices; create at most one L4 per envelope.  
3. Run prioritized Part A plan; export; cleanup.  
4. Separately approve Session 2 for Part B after Part A analysis.
