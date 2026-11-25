# Engine 6 audit

Date: 2026-11-25. Working tree: `main` at `fed4ac7a5c7fea3c79c303a88614b36d9b6d8e26`.
This is an audit and a plan. No extraction, replay, gate run, cloud resource or flag change was made for it.

The judging rule for later work stays the one in the request: a change counts only if it raises claimed-correct seconds per compute dollar on the same decoded pixels and passes `bench/gates/balanced_5.2.json` and `bench/gates/coverage_floor.json` against the CPU FP32 reference. Neither gate was edited.

## 1. Repository state

`HEAD` is `fed4ac7` ("Recover interrupted player identity and record the missing full-match replay"). The working tree is dirty. Uncommitted edits include the flagship progress ledger, identity, OCR, tracker, periods, calibration, the tracking report parser and screen, locales, and the GPS match-alignment module. Untracked files include `identity_review.py`, `learned_embed.py` and their tests. Those files were not modified for this audit.

Worktrees present, not used:

| Path | Commit |
|---|---|
| `.local/fm-paired-20261124/ref-96d88b1` | `96d88b1` |
| `.local/exp-analysis-dev-2026-11-14` | `9389a2d` |
| `.local/stg-pilot2-overlay-5265405` | `5265405` |
| `C:/ZLI/M335/ScoutX-gpu-benchmark` | `01f9459` |
| `C:/ZLI/M335/ScoutX-resolve-timeout` | `bc5a9d1` |
| temp private-pilot and staging-wif trees | `e70b905`, `b89ab42` |

Several documents the request names are not on `fed4ac7`. They were read from other commits and are marked that way below. They are not the current product contract.

| Document | Where it actually is |
|---|---|
| `docs/video/flagship-overhaul-progress.md` | On `HEAD`, plus a large uncommitted continuation |
| `docs/video/flagship-architecture.md` | On `HEAD` (`af75079` is an ancestor). Status inside the file: proposed, 2026-10-23 |
| `docs/video/full-match-validation.md` | On `HEAD`. Protocol exists. No sealed second match is in the tree |
| `docs/video/intelligence-5.3-gpu-benchmark-report.md` | On `HEAD` |
| `docs/video/wrong-player-exchange-2026-11-02.md` | On `HEAD` |
| `docs/release/cpu-production-plan-2026-11-21.md` | On `HEAD` |
| `docs/release/cpu8-regate-session-summary-2026-11-23.md` | On `HEAD` |
| `docs/video/pre-pilot-decision-2026-11-18.md` | Not on `HEAD`. Latest blob is `f587803`, which is not an ancestor |
| `docs/video/speed-cost-2026-11-21.md` | Not on `HEAD`. Latest blob is `5b07391`, not an ancestor |
| `docs/video/build-plan-2026-11-21.md` | Not on `HEAD`. Latest blob is `9547b7e`, not an ancestor |
| `docs/video/analysis-experiments-2026-11-14.md` | Not on `HEAD`. Latest blob is `e70b905`, not an ancestor |
| `docs/release/cpu8-regate-runbook-2026-11-22.md` | Not on `HEAD`. Latest blob is `d69f868`, not an ancestor |
| `bench/results/cpu8-cloudrun-20261122/` | Not on `HEAD` and not in the working tree. The JSON is in commit `4c2a827`, which is not an ancestor of `HEAD` |

`4c2a827` is still in the local object database, so the timings below were read from that commit's `full_match.json`. They are not a file a checkout of `main` contains.

## 2. The only gate-passing full run

Source: `4c2a827:workers/football-cv/bench/results/cpu8-cloudrun-20261122/full_match.json`. One sequential Cloud Run job, 8 vCPU, 32 GiB, `CPUExecutionProvider`, balanced mode, CUDA unavailable. Input `IMG_4809_proxy_10fps.mp4`, SHA-256 `b1077af3c975e0e1b5d15a9f0dc3895ac87fa296cad4f41d267368c260fb679c`, 2,035 s, 20,350 frames, 10 fps, 1920×1080, H.264 High 10, HLG (`arib-std-b67`, BT.2020). Chunks: seven, 300 s, last one 235 s. `SCOUTX_KEYFRAME_EVERY` was null, so the code default of 1 applies (`extract.py`).

| | Measured |
|---|---|
| Wall | 6,628.491 s, `timingComplete: true` |
| Claimed recall | 0.621 of 50.4 labelled target seconds |
| Claimed-correct | 31.3 s |
| Confirmed-correct | 10.5 s |
| Wrong identity | 0.0 s on the labelled intervals |
| IDF1 | 0.766 |
| Gate | `balanced_5.2` passed, as recorded in `docs/release/cpu-production-plan-2026-11-21.md` and the session summary. This audit did not re-run `compare_runs.py` |

Where the 6,628 s went, from that same JSON:

| Stage | Seconds | Notes |
|---|---|---|
| Model init | 17.5 | |
| Discovery | 1,035.4 | OCR 499.2, detect 270.0, decode 72.3. Effective detect rate 2 fps. 4,070 samples |
| Extraction | 4,897.8 | Detect 3,878.9 (79% of extraction), decode 547.4, scene/CMC 257.2, colour 138.8, embedding 45.6. Propagate 0. 20,350 frames |
| Resolve | 610.9 | Numbers/OCR 357.9, identity 190.3, tracklets 58.7, timeline 2.2 |

Discovery and extraction are separate stages in this record. `discovery.py` opens the file and resamples to 10 fps. `extract.py` opens it again. The production handlers do the same: `tracking_v3.py` passes `request.source.url` into both `discover` and `extract`.

Per-frame detect cost on this run: 3,878.9 / 20,350 = 191 ms. The failed L4 run in `bench/results/5.3/l4-20261029-netherlands/gpu/full_match.json` detected the same 20,350 frames in 256.6 s, which is 12.6 ms/frame, and finished extraction in 1,051 s. That run's claimed recall is 0.494 and IDF1 is 0.661. The 5.3 GPU report says the comparison mixed precision, backend and batch, and that no same-image FP32-then-FP16 pair was measured. The 13 ms figure is real and it belongs to a run that failed the relative gate.

The JSON's own cost block is labelled estimate, retrieved 2026-10-28, and prices a G2 `g2-standard-8` with an L4 at $1.2036/h. It prints $2.22 for this run and, by straight multiplication, $5.88 for 90 min and $9.15 for 140 min. The production plan on `HEAD` says that price model is not the CPU Cloud Run allocation. Those dollar figures are not an invoice. Billing for the job was unlinked.

## 3. What the uncommitted 0.706 numbers are

They are not in the committed progress doc. The committed file still says no full-match candidate has been run.

The uncommitted ledger describes replays on an existing stage-1 bundle, not a new extraction and not the CPU8 job:

- Displacement replay, timeline `89e471cf…`, against the joined candidate: claimed recall 0.706, claimed-correct 35.6 s, IDF1 0.825, confirmed-correct still 10.5 s, wrong identity 0.3 s at 244.5–244.7 s. `balanced_5.2` fails on that 0.3 s. The coverage floor fails.
- A later colour-read replay on the same bundle moves two labelled frames (243.0 s and 243.1 s) to confirmed. Confirmed-correct becomes 10.7 s. Claimed recall stays 0.706. Wrong identity stays 0.3 s. The gates still fail.

50.4 × 0.706 = 35.6, so 0.706 is 35.6 seconds out of the same 50.4 labelled target seconds as the reference, not 70% of a match. Confirmed time is about 11 seconds. These are window scores on one recording. They are not a full-match result, and they are not a gate pass.

`identity-judgments.json` is not in the tree. The uncommitted ledger says Phase 18 stays paused until that file exists. This audit did not create labels or open the review packet's `provenance.json`.

## 4. Production input is not the evaluated input

Checked in the current tree:

- `functions/src/analysis/trackingOrchestrator.ts` signs `job.videoStoragePath` and sends that URL to discovery and extraction. There is no transcode to the 10 fps proxy.
- `functions/src/uploads/probe.ts` accepts H.264 and HEVC, 1–240 fps, long side up to 7,680. `functions/src/uploads/model.ts` allows 150 minutes.
- `extract()` reads `CAP_PROP_FPS` and, with the default stride of 1, detects every source frame. The default decoder is OpenCV. The ffmpeg colour path is opt-in for extraction because HDR identity was evaluated on OpenCV frames (`extract.py`).
- `discover()` resamples to 10 fps and runs the 416 px detector every fifth decoded frame.

The 547 s decode and 191 ms detect figures are for the 10 fps proxy. The original is a different file. `docs/video/hdr-reference-and-validation-2026-11-02.md` records `IMG_4809.MOV`, SHA-256 prefix `6450a5bb`, HEVC Main 10, iPhone 15 Pro, **30 fps**, HLG plus a Dolby Vision profile 8 record. `docs/video/gpu-benchmark-setup.md` states the worker processes every source frame, there is no backend step that converts an upload to 10 fps, and the original therefore has three times the stage-1 frames. Its accuracy has not been validated. Exact frame correspondence between the proxy and the original was not established. A 60 fps upload is still unmeasured; the phone original on record is 30 fps.

A 140-minute file has never been analysed. The 7 h 36 min and ~$7 figures in the previous note are straight-line stretches of the 2,035 s CPU run. The JSON's own stretch at the G2 price is $9.15. Neither is a measurement.

## 5. Clocks and layout

From `trackingProgress.ts` and `trackingDeadlines.ts` on `HEAD`:

- Discovery chunks are 600 s. The worker accepts a discovery chunk up to 1,800 s.
- Extraction starts with 120 s, then 300 s, and grows only to stay within 61 segments, capped at 900 s.
- Function timeout 1,800 s. Worker client 1,680 s. Lease 1,860 s. Resolve attempts 3. OCR-refresh attempts 2.
- Discovery and extraction dispatch concurrency is 6 (`trackingOrchestrator.ts`). Resolve dispatch concurrency is 4 (`trackingCallables.ts`). Phases are in series: extraction waits until discovery finishes.

The CPU8 job was seven 300 s chunks in series. Production for the same 2,035 s file would be a 120 s first segment and then 300 s segments, eight of them, and those segments can run with concurrency 6. That layout has not been gated against the CPU8 claims. The production plan says so.

Resolve at 611 s fits the 1,680 s client on this 34-minute file. A straight-line stretch to 90 minutes of video is 1,621 s, which the production plan already calls an unmeasured estimate with about a minute of slack. A stretch to 140 minutes is about 42 minutes and does not fit the client. A retry does not make a deterministic overrun finish.

## 6. Capability classification

**Default on, in the worker code.** YOLOX-s at 1,280 px on every extracted frame. Discovery detector at 416 px, 2 fps of a 10 fps decode. OpenCV decode for extraction. Per-match appearance, `GALLERY_SELF_TRAINING = False` (`identity.py`). Lone digits are not evidence. Metres only through the calibrated physical path. Period labels exist in `periods.py` and are not used to skip detection.

**Flagged off.** `SCOUTX_KEYFRAME_EVERY=2` is the `fast` mode in `modes.py` and is marked `accuracyValidated: false`. `SCOUTX_OCR_ENHANCE` stays off in the uncommitted ledger. `SCOUTX_DECODER=ffmpeg` and `SCOUTX_HWACCEL` are opt-in. `TRACKING_V3_ENABLED` and `CV_WORKER_APPROVED` stay off; the worker route returns 404 unless enabled. INT8 is not the default detector name.

**Tried and rejected, with the source.**

| Attempt | Result | Source |
|---|---|---|
| Keyframe every 2nd frame | Labelled #20 time 23.6 s to 17.4 s on one slice, +0.5 s wrong on the other. A later run was refused with exit 5 | `intelligence-5.1-report-2026-10-28.md`; `intelligence-5.2-gpu-prebenchmark.md` |
| L4, Torch FP16, batch 8 | Claimed recall 0.494 vs 0.621, IDF1 0.661 vs 0.766 | GPU report and `gpu/full_match.json` |
| INT8 PARSeq | 8 of 56 confident two-digit reads changed | 5.1 report |
| INT8 detector, all tensors quantised | 0 boxes | `speed-cost-2026-11-21.md` at `5b07391`, not on `HEAD` |
| INT8 detector body | 2.3–2.6× faster detect, 2.5× faster stage 1 on a 600-frame night window. Box agreement is not identity agreement. OCR crops 785 to 752 (−4%) on that window. Never passed `balanced_5.2` | same off-main doc |
| Horizontal tile on eight missed frames | No person proposal at IoU ≥ 0.5 | Uncommitted progress ledger. Eight frames, not a full-match tiling study. No SAHI package is in the tree |
| DINOv2 ViT-S/14 on 17 queries | Below the colour signature. Not integrated | Uncommitted ledger |

**Missing.** A full-match replay. One shared decode. A server-side working proxy. A period skip that is proved not to drop labelled target time. A GPU ladder on one image and one pixel hash. A resolve path that can finish 140 minutes. A second labelled match. Per-stage dollars on the production report.

The 2026-11-03 replay is unavailable. `replay_recovery_manifest.json` lists 19 files. `original_timeline.npz` matches a committed timeline byte for byte. The other 18 were not found. Two local extractions were rejected because their detection hashes differ (`a060fb73…` and `0e9054b3…` against the required `4b9914ad…`).

## 7. Research, cited, not adopted

Checked 2026-11-25. Nothing below was vendored.

- ByteTrack reference code is MIT: [ifzhang/ByteTrack](https://github.com/ifzhang/ByteTrack). OC-SORT reference code is MIT: [noahcao/OC_SORT](https://github.com/noahcao/OC_SORT). Roboflow `trackers` is Apache-2.0 and says its SORT, ByteTrack, OC-SORT, BoT-SORT and C-BIoU are clean-room: [roboflow/trackers](https://github.com/roboflow/trackers). Its published table includes SoccerNet and SportsMOT HOTA. The current engine already has its own tracker. Replacing it is an identity change and needs the v2 gate. Ultralytics and BoxMOT are AGPL and stay out.
- Deep-EIoU's public repo ([hsiangwei0903/Deep-EIoU](https://github.com/hsiangwei0903/Deep-EIoU)) did not present a licence in the retrieved page, and the readme credits Torchreid. The expansion-IoU idea can be reimplemented. The repository and its re-identification weights are not approved. Cross-match galleries stay forbidden.
- RF-DETR Nano through Large detection are Apache-2.0. Detection XL, 2XL, Atto, Femto and Pico are Platform Model License 1.0 and are not approved for self-hosting: [Roboflow model licences](https://docs.roboflow.com/models/model-licenses), [roboflow/rf-detr](https://github.com/roboflow/rf-detr). No RF-DETR weight was downloaded. The in-repo detector remains YOLOX.
- SoccerNet data is not for commercial use: [SoccerNet FAQ](https://www.soccer-net.org/faq). `sn-gamestate` is GPL-3.0: [licence](https://github.com/SoccerNet/sn-gamestate/blob/main/LICENSE). Jersey tracklets in [sn-jersey](https://github.com/SoccerNet/sn-jersey) are derived from that data. Papers can inform design. The data and the GPL code cannot.
- Koshkina & Elder (legibility, pose-guided torso, PARSeq, tracklet vote) and Bhargavi et al., arXiv:2203.00734, are design references. The E9 kit already in the bench tree is the only fine-tune path, and it stays gated by zero team-mate "20" reads. The CC BY-NC SoccerNet PARSeq weights stay out.
- ONNX Runtime TensorRT EP flags `trt_fp16_enable` and `trt_engine_cache_enable` are documented by Microsoft. They are a later rung of W4, after an FP32 GPU pass has beaten nothing and still passed the gate. DeepStream `nvinfer` `interval` is the pattern for "detect every N frames and let the tracker predict the rest." The idea is already sketched by `BoxPropagator` and was refused as a blanket stride of 2. DeepStream itself is not imported.
- Cloud Run L4 jobs are documented in Belgium, Netherlands, Iowa, Northern Virginia, Singapore, and Mumbai by invitation. Zurich is not on that list: [Cloud Run GPU jobs](https://docs.cloud.google.com/run/docs/configuring/jobs/gpu), read 2026-11-25. An L4 job cannot stay in `europe-west6`. Moving footage to Belgium or the Netherlands is an owner decision, not an engineering default.
- Veo Player Spotlight, Trace PlayerFocus, Hudl and Wyscout are product references for "analyse once, show the player their own clips." SkillCorner's off-screen extrapolation conflicts with the evidence rule and is not a design to copy. Football Manager ranges and EA FC measured-only cards match the rule already in the report: a number is published only for the seconds that were actually observed.

## 8. Cost arithmetic, checked, not a quote

Cloud Run job list prices on the pricing page, 2026-11-25: Tier 1 CPU $0.000018 per vCPU-second, memory $0.000002 per GiB-second. An L4 without zonal redundancy is $0.0001867 per second. Tier 2, which includes Zurich, is 1.2× on instance-based CPU and memory in the billing catalog cited by a 2026-10-11 reading ($0.0000216 and $0.0000024). This audit did not call the billing API.

An L4 plus 8 vCPU and 32 GiB at Tier 1 is about $0.000395 per second. Fifteen minutes is about $0.36. That matches the request's arithmetic. It is the price of the instance being alive, not a measured analysis, and Zurich cannot host that GPU.

The same 8 vCPU and 32 GiB without a GPU, for the measured 6,628 s:

| Region price | Compute |
|---|---|
| Tier 1 | about $1.38 |
| Tier 2 (Zurich) | about $1.65 |

The request's "$1.20 per 34 min" is the right order and not the figure this arithmetic gives. The JSON's $2.22 uses the G2+L4 price on a job that had no GPU. None of these were charged.

Thread scaling "2 vCPU = 23,174 vCPU-s, 8 vCPU = 60,224 vCPU-s, 1.54×" is a sentence in the CPU plan at `5b07391`, which is not on `HEAD`. 60,224 / 8 = 7,528 s, which matches the reference wall of 7,528.287 s, not the 6,628 s candidate. This audit did not re-measure a 2-vCPU run. It is not a basis for buying smaller instances yet.

## 9. Plan, with effort, stopped here

Order is the request's order. Each line is a guess of engineer time plus machine time. Machine time on the owner PC is in the same units as the 2026-11-06 extraction note: detection on this 34-minute proxy took 13,625 s of a 16,882 s extraction, and that extraction's hash does not match the lost replay. A new run is required. It is not authorised by this audit.

| Step | What | Effort | Stop condition |
|---|---|---|---|
| 0, this file | Audit | Done | |
| 1 | Owner picks the baseline image. The gate-passing job is `bc5a9d1` / digest `7e8d4872…`. The older lock `7a7dfa96…` is the Netherlands CPU reference, a different image. Image deletion was unverified | Half a day to write the runbook. No job started | Owner approval, and a decision that the footage may be read again |
| 2 | Fresh stage-1 of the 10 fps proxy, then `full_match_replay.py build` as `fmr-v2-<date>`, provenance only | One working day, dominated by 2–8 h of CPU if the 2026-11-06 rate still holds. Longer if the pinned image must be rebuilt | Do not call it the 2026-11-03 replay. Do not commit crops |
| 3 | `compare_runs.py` against the CPU8 `full_match.json` | Under an hour once stage 2 exists | Exit not 0: stop. Do not tune the gate. A mismatch means v2 is a new configuration, not a baseline |
| 4 | Re-point the opt-in full-match tests. Re-derive F6 and F17 and write down every changed expectation | One day | Tests that only pass by editing the gate are a stop |
| 5 | LABEL-1, a second match, 5 s samples, sealed with `full-match-validation.md` | Days of reviewer time. A 140-minute file is 1,680 samples | Until it exists, every full-match sentence remains about IMG_4809 |
| W1 | Measure decode of one real upload, then one hashed 10 fps working file if decode dominates | One to two days of code, plus one measured file. Pixel equality against the OpenCV HDR decode is the gate | A colour-path change that turns a "20" into an "11" is a stop |
| W2 | Share that working file between discovery and extraction | One day after W1. Saving is the second decode, about 72 s of discovery plus 547 s of extraction on the proxy, if the second open really goes away | Must not change pixels |
| W3 | Skip detection on pre-match, half-time and post-match after a cheap scan, and record the skip as a gap | Two days, then a gate. The labelled target seconds must be unchanged | Any lost labelled target second is a stop |
| W4 | cpu-onnx, then gpu-fp32-b1, b8, fp16-b8, then TensorRT FP16 | One owner-approved session per rung, in Belgium or the Netherlands, not Zurich. Each rung is a few hours of GPU time if the 1,051 s L4 extraction is typical, plus the gate | First failing rung is the boundary |
| W5 | Adaptive detect, default off | Two to four days. Blanket stride 2 already failed, so this is a policy with forced frames, not a constant | Needs v2 and the held-out windows |
| W6 | OCR only on legible crops, stop when a tracklet is settled, batch on GPU | Two days. OCR was 499 + 358 = 857 s of the 6,628 s | A lost team-mate veto or a new "20" on the wrong player is a stop |
| W7 | Resolve that can outlive 1,680 s: a job, or incremental resolve | Design is a day. Implementation is several, and it is a configuration change that must be gated | Do not raise the task timeout and call the layout equivalent |
| W8 | INT8 body, still labelled `onnx-int8`, offline until the gate passes | The recipe exists off `HEAD`. The gate does not | 97–99% box agreement is not a pass |
| W9 | Stage seconds, frame counts, instance type, and list-price dollars per analysed minute, labelled estimate | One day, no cloud | |

Targets V1 (34 min in ≤ 30 min on one L4, gate passing) and V2 (140 min in ≤ 60 min and ≤ $1) are goals. Today's only gate-passing number is 6,628 s on CPU. The stretch of 10–20 minutes at $0.25–0.50 needs the GPU path to pass and the non-match skip to be real. A recall of 95% is not a target until it is measured on full-match labels.

## 10. Owner decision required before Phase 1

1. Confirm that a fresh extraction of the IMG_4809 10 fps proxy may run on this PC, or approve a Cloud Run job with a named image digest, a region, a lifetime and a deletion step. This audit does not start either.
2. Choose the baseline: the gate-passing `bc5a9d1` image, or the older `7a7dfa96…` lock. They are not the same configuration.
3. Leave `identity-judgments.json` to the review session. Phase 18 stays paused.
4. Zurich cannot host the L4. A GPU rung needs an explicit region decision.

## 11. Reconciliation of the supplied Engine 6 baseline

Checked again on 2026-11-25. `HEAD` is still `fed4ac7`. The working tree is still dirty with the same uncommitted identity, period, report and GPS work. Nothing in this section was implemented.

| Supplied claim | Verdict |
|---|---|
| One cloud run, IMG_4809 proxy, 33:55, 10 fps, 8 vCPU, 32 GiB, 6,628 s, resolve 611 s | Confirmed in `4c2a827`'s `full_match.json`. That commit is not on `main`. Wall 6,628.491 s. Resolve 610.872 s. Instance clock in the session summary is 01:13:20–03:04:53 UTC, about 1 h 52 min, and that clock is not the processing timer |
| Windows extraction about 16,882 s | In the uncommitted progress ledger, dated 2026-11-06, of which detection was 13,625 s. Not repeated. Not a full analysis. Hash does not match the lost replay |
| 140 min would take about 7 h 36 min and cost about $7 | Unmeasured. Straight-line stretch of the 2,035 s CPU run. The JSON's own stretch at the G2+L4 price is $9.15. Tier-1 CPU list price for the measured job is about $1.38; Zurich about $1.65. No invoice |
| Resolve client 1,680 s | Confirmed in `trackingDeadlines.ts` (`28 * 60 * 1000`). A 90-minute straight-line resolve is 1,621 s and is unmeasured. A 140-minute stretch is about 42 minutes and does not fit |
| Benchmark chunks differ from production | Confirmed. Benchmark: seven 300 s chunks in series. Production: 600 s discovery chunks, then a 120 s first extraction segment and 300 s segments, concurrency 6, resolve concurrency 4 |
| Candidate 0.706 / 0.992 / 0.825 / 10.7 s / 0.3 s | Uncommitted window scores on 50.4 labelled seconds. Displacement confirmed-correct is 10.5 s; the later colour-read replay is 10.7 s. Not full-match. Gates fail. CPU8 reference stays 0.621 / 0.766 / 10.5 s / 0 wrong |
| `identity-judgments.json` absent, Phase 18 paused | Confirmed. No such file in the tree |
| Production CV disabled | Confirmed. Worker route 404 unless enabled. `docs/video/accuracy-report.md` still says the approval file is absent. That report's "nothing measured" sentence is older than the CPU8 run and is not the current evidence, but it is still the release gate |
| GPS rules preserved | The uncommitted `assessGpsMatch` work is still in the tree and was not changed in this pass |

## 12. Documents read for this pass

On `HEAD`, beyond the first audit:

- `current-engine-baseline-2026-10-30.md`. As of that date a fresh full-recording detector and OCR baseline was not established. The later CPU8 proxy run is the one that was. The baseline also says the evaluation proxy is not the 30 fps HEVC original.
- `acceptance-thresholds.md`. Proposal only (`eval/thresholds.json` status `proposed`). It asks for 30 videos, two annotators, identity accuracy ≥ 0.95, and a mean correct run ≥ 20 s. The current candidate meets none of those. Passing unit tests does not move this.
- `accuracy-report.md`. Dated 2026-10-24. Status NOT RUN for an independent orange #8 match. `approval.json` absent. Do not quote it as the latest IMG_4809 score, and do not treat later bench numbers as release approval.
- `analysis-cost-benchmark.md`. Orchestration fixture only. The dollar column uses one L4 recording and is an estimate. It calls no worker.
- `gpu-validation-2026-11-06.md`. Approved, then stockout in four zones. No VM. Estimated charge USD 0.
- `gpu-validation-proposal-2026-11-09.md`. Approved for a different operator. This checkout must not create the VM. The results directory contains `APPROVAL.json` and a pricing note, not a completed match.
- `cpu-divergence-and-label-time-audit-2026-11-01.md` and `windows-bundle-decode-trace-2026-11-02.md`. On the 1,150–1,180 s window, Windows and Linux decoded pixels differ on all 301 frames. An FFmpeg BT.601 limited-range conversion reproduces the Windows pixels, and swapping only that path reproduces the Windows detections, OCR, tracklets and metrics. The default decoder was not changed. Neither path is proven to be the correct HLG rendering. The GPU accuracy gap was not closed.
- `wrong-player-exchange-2026-11-02.md`. Already the source of the 0.3 s dispute. Not re-litigated.
- `full-match-validation.md`. The seal-and-score tool exists. No sealed second match exists.

## 13. Research, and what it does not licence

Checked 2026-11-25. No weight or repository was added.

- [SoccerNet](https://www.soccer-net.org/faq) data is research-only. [sn-gamestate](https://github.com/SoccerNet/sn-gamestate) is GPL-3.0 and is the code for arXiv:2404.11335. [sn-jersey](https://github.com/SoccerNet/sn-jersey) is derived from that data. None of it can ship in this product.
- [TrackLab](https://github.com/TrackingLaboratory/tracklab) is MIT. It is a research framework. Using the idea of a modular pipeline is fine. Importing it would still pull in whatever detector and re-identification model the config names, and those have their own licences.
- [PRTreID](https://github.com/VlSomers/prtreid) is under the Hippocratic licence HL3-LAW-MEDIA-MIL-SOC-SV, trained through SoccerNet and Torchreid. It is not an approved appearance model. The product rule remains: appearance is fitted inside one match, and there is no cross-match gallery.
- arXiv:2504.06357 (Constructor, SoccerNet GSR 2024) describes fine-tuned YOLOv5m, SegFormer calibration, DeepSORT with re-identification, and DeepStream TensorRT FP16 at up to 80 fps on an RTX 3080 Ti. YOLOv5 from Ultralytics is AGPL. The 80 fps figure is broadcast footage on a laptop GPU, not this phone camera and not this gate. The useful part is the shape: detect, calibrate, track, read the number, merge tracklets, and do the heavy stage in TensorRT. The code and weights are not approved.
- ByteTrack and OC-SORT reference code are MIT. Roboflow `trackers` is Apache-2.0. BoT-SORT is listed by the request and was not given a fresh licence reading in this pass, so it stays unapproved. The current tracker is not replaced.
- YOLOX stays the detector. RF-DETR Nano–Large are Apache-2.0; detection XL and 2XL are not. A detector change is a new gate, not a drop-in.
- ONNX Runtime's TensorRT EP and static quantisation docs are the W4 and W8 path already in the plan. Quantisation stays offline until `balanced_5.2` passes. NVDEC is only useful after the colour path is pinned: the Windows/Linux trace shows a matrix choice changes identity.
- DeepStream's `interval` is the pattern for skipping frames while a tracker predicts boxes. A blanket stride of 2 already failed on this footage. The 2024 GSR paper's real-time number is not evidence that stride is safe here.

The touchline phone recording stays in the class where pitch landmarks are not usable. Game-state minimap methods assume a broadcast camera. They do not unlock calibrated metres for IMG_4809.

## 14. Baseline attempt after authorisation, 2026-11-25

The owner authorised a local read of the proxy and a bounded look at the original, and named `bc5a9d1` as the preferred environment only if its provenance matches the gate run. Detail is in `engine6-baseline-provenance.md`.

The result JSON does name `bc5a9d1`. The lock file at that commit is `7a7dfa96`, so the historical lock and that commit are one tree. The result left `lockSha256` null. The image digest `7e8d4872…` is in the build record, and that image is not running here. This PC is Windows, Python 3.12.10, torch 2.8.0+cpu, OpenCV 5.0.0, ffmpeg 9.0.2. The gate run was Linux, Python 3.13.17, torch 2.14.1+cu130, OpenCV 4.14.0, ffmpeg 6.1.1. The replay was not started.

A one-second read of the proxy at 1,150 s found this PC's OpenCV byte-identical to BT.601. The explicit HLG filter differs by about 27 grey levels. The default decoder was left as it is. The proxy hash still matches `b1077af3…`. The original hash starts `6450a5bb`, 30 fps, and is the same 34 minutes, not a 140-minute upload.

## 15. Still blocked

The image digest `7e8d4872…` has to be the thing that runs the replay. It is not on this PC, and Docker is not running. Until that container is available, `compare_runs.py` has nothing new to score, and a speed or decoder change cannot be called an improvement. Production flags stay off.
