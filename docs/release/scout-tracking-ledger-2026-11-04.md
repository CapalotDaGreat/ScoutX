# Scout UX + full-match tracking ledger

**Started:** 2026-11-04 (~23:25 CET)  
**Branch:** `release/pitchproof-5-3-candidate`  
**Starting docs tip:** `bfbda446dfd09acd9a9a1ec7afa2606da836989c`  
**Starting product RC:** `47e49cf037671d964180404ee0cfd6212ed76006`  
**GPU baseline (immutable):** `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac`  
**Defaults:** C ON · E off unless `SCOUTX_OCR_CACHE_PROVENANCE=1` · D not promoted · A/B off · **DETOUR_SPLIT off unless `SCOUTX_DETOUR_SPLIT=1`** · AI/CV fail-closed  

Update this file after every meaningful experiment. Do not treat “no improvement possible” as done.

---

## Acceptance criteria (measurable)

### Scout UX
- [x] Scout Discover cards distinguish profile vs verified vs missing freshness (mock/web)
- [x] Primary scout actions clearer; matching copy no longer claims preference/potential match
- [ ] Authorization/privacy boundaries with separate scout+player accounts (blocked: live Firebase)
- [x] Screenshot recorded; **mock-only** clearly marked

### Tracking / analysis
- [x] Fresh full-match baseline reproduced with provenance — **cold Linux CPU completed 2026-11-07**. Commit `8e1b63355d725c36e217b3b6df6ce53c93da442e`, output `C:\ZLI\M335\ScoutX\.local\fm-linux-cold-20261106`, exit 0, `timingComplete` true, 20350/20350 frames, peakRssMiB 2089.2, cgroup max ≈2358.6 MiB. Labelled T IoU≥0.5: 313/0/31/160 of 504 (recall 0.621, IDF1 0.766, wrong-identity 0.0 s). DETOUR=0. The earlier Windows cold run (`fm-detour-cpu-20261105`, exit 2, allocator failure) remains preserved as the failure that motivated the memory repairs. GPU matrix on `51d41c9` still not run (stockout).
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
- C stays on. D (`SCOUTX_APPEARANCE_ONLY_LIKELY=1`) is not promoted. A and B stay off. DETOUR's default after the measurement below is off.

### 2026-11-06 — Resolve-only comparison finished (not a cold run)

- Code: `4d4d860fb05cea12fd5ba7ecf835bc8c863ef491`. Output: `C:\ZLI\M335\ScoutX\.local\fm-detour-cpu-20261106-resolve`. Video SHA-256 matched. Stage-1 fingerprint matched the preserved chunks. Both resolves exited 0. E pinned `SCOUTX_OCR_CACHE_PROVENANCE=0`. C=1, A=0, B=0, D not promoted. Only `SCOUTX_DETOUR_SPLIT` differed (0 then 1). Each resolve had its own empty OCR cache. Discovery and all seven chunks were resumed. Extraction wall is still the failed record's 23013.589 s. These resolve walls are separate: baseline 2157.997 s (resolve 1836.817 s), candidate 1892.688 s (resolve 1796.045 s). `timingComplete` is false on both.
- Baseline timeline SHA-256 `4a33fd3be00a57e22a6bf80b6f990e3194b505b9a3f68d0547fb1e2cf1de70d7`. Candidate `895c8b37c8c4238fac8b802df6faa864361acecc67b740441b64ee25e2c11d16`. Claims: baseline `2497e05dd7b9ebf87791dfb0eb192a635032f75c5b483cdb2aa178647312bcbb` (12938 frames), candidate `12074c9097431667ef6ffa82b5aeddb5cda4e733fb32d344c802a1f912ded9cd` (12986 frames). Confirmed frames 564 vs 551. Likely frames 1460 vs 1353. End RSS 2708.8 MiB and 3320.6 MiB. During identity the baseline process committed about 17 GB while its working set was under 2 GB. That commit gap, not the 9600-byte request, is the shape of the 2026-11-05 allocator failure.
- Labelled original ground truth, T frames, IoU ≥ 0.5. Both runs: 225–255 s correct 53 / wrong-player 3 / unmatched 0 / abstained 12 of 68, except candidate other-player confirmed claims 4 versus baseline 5. 1150–1180: 152 / 0 / 9 / 127 of 288. 1295–1325: 18 / 0 / 15 / 61 of 94. 1890–1920: 0 / 0 / 0 / 54 of 54. Intervals 400–430, 600–630, 1500–1530, 1680–1710 and 1800–1830 have labelled boxes and no T label; neither run placed a confirmed or likely claim on an N box there. Proposed +0.1 s time basis (boxes and player labels unchanged): 1150–1180 correct 161 and unmatched 0; 1295–1325 correct 33 and unmatched 0; abstentions unchanged. Same on both runs.
- Aggregate stored basis: claimed correct 22.3 s both; confirmed correct 13.9 s both; wrong identity 0.5 s baseline (244.5, 244.6, 244.7, 245.8, 246.1) and 0.4 s candidate (246.1 removed). Recall 0.442 both. IDF1 0.609 vs 0.610.
- DETOUR is not selective. State changes: 126 likely→ambiguous, 68 absent→ambiguous, 18 ambiguous→absent, 12 confirmed→likely, 9 ambiguous→likely, 3 likely→absent, 1 confirmed→ambiguous at 246.1 s, 1 absent→likely. Exchange window 244.3–245.0 s stays confirmed on both, so P is unchanged. #6 window 706–716 s is ambiguous on both (88 frames). #17 window 1301.6–1305.7 s is unchanged (19 confirmed, 16 ambiguous). Far changes include 140 s, 493–523 s, 608–609 s, 734–739 s, 1194–1196 s and 2031 s. DETOUR therefore stays experimental and the code default is off. `SCOUTX_DETOUR_SPLIT=1` remains the opt-in used for this candidate.
- Verdict from this evidence: not ready. The resolve completes. Labelled full-match accuracy is partial. A static gate with zero code blockers does not change that.
- Checks after that measurement, on the commit that turns DETOUR's default off and the two follow-up fixes: `npx tsc --noEmit` exit 0. `npm run test:unit` 739 pass, 0 fail. `npm run test:rules` 263 pass, 0 fail, which includes `npm run build --prefix functions`. The first worker pytest was 658 passed, 15 skipped, 4 xfailed. That count is reconciled below. Static gate earlier the same day: 23 pass, 0 code blockers, 10 non-code items, rules skipped at that time. No browser pass was repeated after these commits. No paid build, deploy, or store submission.

### 2026-11-06 — Test accounting, memory-fix replay, and the 225–255 s counts

The 2026-11-03 suite (`tests_night/summary.txt`) was 633 passed, 11 skipped, 6 xfailed. The 6 xfailed were strict. The 11 skips were the opt-in whole-match replay tests in `test_full_match_identity.py`.

| Test | Old status | Status in the 4-xfail run | Why | Commit |
|---|---|---|---|---|
| `test_E3_desired_no_claim_on_n_labelled_player[0]` | strict xfail | passed | The desired assertion was rewritten to run with `SCOUTX_DETOUR_SPLIT=1`, so it no longer failed on the release default. | `cd8ba96` replaced the xfail; `f37479a` kept the passing opt-in form |
| `test_E3_desired_no_claim_on_n_labelled_player[1]` | strict xfail | passed | Same as the exchange-flag pair above. | same |
| `test_E4_desired_no_confirmed_claim_on_other_player[0]` | strict xfail | passed | Same rewrite. | same |
| `test_E4_desired_no_confirmed_claim_on_other_player[1]` | strict xfail | passed | Same as the exchange-flag pair above. | same |
| `test_P_desired_no_claim_on_player_a[0-0]`, `[0-1]`, `[1-0]`, `[1-1]` | two strict xfails, `[0]` and `[1]` | four strict xfails | An extra DETOUR parameter was added. All four still failed. | `f37479a` |
| `test_benchmark_refuses_unverified_models` | passed when ffmpeg is on PATH | skipped, "ffmpeg not installed" | The pytest process did not have ffmpeg on PATH. The test was not changed. | run environment, not a commit |
| `test_reference_identity_is_the_video_stream_not_the_container` | passed when ffmpeg is on PATH | skipped, same reason | same | same |
| `test_benchmark_refuses_a_baseline_from_another_recording` | passed when ffmpeg is on PATH | skipped, same reason | same | same |
| `test_benchmark_rejects_unvalidated_mode` | passed when ffmpeg is on PATH | skipped, same reason | same | same |

The four E3/E4 desired tests are strict xfails again, and they run with DETOUR off. Their characterisations again assert the unrepaired behaviour. Separate opt-in tests pin `SCOUTX_DETOUR_SPLIT=1` and do not replace the xfails. The extra P parameter is removed, so P is again `[0]` and `[1]`, both strict xfail. With ffmpeg on PATH, `pytest tests` is 660 passed, 11 skipped, 6 xfailed, exit 0. The higher pass count versus 633 is tests added since 2026-11-03, not converted failures. JUnit: `pytest-junit-after-restore.xml`.

Memory-fix proof, empty cache, flags pinned to the defaults of both commits (`DETOUR=1`, provenance off, consulted-only on, exchange off, resume off, appearance-likely on). `default_i0225` timeline SHA-256 is `210f5cbc824a6a57e3a797a0b4ceb2e690be481f7788913f2edacaf306f5d1d7` at `ea4fe06` and at `4d4d860`. `reference_i0225` is `8be4afab19075566d3a367f75d3c0686ba1a7897a0e6c5627bc59c50250eec42` at both. The memory fix does not change those timelines.

225–255 s, original labels. The 3 wrong-player frames are target-labelled samples whose claim lands on another player: 244.5, 244.6 and 244.7 s, all `CONFIRMED_VISIBLE`. Each of those frames is labelled both T and N. Confirmed claims on other labelled players are a different count: the same three, plus 245.8 s on both runs, plus 246.1 s on the baseline only. 245.8 and 246.1 are labelled N and `?`, not T, so they are outside the 68-frame target denominator. The candidate removes only 246.1 s. Recall 0.442 is the labelled result: 1890–1920 s abstains on all 54 target frames, and 1295–1325 s has 15 claims that match no labelled box.

Worker sizing: during baseline identity on Windows the process's private commit was about 16.9–17.2 GB while its working set was about 1.4–1.9 GB. `peakRssMiB` in that report is the ending working set (2708.8 and 3320.6), not the commit. That was a point sample, not a traced peak. On Linux the same baseline resolve, run locally in a container on 2026-11-06, peaked at 1275.5 MiB of container memory. No cloud machine was started. `Dockerfile.tracker-gpu` was not the image: its build requires a CUDA provider and this machine has no NVIDIA driver. The container was Ubuntu 24.04, the base of that image, with the CPU package versions from the Windows worker venv. It reused the seven preserved stage-1 chunks and an empty OCR cache, with DETOUR off and the same pins as the Windows baseline. It is not a cold run. The cgroup high-water mark (`memory.max_usage_in_bytes`) was 1,337,503,744 bytes (1275.5 MiB). The process high-water mark in the report is `peakRssMiB` 1435.6. The Docker VM had 11.68 GiB available and the container was not killed. Exit 0. Resolve wall 1340.78 s. States, boxes, evidence, and presence match the Windows baseline timeline. `speed` differs by at most one ulp, so the npz SHA-256 is `39e0902d045781d4d1f9844992cfd48c6b87b62eea669e79ed7bbd0053dbdd07` rather than `4a33fd3b…`. The 16.9–17.2 GB Windows figure is commit charge. It did not show up as container memory.

The release run now fails closed on that accounting. `workers/football-cv/bench/release_suite_pin.json` lists the six strict known-failure node ids and the eleven opt-in whole-match skips. `scripts/release-gate.mjs` runs the worker suite with `SCOUTX_RELEASE_SUITE=1`. The run fails if the strict xfail set differs from the pin, if one of those xfails is not `strict=True`, or if a skip is anything other than the opt-in whole-match replay. A missing ffmpeg fails that run instead of skipping the four benchmark tests. Changing either list means editing the pin and stating the reason in the commit message. The release run on 2026-11-06 was 664 passed, 11 skipped, 6 xfailed, exit 0. The four passes above the restored 660 are the pin checks themselves.

## Blockers / approvals needed

| Item | Why | Status |
|---|---|---|
| Live Firebase / seeded scout+player accounts | Authenticated journey verification | Missing |
| Tip TestFlight / native device | Prior screenshots are web mocks | OPEN |
| GPU VM | CUDA gap vs baseline `51d41c9` | Needs approval |
| Independent D review | Appearance-only promotion | Do not promote |
| Full-match resolve | DETOUR selectivity and #6/#17 | **Measured 2026-11-06, not cold.** See the 2026-11-06 section. DETOUR is experimental, default off. |

---

## Next actions

1. Do not promote DETOUR. P, the residual confirmed frames at 244.5–245.8 s, and the #17 window stay open. Do not relax thresholds.
2. Scout authenticated journeys when Firebase keys + seeded scout/player accounts are approved. Do not create production users.
3. Native/device evidence for the current tip. 2026-11-04 and 2026-11-05 screenshots are **mock/web**.
4. External gates unchanged: legal review, AI footage approval, backups, owner SEC, App Check registration, production env and GoogleService-Info.plist, CV approval, GPU vs `51d41c9`. No paid build, deploy, or App Store submission.

## GPU validation readiness (updated 2026-11-09)

Authoritative durable ledger: `docs/release/gpu-durable-ledger-2026-11-09.md`.  
Next approval proposal: `docs/video/gpu-validation-proposal-2026-11-09.md`.

- 2026-11-07 APPROVAL was filled then **STOCKOUT** across west4-b/c/a (4 attempts). No VM, no uploads, USD 0. See `session-state.json`.
- Cold Linux CPU full-match **completed** (above). GPU worker image memory still unmeasured.
- Part A on immutable baseline `51d41c9` still has **zero** completed GPU profiles.
- `gcloud` not on PATH in the 2026-11-09 agent shell; re-inventory before any create.

## 2026-11-09 — Reliability + coaching candidate (local)

Demonstrated defects repaired (separate candidate commit):

- `extract()` always closes the detector (`finally`) so chunk retries cannot keep the prior ONNX/Torch session.
- Torch `Detector.close()` drops the module and calls `cuda.empty_cache()` when on GPU.
- Atomic `discovery.json` write; scoped `np.load` for `scene.npz` / `timeline.npz`.
- Match-review `involvement_improve` requires `contactsConfirmedIdentity > 0` (likely-only ball contacts no longer open that coaching improve).

Checks: worker focused 33 passed / 6 xfailed; `npm` unit 740 passed. Defaults unchanged: C on, E off, DETOUR off, A/B off, D not promoted.

Stage-1 confounder: cold Linux chunk hashes differ from the 2026-11-05 Windows chunks despite the same settings fingerprint — host/run nondeterminism. GPU runs must capture decoded-frame hashes.