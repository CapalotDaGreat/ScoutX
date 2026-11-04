# Scout UX + full-match tracking ledger

**Started:** 2026-11-04 (~23:25 CET)  
**Branch:** `release/pitchproof-5-3-candidate`  
**Starting docs tip:** `bfbda446dfd09acd9a9a1ec7afa2606da836989c`  
**Starting product RC:** `47e49cf037671d964180404ee0cfd6212ed76006`  
**GPU baseline (immutable):** `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac`  
**Defaults:** C ON · E ON · D not promoted · A/B off · **DETOUR_SPLIT ON** (new) · AI/CV fail-closed  

Update this file after every meaningful experiment. Do not treat “no improvement possible” as done.

---

## Acceptance criteria (measurable)

### Scout UX
- [x] Scout Discover cards distinguish profile vs verified vs missing freshness (mock/web)
- [x] Primary scout actions clearer; matching copy no longer claims preference/potential match
- [ ] Authorization/privacy boundaries with separate scout+player accounts (blocked: live Firebase)
- [x] Screenshot recorded; **mock-only** clearly marked

### Tracking / analysis
- [ ] Fresh full-match baseline reproduced with provenance (next)
- [x] E4 addressed with before/after on faithful `reference_i0225` replay
- [x] No new confirmed-N frames on labelled reference window; likely-N cleared (E3 side-effect)
- [x] E4 fixed; P remains xfail; E3 desired now passing under DETOUR
- [x] Coaching: confirmed-only pass insights; clip coaching needs observable + drill criteria
- [x] Owner-assisted recovery path unchanged (not touched)

---

## Hypotheses queue

| ID | Hypothesis | Status | Evidence |
|---|---|---|---|
| S1 | Scout cards bury provenance | **DONE** | freshness + coverage on cards; research doc |
| S2 | “Matching preferences” over-promises | **DONE** | en copy + header stats |
| E4 | One-frame CONFIRMED on N at w211 is local detour | **FIXED** | DETOUR_SPLIT; conf_N 18→17 (w211 removed) |
| E3 | Appearance-only distant N | **FIXED (side-effect)** | likely_N 8→0; likely_T 0→35 on reference labels |
| P | Pause-and-resume transfer | OPEN | still strict xfail |

---

## Experiments log

### 2026-11-04 — Scout honesty batch
- Research: Wyscout/Veo/Sofascore/Transfermarkt → adopt evidence-first; reject potential/B2B library scope. See `scout-product-research-2026-11-04.md`.
- UX: roleDescriptors parse; FreshnessLabel; brief gapCodes; filter chips; distanceKm removed; suggestions/copy.
- Evidence: `docs/release/evidence/scout-discover-freshness-2026-11-04.png` (**mock/web**, not live-auth).

### 2026-11-04 — E4 DETOUR_SPLIT
- **Baseline (DETOUR=0):** w211 CONFIRMED/number on N; E3 LIKELY/appearance on N.
- **Hypothesis:** isolate one-frame detour when A jumps onto paused same-kit B and B resumes on the detour box while A returns.
- **Change:** `detour_rows` + isolate orphan mid + post cut; no B-appearance swap onto A’s return; default ON (`SCOUTX_DETOUR_SPLIT=0` kills).
- **Selectivity:** 1 hit on `reference_i0225` (f211/tid98); 0 on `default_i0225`.
- **reference_i0225 labelled metrics (T/N, IoU≥0.5, exclude `?`):**

| | conf_T | conf_N | likely_T | likely_N |
|---|---|---|---|---|
| old | 9 | 18 | 0 | 8 |
| new | 9 | 17 | 35 | 0 |

- Removed confirmed-N frame: **211 only**. Added confirmed-N: **none**.
- Side-effect: E3 frames now LIKELY/anchored on **T** (not suppression-only).
- Residual: conf_N remains on 176–191, 195–197, 208 (exchange/P/annotation region — unchanged by detour).
- Tests: `test_detour_split.py` 4 pass; known failures E3/E4 pass; P still 2 xfail; exchange test pins DETOUR=0 for original match.

---

## Commits this effort

| SHA | Summary | Invalidates |
|---|---|---|
| `1eebf5c009e88d9ac5adbc804abd5ac459d81cd0` | Scout UX honesty + research | UX audit screenshots / tip SHA |
| `cd8ba966b3bc34751a06391f16952dcb4e2a1b1e` | DETOUR_SPLIT E4 (+ E3 side-effect) | Identity replay evidence; E3/E4 xfails |
| `45a1ee5c789851ccb7c677a91d6b919be6be0edc` | Coaching confirmed/cited gates | Match-review / clip coaching evals |

---

## Blockers / approvals needed

| Item | Why | Status |
|---|---|---|
| Live Firebase / seeded scout+player accounts | Authenticated journey verification | Missing |
| Tip TestFlight / native device | Prior screenshots are web mocks | OPEN |
| GPU VM | CUDA gap vs baseline `51d41c9` | Needs approval |
| Independent D review | Appearance-only promotion | Do not promote |
| Full-match cold replay | Confirm DETOUR selectivity + #6/#17 bounds | Next local |

---

## Next actions

1. Commit scout UX and engine separately; update release handoff tip SHAs.
2. Reproduce full-match baseline (cold cache) with DETOUR on; record provenance.
3. P (pause-and-resume) narrow candidate or explicit bound.
4. Coaching grounding eval pass.
5. Scout authenticated journeys when Firebase keys available.
