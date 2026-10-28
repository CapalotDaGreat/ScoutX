# Video Intelligence 5.2 — deferred OCR, identity drift, GPU readiness (2026-10-28)

This report continues 5.1 on `feature/player-tracking-v3`. It covers the "local work" option you chose: implement and validate everything this environment allows, and mark GPU, cloud, device and #7 work as **blocked**.

Everything below ran in this cloud container (**2 vCPU, 7 GB RAM, no GPU**) unless marked otherwise. Recordings are yours. They were used for testing only, never for training, and were never sent to an external AI provider. All labels are developer labels from **one annotator**, so every number here is indicative, not a validation.

Machine-readable results are in `workers/football-cv/bench/results/5.2/`:

- `identity_5.2.json`
- `night_ocr.json`
- `correction_profile_5.2.json`
- `ocr_follow_up_5.2.json`

Commits:

- `42cb1c7`, `15f1ddc`, `9542581`: phase 1, deferred OCR follow-up.
- `e2bd1ee`: phase 2, box-steal splits, GPU-ready options and the night OCR evaluation.
- The commit that adds this report.

Status labels used throughout:

- **Implemented**: the code is in the repository.
- **Tested**: an automated test runs it and passes here.
- **Measured**: a number came from a run in this container.
- **Estimated**: a number was computed, not run.
- **Blocked**: it could not be done here.
- **Production-approved**: nothing in 5.2 has this status.

## Summary

| Area | Status | Result |
|---|---|---|
| Deferred OCR follow-up after corrections | Implemented, Tested, Measured (CPU, worker side) | Background rounds read the crops a correction deferred: at most 3 rounds × 400 crops, a daily quota, and stale/cancel handling. The app shows "Checking a few additional moments" only while a round is queued or running. |
| Identity drift: box steals | Implemented, Tested, Measured | Removed a **held-out false "likely" attribution** that 5.1 made: 5.3 s in answers mode plus 0.6 s in auto mode. Development ground truth: auto IDF1 0.901 → **0.918**, answers mode unchanged (0.910), 0 s wrong in both. Claims on 5 multi-match pieces are identical to 5.1. |
| Night and small jersey numbers | Measured, **not enabled** | An open-set torso read finds 7 of 14 legible night numbers (main reader: 0 of 14) with 0 wrong at night. On daylight crops, 6 of 15 of its reads were wrong, so it is kept out of the pipeline. |
| GPU inference | Implemented (provider selection, inference modes, image, runbook); **Blocked** (no GPU) | No GPU speed or cost figure is claimed. |
| Cloud, Firebase, devices, #7 recordings | **Blocked** | No credentials (403), no Docker daemon, no phones. The #7 files are still partial. |
| Production approval | None | `CV_WORKER_APPROVED`, `CV_EVENTS_VALIDATED` and `TRACKING_V3_ENABLED` were not set. |

## 1. Repository audit

These are the starting points from 5.1 (`6e5303d`):

- **Tracklet-first identity.** Tracks are cut at contacts with a team-mate. Identity crosses a contact only when the link is clear, and it stays anchored for up to 30 s through clean handoffs.
- **Fast corrections.** The worker reads no new crops during a correction (2.2–2.9 s on this CPU).
- **Deferred crops.** The worker reported the deferred count (`engine.ocrDeferred`), but **nothing read the deferred crops later.** This was limitation 4 in the 5.1 report.
- **GPU prerequisites.** A batched YOLOX detector existed, with fp16 on CUDA. The ONNX Runtime path was CPU-only (hard-coded provider). A GPU Dockerfile existed but had never been built.
- **Held-out data.** No held-out evaluation of the frozen 5.1 thresholds existed. The interval ground truth (9 intervals, 50 s of #20) was also the development set.

## 2. GPU implementation summary (Implemented; performance Blocked)

- **ONNX Runtime providers.** `yolox_net.ort_providers` puts the CUDA execution provider first when `onnxruntime-gpu` is installed, and always keeps CPU last. It can be overridden with `SCOUTX_ORT_PROVIDERS`. TensorRT is used only when named, because its engine build is not measured.
  - On a CUDA provider the detector reports `on_gpu`, so stage 1 batches 8 frames, the same as the torch fp16 path.
  - CPU behaviour and the model name are unchanged, so caches stay valid.
  - Tested: `test_ort_providers_prefers_cuda_only_when_installed`.
- **Batching and fp16.** torch fp16 batched detection on CUDA (from 4.1/5.1) remains the default GPU backend (`SCOUTX_BACKEND=auto`). PARSeq/EasyOCR move to CUDA when it is available (existing behaviour).
- **Inference modes** (`scoutx_tracker/modes.py`):
  - `balanced` = production defaults, the only mode validated for accuracy.
  - `fast` = detector on every 2nd frame. 5.1 measured 0.5 s of wrong claims on a 60 s slice with this setting, so the mode is **refused** unless `SCOUTX_ALLOW_UNVALIDATED_MODE=1` (benchmarking only).
  - `detailed` = reads deferred crops during the correction itself. Not measured.
  - Usage: `eval "$(python3 -m scoutx_tracker.modes balanced)"`.
- **Image.** `Dockerfile.tracker-gpu` now installs `onnxruntime-gpu>=1.19` (CUDA 12) in place of the CPU wheel, and its version label is `football-cv/5.2.0-dev`. **Not built**: there is no Docker daemon here.
- **Runbook.** `bench/gpu_runbook.sh` records `nvidia-smi` and runtime versions, then runs:
  - detector throughput: torch fp32/fp16 and ORT CUDA at batch sizes 1/4/8/16;
  - the end-to-end pipeline per validated mode;
  - an ORT-CUDA versus torch A/B.

  Commands for the GPU host:

```
cd workers/football-cv
docker build -f Dockerfile.tracker-gpu -t pitchproof-tracker-gpu:5.2 .
docker run --rm --gpus all -v /path/to/videos:/data -v $PWD/bench/results/5.2/gpu:/out \
  -e PRICE_PER_HOUR=<instance $/h> pitchproof-tracker-gpu:5.2 bash bench/gpu_runbook.sh /data/IMG_4809.MOV /out
# CPU reference on the same clip: the same image/commands without --gpus (or the 5.1 CPU numbers)
```

- **Not done:** segment-boundary reconciliation for parallel GPU segments.

## 3. CPU-versus-GPU benchmark — **Blocked**

There is no GPU in the container and none on the laptop VM, Docker cannot build the image, and the registries return 403. **No GPU speed-up or cost is claimed.** The CPU reference numbers are in section 4 and in the 5.1 report (dense stage 1: 3.7 s per video second; discovery: 731 s on the 5.1 subset).

## 4. Full-match processing measurements (CPU, Measured)

Stage 1 and discovery are unchanged from 5.1; no new full-match extraction was run. The 5.2 changes sit on the resolve/correction path, so that path was profiled on the full IMG_4809 resolve (34 min), A/B on the same machine with steal splits off and on. The repeated runs were done after both variants had filled the shared OCR cache, so the first "cold"/"warm" OCR reads of whichever variant ran first are not counted against it.

| Call (wall s) | steal splits off (5.1 assembly) | **5.2** |
|---|---|---|
| cold | 31.89 | 18.2 |
| warm | 2.17 | 2.09 |
| warm2 | 2.57 | 2.17 |
| newAnswer | 2.9 | 2.42 |
| newAnswer2 | 2.53 | 2.3 |

Corrections stay at **about 2–2.4 s** with 5.2 (5.1 reported 2.2–2.9 s); there is no correction-speed regression. The cold-call difference is run-to-run noise on a shared 2 vCPU machine (the identity stage took 15.9 s in one cold run and 2.7 s in the other), not a 5.2 effect.


- **Box-steal detection** adds **0.22 s** per tracklet assembly on the full match (219 455 track rows, Measured). It runs once per assembly and is memoised in a persistent worker.
- **Function-level tests** of the cut and link logic are in `tests/test_52.py`.

## 5. Jersey OCR evaluation (Measured; change **not enabled**)

**Night set.** 140 crops from IMG_4529 (night) pieces at 16, 21 and 24 min. Developer labels:

- 14 legible numbers: #20 ×10, #12 ×4.
- 31 non-players.
- 17 unsure.

Thresholds were chosen on pieces 960 + 1260 and checked on 1440.

| Method (night set) | Legible numbers read | Wrong reads |
|---|---|---|
| Main reader (5.1) | 0 / 14 | 0 |
| Main reader + CLAHE | 1 / 14 | 0 |
| Upscale + sharpen | 0 / 14 | 0 |
| Multi-frame median crop | 0 / 14 | 0 |
| Tracklet vote of main reads (±1 s) | 0 / 14 | 0 |
| **Open-set torso grid** (16 colour torso windows, one PARSeq batch; ≥ 0.99, no other number ≥ 0.9) | **6/9 (threshold-selection pieces), 1/5 (held-out piece)** | **0** (also 0 on 31 non-players and the unlabelled crops) |

Why the night reader fails: its binarised digit localiser finds no digit-shaped regions on dark, low-contrast shirts. Colour torso windows let PARSeq read "20" anyway.

**Daylight check, before enabling.** I looked at the 15 crops where the open-set read fired but the main reader had nothing (IMG_5105 ×9, IMG_4809 ×6):

- 5 correct.
- **3 wrong digits:** "10" read as 50, "7" as 51, "17" as 75.
- **3 numbers "read" on shirt fronts** with no number.
- 4 could not be verified by eye.

A reader that is wrong on 6 of 15 of its extra daylight reads is not safe even as weak evidence, so it is **not used by the pipeline**. It stays in `scoutx_tracker/ocr.py` (`open_torso_read`, frozen thresholds) with a unit test. A night-only gate with a separate verification step is the next step; it needs more labelled night footage than one piece.

On IMG_4809 sample crops where the main reader did read a number, the open-set read agreed 66 times and disagreed 0 times at the frozen threshold.

## 6. Tracking accuracy comparison

### Held-out audit of frozen 5.1 thresholds (new in 5.2)

**Set-up.** Five 30 s windows of IMG_4809 that are not part of the interval ground truth, chosen at random before any 5.2 change: 129–159, 819–849, 893–923, 1050–1080 and 1988–2018 s. I inspected every box that either mode claimed as #20, on crop sheets.

**Finding (5.1).** In answers mode (your 39 corrections), 5.1 showed **another player** as "likely #20" for **5.3 s** of claimed frames between 17:44.6 and 17:53.2 (1064.6–1073.2 s). Auto mode did the same for 0.6 s (1072.7–1073.2 s).

**Root cause.**

1. You answered "yes" at 1073.4 s on a dark-haired player.
2. Tracker track 2250 had followed a fair-haired team-mate (whose own track reads #24) until 1073.2 s. At 1073.3 s it **jumped onto the answered player**, whose own track (2212) had been lost one frame earlier. The two players' boxes never overlapped in the same frame, so the 5.1 contact cut did not trigger. An earlier contact at 1072.6 s was accepted as "same" (margin 0.09) because the 2.5 s appearance window after it already contained the other player.
3. 5.1's anchored continuity then carried the "yes" back along the track for about 9 s.

**Fix (5.2, `crossings.py`).** A **box steal** is a track whose new box matches the motion-extrapolated box of a same-kit track that ended within 3 frames (IoU ≥ 0.4), clearly better than its own previous box (by 0.15). Contact frames are excluded.

- The track is cut at the steal, and identity crosses the jump only when appearance decides:
  - a swap to the other player at ≥ SWAP_MARGIN (0.20);
  - "same" when appearance prefers the tracker's own piece;
  - otherwise unclear (no identity passes).
- If the other piece has no usable appearance, the existing 5.1 rule for a piece without a competitor applies: follow only at a cost ≤ CLEAR_MARGIN (0.12).
- No confirmation threshold was changed.
- One rule was revised after evaluation: the first version cut at the end of every contact piece, which wrongly removed 5 s of correct night coverage. That version was rejected; steals are now detected on the tracker's own tracks.
- IMG_4809 has 137 steal cuts and 463 contact events.

**Result on the held-out windows:**

| Engine | Answers mode claimed | Wrong | Auto mode claimed | Wrong |
|---|---|---|---|---|
| 5.1 (frozen) | 30.7 s | **5.3 s** (1064.6–1073.2) | 4.5 s | **0.6 s** |
| 5.2 | 25.3 s | **0 s** | 0 s | 0 s |

- The remaining answers-mode claims are the answered player from 1073.3 s (checked on crops) and a distant ~50 px player at 129–159 s, which cannot be verified either way (same in both engines).
- Auto mode **loses 3.9 s** of "likely by appearance" claims after the jump that were probably correct. They now show as ambiguous, because the jump is unclear. That is the cost of not guessing across an unexplained tracker jump.
- The 1050–1080 window has now been used for diagnosis and is part of a regression fixture (`tests/fixtures/img4809_1073_slice.*`, no images), so it is **no longer held out**. The other four windows are.

### Development ground truth (interval GT, IMG_4809; developer labels, the set 5.1 was tuned on)

| | 5.1 auto | 5.2 auto | 5.1 answers | 5.2 answers |
|---|---|---|---|---|
| IDF1 | 0.901 [0.826, 0.976] | **0.918** [0.870, 0.999] | 0.910 | 0.910 |
| Claimed recall | 0.819 | **0.849** | 0.835 | 0.835 |
| False attribution | 0 s | 0 s | 0 s | 0 s |
| Identity switches | 0 | 0 | 0 | 0 |
| Confirmed visible (whole match) | 25.7 s | 25.7 s | 68.2 s | 66.1 s |
| Likely visible (whole match) | 182.2 s | 190.9 s | 355.0 s | 389.2 s |

- Square brackets are 95 % bootstrap intervals by interval.
- Crop labels (3.2 harness) are unchanged: 9 of 10 target crops claimed, 0 of 138 other-number crops and 0 non-players claimed.
- In answers mode, "confirmed visible" drops by 2.1 s because steal cuts shorten some answered pieces; those frames become "likely".
- The extra "likely" time across the whole match is largely unlabelled. Like all such time, it is unverified.

### Mandatory regression tests

- The 5.1 31:44 fixture still passes.
- The new held-out fixture reproduces the 5.1 failure with steal splits off (more than 10 wrong frames) and shows **0 wrong** with them on, with at least 75 % of the answered player's labelled frames kept.

## 7. Deferred OCR implementation (Implemented, Tested; worker side Measured)

**Worker.**

- `POST /v3/tracking:resolve` accepts `ocr: {mode: "refresh", maxNewCrops ≤ 2000}`.
- A refresh reads at most that many not-yet-read crops, in a fixed order. The order is deterministic, so a retried round reads the same crops.
- The report includes `engine.ocrDeferred` and `engine.ocrRead`.
- A normal correction still reads 0 new crops, so corrections stay fast.

**Functions** (`trackingFollowUp.ts`, `trackingCallables.ts`).

When a correction publishes a report with deferred crops, a follow-up is planned inside the same publish transaction:

- One chain per feedback revision.
- At most 3 rounds × 400 crops.
- A further round only if the previous one reduced the deferred count, so a chain cannot loop.
- A per-user daily quota (60).
- Deterministic Cloud Tasks ids, so a retried publish never schedules a round twice.

`refreshTrackingOcrTask` runs a round and handles these cases:

- A **newer answer** makes the chain `stale`, and the round does nothing.
- A **cancelled analysis** gives `cancelled`.
- An **exhausted quota** gives `limited`.
- Worker **failures** give `failed`.
- A **refresh never sends notifications**.
- Each successful round **publishes a new report version** through the normal monotonic path.

**App.** "Updated your match. Checking a few additional moments." appears only while the follow-up is `scheduled` or `running` and the report is not stale. The text is in 7 locales.

**Tests.** 5 TS unit tests (rules, scheduling and dedup, stale/cancelled, quota, UI visibility) and 2 worker tests (bounded order, contract).

**Measured** (worker side, IMG_4809, CPU):

| Step | Wall s | Crops read | Still deferred | Confirmed / likely visible (s) |
|---|---|---|---|---|
| warmup (cold models) | 11.39 | 0 | 878 | 70.0 / 385.5 |
| correction (5.1: no OCR) | 0.96 | 0 | 878 | 70.0 / 385.5 |
| refresh round 1 | 163.68 | 400 | 474 | 70.0 / 385.6 |
| refresh round 2 | 61.26 | 400 | 60 | 67.9 / 391.2 |
| refresh round 3 | 15.84 | 66 | 0 | 67.9 / 391.2 |

How this was measured: a copy of the OCR cache had 1500 random reads removed, to emulate crops the earlier passes never read. With that copy:

- A correction deferred **878** crops and still answered in **0.96 s**.
- Three follow-up rounds then read them all: **0** left after round 3, in **4.0 min** of background CPU time. Most of that time is shirt-number reading at about 0.1–0.4 s per crop on 2 vCPU.
- The final report equals the report built from the full cache (67.9 s confirmed / 391.2 s likely).
- Rounds stopped by themselves as soon as nothing was deferred.

With the production cache, nothing was deferred, so no round was scheduled (1.16 s correction). GPU OCR would shorten the rounds, but that is not measured.


**Blocked:** Cloud Tasks / Firestore end-to-end (no Firebase credentials, no emulator for the rules), so the latency from enqueue to published version is not measured.

## 8. Multi-match evaluation (Measured)

Dense stage 1 was run on 60 s pieces of IMG_4529 (night: 16, 21, 24 min) and IMG_5105 (day: 0, 3 min). **5.2's claims are identical to 5.1's on all five pieces**: same frames, states and boxes. Using the 5.1 audit labels, that is 61 correct frames, 12 unsure and 0 wrong.

**#7 recordings: Blocked.** IMG_6565 and IMG_7332 are still stuck at 4 553 075 124 and 3 854 432 936 bytes, with no index ("moov atom not found"). Nothing was evaluated on #7 or on a non-orange kit.

## 9. Cost-per-match analysis — Estimated only where stated; GPU **Blocked**

**CPU (Measured in 5.1):**

- Dense stage 1: 3.7 s per video second on 2 vCPU, which is about 2.1 h for a 34-min match.
- Discovery: 731 s on the 5.1 subset.
- Corrections: about 2 s (section 4).

**GPU:** no instance price, throughput or cost per match is given, because none was measured. `gpu_runbook.sh` takes `PRICE_PER_HOUR` and writes cost per measured run.

## 10. Cloud integration results — **Blocked**

gcloud has no credentials, Firebase/GCR return 403, and there is no Docker daemon. Nothing was deployed, and no release flag was touched.

## 11. Device testing results — **Blocked**

No phones or simulators are reachable from this environment. The app change is covered by unit tests, typecheck and lint only.

## 12. Test summary (all run here, after the final code change)

| Suite | Result |
|---|---|
| Worker `pytest` (`workers/football-cv`) | **527 passed**, 0 failed (includes the 8 new tests in `test_52.py`) |
| `npm run test:unit` | **718 passed**, 0 failed |
| `npm run typecheck` (app + tests) | passed |
| `npm run lint` | passed, no findings |
| Functions `npm run build` (tsc) | passed |
| Firestore rules emulator, device / E2E tests | **not run (Blocked)** |

## 13. Remaining blockers and limitations

1. **GPU performance and cost** (sections 2, 3 and 9): no hardware. The runbook is ready.
2. **Cloud / Firebase end-to-end** for the follow-up chain: no credentials.
3. **Devices**: none available.
4. **#7 recordings**: files still incomplete. No evaluation on #7 or another kit colour.
5. **Night jersey reading**: the open-set reader works at night but is unsafe in daylight, so it is not enabled. It needs a verification step and more labelled night footage, licence-reviewed and not customer training data.
6. **Evaluation size**:
   - One annotator.
   - 50 s of labelled #20 on the development set.
   - Four untouched held-out windows remain.
   - The box-steal rule was designed after seeing one held-out failure.

   Zero errors in these samples is not a zero error rate.
7. **Steal-trigger precision**: a visual sample showed many triggers are benign, where the "lost" track was a duplicate of the same player. The link rule then keeps the tracker or marks the jump unclear. That costs some coverage (auto: 3.9 s in one held-out window) but no wrong attributions in any evaluated set.
8. **Not done**: segment-boundary reconciliation for parallel GPU segments, and a GPU OCR batch benchmark.
9. **Release gates unchanged.**

## 14. Deployment and rollback

- **Versions:** worker `football-cv/0.9.0`, engine `5.2.0`. It reports nothing to users until `TRACKING_V3_ENABLED` is set and **0.9.0 is added to `CV_WORKER_APPROVED`**. Neither was done.
- **Functions:** deploy `refreshTrackingOcrTask` (Cloud Tasks queue, `maxAttempts` 2, concurrency 2) together with the updated callables. Existing reports stay valid, and follow-ups publish monotonic report versions.
- **New settings (all optional):**
  - `SCOUTX_STEAL_SPLIT` (default 1; 0 restores 5.1 tracklet assembly exactly);
  - `SCOUTX_ORT_PROVIDERS` (default auto);
  - `SCOUTX_ALLOW_UNVALIDATED_MODE` (benchmarks only).
- **Rollback options:**
  - route traffic back to the 0.8.0 revision;
  - keep 0.9.0 and set `SCOUTX_STEAL_SPLIT=0`;
  - disable follow-ups by not deploying, or by pausing, the `refreshTrackingOcrTask` queue. Corrections still work and simply leave `ocrDeferred` unread, as in 5.1.
