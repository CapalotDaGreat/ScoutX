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
- [ ] Fresh full-match baseline reproduced with provenance — **failed, candidate not started**. Cold CPU baseline DETOUR=0 started 2026-11-05 08:27:56 CET from `32470ce0ebe09a68d2201c60ed3944c28d72eca8` and exited 2 at 15:03:19 CET. Output `C:\ZLI\M335\ScoutX\.local\fm-detour-cpu-20261105` is preserved. `baseline/full_match.json` status `failed`, `measuredTotalWallSec` 23013.589, `peakRssMiB` 3183.2, `RuntimeError` CPU allocator (`alloc_cpu.cpp:117`, 9600 bytes). Accuracy was not evaluated. Candidate DETOUR=1 was not started (`runner.log`).
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
- **Selectivity on the reference window only:** 1 hit on `reference_i0225` (f211/tid98); 0 on `default_i0225`. Full-match selectivity is not measured until the cold run finishes.
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
| `c0c840f4286c8f9f04b53ce0a34829101714d5ed` | Freeze tip SHAs in handoff/ledger | Docs tip |

---

### 2026-11-05 — Cold full-match CPU run started; coaching release path and player-detail crash

- Video SHA-256 verified `b1077af3c975e0e1b5d15a9f0dc3895ac87fa296cad4f41d267368c260fb679c` (1,413,632,177 bytes). Stream hash remains `c0a48508…a66b`. 1920×1080, 10 fps, 20,350 frames, 2035.0 s.
- Runtime: `workers/football-cv/.venv`, torch 2.15.0+cpu (CUDA false, 8 threads), onnxruntime 1.31.1 CPUExecutionProvider, opencv 5.0.0.93. Decoder default (cv2). FFmpeg 9.0.2 on PATH for ffprobe.
- Flags recorded in `baseline/full_match.json`: DETOUR 0, EXCHANGE 0, RESUME 0, OCR_CONSULTED_ONLY 1, OCR_CACHE_PROVENANCE 1, APPEARANCE_ONLY_LIKELY 1 (D not promoted), MODE balanced. Chunk 300 s, stride 1, imgsz 1280, discovery imgsz 416, device cpu. Model hashes matched `bench/references/model_hashes.json`.
- Boundary: DETOUR runs only inside `split_at_contacts` after raw `track_rows`. The runner copies `discovery.json` and stage-1 chunk directories after baseline exit 0, and does not copy `ocr_cache.json` or `report/`. The baseline exited 2, so that copy never ran. Candidate resolve has not started. A resumed stage-1 is not a cold stage-1 timing.
- Failed-run inventory, preserved in place: `runner.log` (exit 2, “baseline failed; not starting candidate”), `baseline/benchmark.log` (no traceback; the handler stored only the exception type and message), `baseline/full_match.json` (extraction `timingComplete` true, no `stages.resolve`), `discovery.json` (3,176 bytes, 10 sightings, discovery wall 3511.6 s). Seven chunk directories `c_00000`–`c_00006` each have `checkpoint.json` and `detections.npz`. Stage-1 fingerprint `bb0899ea6879091f77fde373ce4d4e682b6c1e5f3cc109e44e3d9ea8e81537bc`. Chunks are extracted outputs, not a finished resolve. `work/stage1/ocr_cache.json` (149,195 bytes) and its provenance sidecar are a partial resolve and must not be reused as a completed cache. No `report/`. Chunk 3 (900–1200 s) wall 5592.4 s (decode 869.77 s, detect 3515.11 s) while the other chunks were about 1079–2214 s. An `expo export` was also running on this machine during that window. Do not describe a later resume as this cold run.
- Coaching: a segment opportunity becomes a stored moment only with a cited observation, a drill, and an observable success criterion (`measurement`). Identity confirmation releases those moments from pending coaching. Missing criterion drops the opportunity. No numeric match statistic is invented.
- Player shell: Discover opened `PlayerDetail` outside `ScoutWorkspaceProvider` and the screen threw. Providers now wrap the player stack. Mock/web check: filtered Discover → Chris Walker detail renders. Public portfolio for mock id `pl-001` shows the private/missing state. Analysis `/match/missing-job` shows “This analysis could not be loaded.”
- Small-screen tab label “Performance” stays on one line at 390 px. Mojibake repaired in de/es/fr/it/nl/pt navigation and portfolio strings. Sprint, distance, and attribute minimums are no longer filters (`adbbb1f`).
- Tests this pass: `npm run test:unit` 738 pass; coaching/synthesis file 50 pass; `tsc --noEmit` exit 0; `tsc -p functions` exit 0. Rules emulator suite not re-run. Worker pytest not re-run while the CPU match is using the machine.
- Screenshots this pass are mock/web only and supersede the 2026-11-04 Discover PNG for layout, not for a live account. They are not App Store screenshots and must not be uploaded to App Store Connect (guideline 2.3).
- Tracker proof before the failed baseline: `git diff 32470ce0ebe09a68d2201c60ed3944c28d72eca8` through the docs tip was empty for `workers/`. The candidate never started. The exit releases that hold.
- **Defect, E default, restored to off.** `ed2b242` (2026-11-04 01:11 +0100) added `SCOUTX_OCR_CACHE_PROVENANCE` off (`"0"`). `3c9f9835365d0a1bf1637dc7721947e426a85cc2` (2026-11-04 22:09:08 +0100) switched the default to `"1"` without approval. The tag hashes OCR source and the enhance switch, not model weights, and concurrent writes are untested. The failed comparison pinned `=1` on the runner. That pin was not a promotion. The baseline has exited and the candidate never started, so the code default is `"0"` again. `SCOUTX_OCR_CACHE_PROVENANCE=1` still opts in. C (`SCOUTX_OCR_CONSULTED_ONLY` default `"1"`) and atomic cache writes are unchanged.

### 2026-11-06 — Failed baseline preserved; E default off; resolve memory bound

- Chunk integrity: all seven `c_00000`–`c_00006` checkpoints match their recorded sizes and SHA-256. Crop counts match. Frames 3000×6 + 2350 = 20350. One settings fingerprint `bb0899ea6879091f77fde373ce4d4e682b6c1e5f3cc109e44e3d9ea8e81537bc`. Detector `yolox_s@1280/onnx`. Video SHA prefix `b1077af3c975`. These chunks are reusable upstream evidence. The partial `ocr_cache.json` (3000 entries, 365 with a number) is not.
- Memory: the failure is after extraction, inside resolve, at a 3000-crop cache flush (`peakRssMiB` is the RSS sample at the exception, not a high-water mark). `load_runs` held every npz open while copying. Discovery constructed a YOLO session and the shared OCR reader even when they were not needed for a resumed discovery, and each extract left its ONNX session to the garbage collector. The CPU ONNX arena keeps scratch blocks. Repair: close the session at the end of `extract`, disable the CPU arena (graph outputs unchanged), skip discovery model load when `discovery.json` is reused, copy each npz inside a closed `np.load`, drop each crop image after the read, and `gc.collect()` every 100 new reads. The benchmark now stores the traceback. This does not change image size, frame rate, detector weights, or identity thresholds.
- E on vs E off: `tests/test_ocr_cache_equivalence.py::test_provenance_on_and_off_match_on_an_empty_cache` passed (empty cache, same timeline arrays). The resolve comparison pins `SCOUTX_OCR_CACHE_PROVENANCE=0` explicitly. That pin matches the restored default. It is not evidence that E should be promoted.
- DETOUR remains the code default and is still not full-match validated. C stays on. D (`SCOUTX_APPEARANCE_ONLY_LIKELY=1`) is not promoted. A and B stay off.
- Next measurement reuses the preserved chunks in a new directory. It is not a cold extraction. Original extraction wall stays 23013.589 s on the failed record.

## Blockers / approvals needed

| Item | Why | Status |
|---|---|---|
| Live Firebase / seeded scout+player accounts | Authenticated journey verification | Missing |
| Tip TestFlight / native device | Prior screenshots are web mocks | OPEN |
| GPU VM | CUDA gap vs baseline `51d41c9` | Needs approval |
| Independent D review | Appearance-only promotion | Do not promote |
| Full-match cold replay | Confirm DETOUR selectivity + #6/#17 bounds | **Failed** 2026-11-05 15:03 CET, exit 2, candidate not started. Stage-1 chunks exist; resolve did not finish. |

---

## Next actions

1. Resolve-only comparison in a new directory, reusing the validated chunks and `discovery.json`, empty OCR caches, E pinned off. DETOUR=0 then DETOUR=1. Do not call it cold. Do not overwrite `fm-detour-cpu-20261105`.
2. P (pause-and-resume) narrow candidate — still open; do not relax thresholds.
3. Scout authenticated journeys when Firebase keys + seeded scout/player accounts are approved. Do not create production users.
4. Native/device evidence for the current tip. 2026-11-04 and 2026-11-05 screenshots are **mock/web**.
5. External gates unchanged: App Check, backups, counsel, owner SEC, D review, GPU vs `51d41c9`, EAS/TestFlight. No paid build started.
