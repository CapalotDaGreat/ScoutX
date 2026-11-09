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
| Active VM / disks | 0 / 0 at owner refresh 2026-11-09 |
| Footage uploaded | No (awaiting Claude session) |
| Estimated compute charge | USD 0 so far |

---

## Capacity attempts

| When | Zones | Result | Charge |
|---|---|---|---|
| 2026-11-07 | west4-b/c/a (+retry) | STOCKOUT ×4 | USD 0 |
| 2026-11-09 session | approved envelope above | **Not started by Cursor** | — |

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

## Next executable action (Claude only)

1. Refresh prices + list instances/disks (`--project=scoutx-230b0`).  
2. Create ≤1 L4 in zone order under the APPROVAL.  
3. Part B (`84fefc5`) → export → Part A (`51d41c9`) → export → cleanup.  
4. Append results, costs, cleanup to this ledger.
