# Engine 7.0, first implementation session, 2026-11-25

Commercial targets in the Engine 7.0 specification are goals. None of them was measured in this session. The 0.706 window candidate was not promoted. Production CV stays off. No cloud resource was created.

## Reference recovery

Blocked on this PC. Docker is not running, so image `sha256:7e8d48728c75be551a8d5c057f9cc9020580b43682bd87cea9e9cd1b94263e2d` was not started. The registry name on record is `europe-west6-docker.pkg.dev/pitchproof-stg-pilot2/scoutx-pilot-images/tracker@sha256:7e8d48728c75be551a8d5c057f9cc9020580b43682bd87cea9e9cd1b94263e2d`. HEAD remains `fed4ac7a`. The historical result copies under `.local/engine6/cpu8-4c2a827/` were left in place. A Windows extraction was not named as a reconstruction of that run.

## What was implemented

Four worker modules and one Functions module. None is called by `extract()`, discovery, or the orchestrator.

| Module | Flag | Behaviour while off |
|---|---|---|
| `scoutx_tracker/preparation.py` | `SCOUTX_CANONICAL_PREP=1` | The plan stays `direct`: OpenCV, source frame rate, no proxy file. |
| `scoutx_tracker/scheduler.py` | `enabled=False` on `decide` | Detect every working frame. Fixed stride raises. |
| `scoutx_tracker/ladder.py` | admission only | Refuses stale extraction caches, fixed stride, the 0.706 candidate, and an unapproved full recording. |
| `scoutx_tracker/recording_assessment.py` | none; pure | Highlights may be possible. Identity is not measured. Metres are unavailable without calibration and not validated with it. Off-camera positions are not invented. |
| `functions/src/analysis/analysisBudget.ts` | none; pure | Labels the 2,035 s resolve as measured and every other duration as extrapolated. |

The streaming command reuses `colour.working_space_filter`. For the documented IMG_4809 rate of 29.997 fps, an integer step down to 10 fps is recorded as not aligned. 5, 8 and 10 fps stay candidates with unmeasured consequences for distant players, identity, jersey reads, short ball contacts and physical metrics. No proxy codec is approved. Hardware arguments can be built and are marked not executed.

`analysisBudget` records that the production segment plan is not the historical seven-chunk benchmark. The extrapolated resolve for 8,400 s exceeds the 1,680 s client. The extrapolated resolve for 5,400 s still fits that client, and that fit is not a measurement. Upload, queue, retry, highlights, storage, network and startup are listed as unmeasured costs. The non-detector remainder of the measured wall is 6,628.491 − 3,878.86 s.

## Competitive notes checked against provider pages

These are provider statements, not PitchProof measurements.

- Veo Help Center (player stats, updated 1 October 2026; Analytics 2 overview): Analytics 2 is bought by the club or team. A player claims a jersey number on their own team. Physical stats are described as AI-generated and not manually editable. Player-level physical data is described for recordings after the add-on, and the help text also says player stats apply to matches uploaded after 18 August 2026. Latency, accuracy and price were not established here.
- SkillCorner product pages (physical data, XY tracking, and the 19 November 2026 physical-data article): they describe single-camera tracking, including a model that estimates positions when a player is off screen, and they publish their own comparison with their previous version. PitchProof does not adopt off-screen position invention. Their accuracy and price were not measured here.

Trace, Hudl, Wyscout, BuildUp, PlayerNation, Scoutiqo, StepOut, Pelayar and AI on the Ball were not re-read in this session.

## Experiment ledger

| Field | This session |
|---|---|
| Hypothesis | A default-off preparation contract, a deadline budget and a ladder can be tested without a two-hour extraction. |
| Expected benefit | Later experiments stop treating the 30 fps upload as if it were the 10 fps proxy, and stop repeating the full recording for a unit-sized question. |
| Runtime | Unit tests only. No footage was decoded for these tests. |
| Acceptance | New tests pass. `extract()` defaults remain OpenCV and keyframe every 1. |
| Result | Admitted at ladder level 0. No speed or accuracy delta. |
| Stop | Do not hook either module into production until a candidate passes both existing gates on fresh evidence. |

## Next highest-value experiment

Run container `7e8d4872` with `CPUExecutionProvider` on the verified proxy, then build a new replay under a new identifier. Until that image is available, the next local measurement is detector and OCR output on the same 1,150–1,151 s frames already compared above. Pixel differences are not that result. It is not a substitute for the full gate.

## Engine 7.1, 2026-11-25

The historical container was checked again. Docker is not running, so the image was not started and neither acceptance gate was re-run. The 0.706 candidate was not promoted. Production CV stays off. `extract()` still defaults to OpenCV and keyframe every 1, and it does not call the experimental loop.

### Integrated and executed

`run_experimental` in `scoutx_tracker/experimental_run.py` is the experimental entry. It opens `open_working_stream`, calls `decide`, propagates with the existing `BoxPropagator` when inference is skipped, gates OCR, and stops on the frame budget, the wall budget, cancellation, or a refused ladder proposal. Propagated boxes are not identity claims. A lone digit is stored with `fullNumber: false`. A second full number is kept.

Synthetic measurements from `tests/test_experimental_run.py` (8 passed, plus the 8 foundation tests, 16 passed in 4.61 s):

| Configuration | What executed | Measured workload |
|---|---|---|
| Preparation off, 30 frames at 30 fps | Detector on every source frame | 30 invocations, 0 avoided |
| Streaming 10 fps on those frames | Presentation-time resample, one decode pass | 10 working frames, 10 invocations |
| Scheduler on, 24 quiet frames, touchline period | Detect, then propagate | 2 invocations, 22 avoided |
| Identical legible crops, gated OCR | Reader, then cache | 1 read, 7 cache hits, against 8 reads with the ungated policy |
| Flat crops | Legibility gate | 0 reads, 4 skips |
| Frame budget 4 | Stop | 4 frames, `analysisComplete: false` |
| Level-4 proposal without approval | Refusal before the detector | 0 invocations |
| Synthetic 0.4 s, 30 fps file | ffmpeg stream versus OpenCV | 4 frames at 0.0, 0.1, 0.2, 0.3 s, fewer than the source-rate decode |

At 29.997 fps the presentation index differs from an integer stride across 6,000 source frames. Letterbox of one synthetic frame was timed and labelled `measured_letterbox_only`. That is preprocess time, not model inference. No YOLOX invocation ran.

`deliverStage` in `experimentalOrchestration.ts` is an in-memory stage machine. A repeated extract does not run again. A failed resolve leaves the finished extract in place. A stale generation, a cancellation, and a resolve before extract are rejected. It is not registered as a Cloud Function. Production orchestration does not call it. Two unit tests passed.

### Real footage, measured, not gated

Authorised one-second read of `IMG_4809_proxy_10fps.mp4` at 1,150–1,151 s. Ten frames, 1920×1080, 10 fps, HLG, BT.2020, tv. No detector and no OCR. Report: `.local/engine7/decoder-window-20261125.json`.

| Path | Identical frames to OpenCV 5.0.0 | Mean absolute difference | Decode time |
|---|---|---|---|
| OpenCV | reference | 0 | 0.098 s |
| BT.601 limited | 10 of 10 | 0 | 0.541 s |
| BT.709 limited | 0 of 10 | 1.929–1.976 | 0.535 s |
| HLG working space (`zscale`, 203 cd/m², BT.709) | 0 of 10 | 27.359–27.556 | 0.576 s |

On this PC the current decoder matches BT.601, not the explicit HLG working space. The ffmpeg paths were slower than OpenCV on this one-second seek. That is not a full-recording throughput result, and it is not the Linux OpenCV path that passed the gate. The production decoder was not changed. No identity equivalence is claimed.

### Not done

No speed or cost improvement on the 2,035 s reference. No accuracy gate. No independent match. No billed cost. The extrapolated 140-minute resolve remains an extrapolation. Discovery and extraction in production still decode separately. The experimental orchestration is not deployed.

## Engine 7.2, 2026-11-25

`YoloxSession` is the experimental model binding. It runs YOLOX-s only when the requested backend can actually start. ONNX Runtime is not installed, so an ONNX request raises and does not substitute PyTorch. A CUDA request raises because CUDA is not available. FP16 raises and is not run. The production extractor does not call this session.

### Real inference, measured

Authorised interval: IMG_4809 proxy, 1,150–1,151 s, ten frames. Weights SHA-256 `f55ded7181e1b0c13285c56e7790b8f0e8f8db590fe4edb37f0b7f345c913a30`, the pinned YOLOX-s file. Torch 2.8.0+cpu, FP32, batch 1, 1,280 input, NMS at confidence 0.05 and IoU 0.6, 2 intra-op threads. Report: `.local/engine7/ten-frame-inference-20261125.json`.

| Stage | Measured |
|---|---|
| Weight load | 0.817 s |
| First forward, OpenCV frame | 7.552 s |
| Later OpenCV forwards, median | 0.613 s |
| Letterbox of one 1080p frame | 0.010 s |
| Real forwards in the colour comparison | 40 |
| Real forwards in the scheduler pass | 10 |
| OCR reads | 12, after a 9.898 s reader load |
| Traced Python peak | 227 MB |

The 0.613 s median is this process on this PC at the 2 threads Torch selected. The reference machine's detector time was 3,878.86 s over 20,350 frames, about 0.191 s per frame, on 8 vCPUs. These are different machines. Nothing here is a speed improvement, and the one-second decode times are still not a full-recording throughput result.

The same OpenCV frame was then forwarded three more times at each thread count, after one discarded warmup at that count. Median forward time: 1 thread 1.032 s, 2 threads 0.600 s, 4 threads 0.420 s, 8 threads 0.389 s. The 8-thread samples were 0.381, 0.511 and 0.389 s. That is one repeated frame, 17 extra forwards, not a recording and not a change to the production thread setting.

People are counted at confidence 0.30. Agreement is greedy IoU at 0.50 against the OpenCV detections.

| Decode | Matched people | Only in OpenCV | Only in this decode | Mean IoU of matches | Small people (height under 48 px) | Appearance dot product |
|---|---|---|---|---|---|---|
| BT.601 | 210 | 0 | 0 | 1.000 | 57 vs 57 | 1.000 |
| BT.709 | 207 | 3 | 2 | 0.987 | 57 vs 56 | 0.980 |
| HLG working space | 196 | 14 | 7 | 0.936 | 57 vs 50 | 0.860 |

BT.601 matches OpenCV on this PC through boxes, small players, kit counts and appearance. The explicit HLG conversion is the first stage that changes the analysis: it drops small players and moves the appearance descriptor. BT.709 is close to OpenCV but not the same set of people. The production decoder was left on OpenCV. No identity decision was published.

OCR ran on the four tallest OpenCV crops of at least 80 px, then on the matched crops from the other decodes. All 12 reads returned no text. BT.601 crops were byte-identical, so those reads were not repeated. No full jersey number and no contradictory number appeared. An empty read is not evidence that the colour paths agree on a number.

The scheduler, given the real boxes, detected all 10 frames. Each frame after the first had overlapping players, so the similar-kit signal fired. The synthetic drop from 24 calls to 2 does not appear on this second. Propagated boxes were not treated as detections.

A restored in-memory job record still keeps a finished extract when resolve fails. That record is a JSON round-trip in the test process. It is not a cloud checkpoint.

### Still blocked

The container `7e8d4872` was not started. Neither gate was re-run. No billed cost was measured. Discovery and extraction in production still decode separately. The 0.706 candidate was not promoted. Production CV stays off.

## Engine 7.3, 2026-11-25

The ten-frame scheduler log named the cause. After the first frame, every decision reason was `similar_kit_crossing`. The loop adds that signal when any two boxes overlap at IoU 0.25 or more. On this second, players overlap in the crowd, so the signal never cleared. The overlap was not a check against the selected player. There is no selected player in that run.

`policy="risk"` still treats that crowd overlap as a reason to detect. `policy="target"` does not. It detects for a lost or missing track, a scene change, a periodic scan, or an overlap that touches a supplied target box. Other overlaps are recorded as `unrelated_overlap` and do not escalate. `target_recovery` asks for a high-resolution look when the target box itself is in the overlap. `target_dynamic` names 1,280 px on an escalated frame and 640 px on a cheap frame. None of these policies is called by `extract()`. No policy is an accuracy result.

Measured again on the same ten OpenCV frames, one model load, real YOLOX-s FP32. Report: `.local/engine7/scheduler-duty-20261125.json`.

| Policy | Detector calls | Skipped frames | Why the later frames differed |
|---|---|---|---|
| risk | 10 | 0 | `similar_kit_crossing` on frames 1–9 |
| target, no jersey anchor | 1 | 9 | frames 1–9 still carried `similar_kit_crossing` and `unrelated_overlap`; the reason stored is `continuity_holds` |

The nine skipped frames are propagated boxes. They are not confirmed observations of the player. No anchor for number 20 was supplied, so this does not show that the target was followed. The labelled development window that contains this second is 1,150–1,180 s. That comparison was not run.

Contiguous forwards of these ten frames, after one discarded warmup at each thread count:

| Threads | Median forward | Wall for 10 frames | Process CPU time |
|---|---|---|---|
| 4 | 0.403 s | 4.106 s | 16.719 s |
| 8 | 0.386 s | 3.941 s | 30.953 s |

Eight threads barely shortened the wall time and almost doubled the CPU time. That is this PC and this second. It is not a production worker size.

ONNX Runtime is still not installed. The historical pin is `onnxruntime==1.29.0` on CPU. `requirements-tracker.txt` only says `onnxruntime>=1.17`. The GPU lock pins `onnxruntime-gpu==1.29.0`. Neither package was installed. A requested ONNX session still raises instead of running PyTorch.

`extract()` constructs its detector inside each call, so each production segment loads the model again. The experimental session above was loaded once and then used for both policies and both thread sweeps. A warm process must still drop owner-specific frames when the job ends. The production loader was not changed.

## Engine 7.4, 2026-11-25

The one-detection result on the ten frames was not tracking. No target anchor was supplied, and the loop still stored `continuity_holds`. That path is closed. With `policy="target"` and no matched anchor, every working frame stays in `discovery`, the detector runs, and `continuityClaims` stays 0. A matched anchor with no threat can propagate, and the stored reason is `tracking_propagated`. A propagated frame still has `publishedPosition: false`. Stable boxes are not an identity claim.

The geometric states are `discovery`, `tracking`, `at_risk`, `lost` and `reacquisition`. They use the supplied box and IoU 0.25. They are not probabilities. Nothing in this loop publishes a position, a metric or a football event. That is the abstention. The existing identity rules were not replaced.

Measured again on the same ten OpenCV frames at 1,150–1,151 s, one model load, real YOLOX-s FP32. Report: `.local/engine7/resolution-duty-20261125.json`.

| Run | Detector calls | Propagated | State | Continuity claims |
|---|---|---|---|---|
| target, no anchor | 10 | 0 | discovery on all 10 | 0 |

The previous no-anchor run on these frames was 1 call and 9 skips. That reduction is withdrawn.

`target_dynamic` now calls `detect_at`. A logged size is an error if the detector has no such method. On these frames the 1,280 path fed the network `[1, 3, 736, 1280]` and the 640 path fed `[1, 3, 384, 640]`. Both used the one loaded network. Weights SHA-256 `f55ded7181e1b0c13285c56e7790b8f0e8f8db590fe4edb37f0b7f345c913a30`. People at confidence 0.30, match IoU 0.50, summed over the ten frames: 101 matched, 109 seen only at 1,280, 5 seen only at 640. Small players under 48 px: 57 at 1,280, 2 at 640. The twenty forwards took 7.835 s of wall time and 15.938 s of process CPU time. 640 is faster on this PC and it drops the distant players. It is not an accepted operating point.

`target_recovery` calls `recover`, which runs a second forward on a crop with one box of context on every side. On the first of these frames, using the largest detected person rather than a verified number-20 box, that second forward took 0.239 s and returned 6 people. The crop origin was overwritten by later calls, so it is not in the report. This shows the extra forward ran. It does not show that number 20 was recovered.

A separate process, after one load, one 1,280 forward and one 640 forward on a blank 1080p frame, had a peak working set of 500,113,408 bytes. The ten-frame script's own counter failed and is stored as null.

Synthetic tests, 22 passed with the foundation file: an unacquired anchor stays in discovery; a matched isolated box propagates without a continuity claim; dynamic sizes are actually passed as 1,280 then 640; a crossing calls the recovery method once; lost and reacquisition go back to 1,280; two jobs through `ReusableSession` do not keep each other's frame ids. The session test uses a stand-in model. `extract()` still constructs its detector inside each call. Production was not switched to the reusable session.

The labelled window 1,150–1,180 s was not decoded. The earlier one-second authorisation does not cover it. The comparison is ready to run when that interval is approved, and only then:

| Item | Predeclared value |
|---|---|
| Source | IMG_4809 proxy, SHA-256 `b1077af3c975e0e1b5d15a9f0dc3895ac87fa296cad4f41d267368c260fb679c` |
| Interval | presentation time 1,150.0 s through 1,180.0 s |
| Target | orange number 20, using the existing reviewed box for that window |
| Model | YOLOX-s, SHA-256 `f55ded71…913a30`, FP32, CPU |
| Decoder | OpenCV on this PC, plus the already compared BT.601, BT.709 and HLG paths |
| Policies | detect every frame; `risk`; corrected `target`; `target_dynamic` only as a measured size, not as a saving |
| Identity | existing rules; a lone digit is not a full number; no new probability |
| Stop | any policy whose wrong-identity time is above the detect-every-frame run |
| Not claimed | full-match acceptance, a gate, or a billed cost |

ONNX Runtime is still not installed. PyPI has `onnxruntime-1.29.0-cp312-cp312-win_amd64.whl` and that release requires Python 3.11 or newer. This interpreter is 3.12.10, so the CPU wheel is a candidate for a new virtual environment. It was not installed. `onnxruntime-gpu==1.29.0` was not installed. A requested ONNX session still raises.

Docker is not running. The historical image was not started. Neither acceptance gate was re-run. The 0.706 candidate stays rejected. Production CV stays off. No cost saving is claimed.

## Engine 7.6, 2026-11-25

The authorised window was presentation time 1,150.0–1,180.0 s of the local proxy. The file hash is `b1077af3c975e0e1b5d15a9f0dc3895ac87fa296cad4f41d267368c260fb679c`. The fixture `tests/fixtures/img4809_gap1150_slice.json` has ground truth and `"anchors": []`. No owner anchor was invented. The corrected target policy therefore stayed in `discovery` for all 300 frames. It is the same detection set as detect-every-frame, so it was not scored a second time. `target_recovery` did not run a regional forward, because no target was acquired.

Recovery records are now appended and copied. A later recovery, and `release_job()`, cannot replace an earlier crop. That is covered by the unit test. The identity numbers below do not come from regional recovery.

Reference path: production `extract()` with OpenCV, YOLOX-s at 1,280, keyframe every frame, then `analyze()` for number 20, orange, second kit white, no anchors. 300 frames, 6,492 person rows. Detector time 125.5 s. Whole extract 137.5 s. Resolve wall 57.4 s, process CPU 382.8 s, 305 OCR reads. Six of the stored full-number reads were `20`. Other full reads included `19`. Lone digits were kept as lone digits. Report: `.local/engine7/window-1150-1180/identity-score.json`.

| | Stored label time | Corrected +0.1 s |
|---|---|---|
| Target-labelled | 28.7 s | 28.7 s |
| Claimed recall | 0.547 | 0.571 |
| IDF1 | 0.707 | 0.727 |
| Confirmed-correct | 12.5 s | 12.7 s |
| Wrong identity | 0 s | 0 s |

287 corrected visible labels, 123 without a confirmed or likely claim, 0 identity switches between labelled players. The moments invariant failed because this slice is not a full-match highlight window. The acceptance gates were not run. This is not the historical full-match score.

The global risk scheduler, replayed on these detections with the real propagation check, detected 165 frames and propagated 135. The target policies detected 300. The risk set was passed through the same tracker and identity code. Corrected basis: claimed recall 0.617, IDF1 0.763, confirmed-correct 15.1 s, wrong identity 0 s, 110 of 287 visible labels unclaimed. OCR stored 8 full `20` reads and 238 OCR calls. Resolve wall 43.4 s. At the reference rate of 125.5/300 s per frame, the 135 skipped detector calls are 56.5 s of detector time not repeated. Propagation was not timed as a fresh extract. Wrong identity did not rise on this window. One development window is not a gate and not a production change.

ONNX Runtime 1.29.0 is installed in `.local/engine7/onnx-venv` only. The development environment does not import it. Providers: `CPUExecutionProvider` and `AzureExecutionProvider`. The existing `yolox_s.1280.onnx` ran. Its SHA-256 is `aa655d915326e68dc6fca9638aa8b7ccae27d412f0100a4b3f8c6d46c2e64862`. Weights remain `f55ded71…913a30`. On eight contiguous frames at confidence 0.30, PyTorch and ONNX matched 163 boxes, mean IoU 1.0, with the same small-player counts. Four threads, warm: PyTorch median 0.409 s, ONNX median 0.297 s. Eight threads barely shortened the wall time and roughly doubled process CPU on both. Production `extract()` was not switched to ONNX.

960 was executed as `[1, 3, 544, 960]` on those eight frames. It returned fewer people and fewer small players than 1,280. It is not an accepted operating point. 640 remains rejected for the same reason.

A real session's recovery log was empty after `release_job()`. Production still constructs a detector per `extract()` call.

Docker Desktop was started. The engine reported 29.9.3. C: had 337 GB free. The local image `pitchproof-tracker-cpu:measure` is `sha256:7513e604bcb9…`, not the historical digest. The registry refused the exact image because billing is disabled on project 315202089837. Billing was not enabled. A full replay on this PC is about 0.418 s of detector time per frame, against 0.191 s on the historical machine, so the 2,035 s recording would take more than the two-hour limit even after the image is available. It was not started. Neither gate was re-run. The 0.706 candidate stays rejected. Production CV stays off.

## Engine 7.7, 2026-11-25

Measured against `3bfca5e` before this commit. Production CV stays off. Neither gate was edited or re-run. The 0.706 candidate stays rejected. Phase 18 was not modified. Billing was not enabled and the historical pull was not retried. No GPU package was installed and no paid instance was started. No interval outside 1,150.0–1,180.0 s was decoded.

### Timestamp convention

`frame_timestamp` is `t0 + index / fps`. `frame_before_end` is half-open on source time: frame 11800 at 10 fps is exactly 1,180 s and is excluded. The stored labels for intervals at or after 1,150 s sit 0.1 s early of the boxes. `select_time_basis` chooses the shift with the higher median IoU of N boxes only. Target score is not an input. A tie keeps 0.0. On this fresh extraction the N-box median IoU is 0.6469 at 0.0 and 0.9099 at +0.1 s, so the selected shift is +0.1 s. Both bases stay in every score file. The same shift is used for every candidate. Report: `.local/engine7/window-1150-1180/difference.json`.

### Local acceptance, declared before the combined score

Wrong-identity duration must not exceed the PyTorch every-frame reference. Existing publication rules stay. Claimed recall must not fall materially. Propagation and orchestration time count. A pass on this window is not a gate and does not enable production CV.

### Factorial, one window, corrected +0.1 s

Source hash `b1077af3…fb679c`. Model `yolox_s.1280.onnx` SHA-256 `aa655d915326e68dc6fca9638aa8b7ccae27d412f0100a4b3f8c6d46c2e64862`. Weights `f55ded71…913a30`. Resolution 1,280. Provider `CPUExecutionProvider`. No owner anchor.

| | A PyTorch every frame | B PyTorch risk | C ONNX every frame | D ONNX risk |
|---|---|---|---|---|
| Extract | existing reference | detections reused, not a fresh wall | fresh | fresh |
| Detector calls | 300 | 165 | 300 | 165 |
| Propagated frames | 0 | 135 | 0 | 135 |
| Detect | 125.5 s | not remeasured | 87.84 s | 48.53 s |
| Propagate | 0 | inside a 7.3 s replay script | 0 | 1.09 s |
| Decode | 1.59 s | not a fresh extract | 1.62 s | 1.50 s |
| Extract wall | 137.5 s | not a stopwatch | 105.17 s | 66.891 s |
| Extract process CPU | not recorded | not a stopwatch | 1,098.516 s | 623.547 s |
| Extract peak RSS | not recorded | not a stopwatch | 717,385,728 | 719,519,744 |
| OCR calls | 305 | 238 | 305 | 238 |
| OCR time | 35.8 s | not split the same way | 33.7 s | 32.9 s |
| Identity time | 20.9 s | not split the same way | 18.9 s | 12.3 s |
| Resolve wall | 57.359 s | 43.39 s | 53.261 s | 45.753 s |
| Resolve process CPU | 382.828 s | 284.703 s | 360.984 s | 294.672 s |
| Complete wall | 194.859 s | not measured | 158.431 s | 112.644 s |
| Claimed recall | 0.571 | 0.617 | 0.571 | 0.617 |
| IDF1 | 0.727 | 0.763 | 0.727 | 0.763 |
| Confirmed-correct | 12.7 s | 15.1 s | 12.7 s | 15.1 s |
| Wrong identity | 0 | 0 | 0 | 0 |
| Unclaimed visible | 123 / 287 | 110 / 287 | 123 / 287 | 110 / 287 |
| Switches | 0 | 0 | 0 | 0 |

Stored basis for C matches A (recall 0.547, IDF1 0.707, confirmed-correct 12.5 s, wrong 0). Stored basis for D matches B (recall 0.575, IDF1 0.730, confirmed-correct 14.4 s, wrong 0). Full-number reads: A and C are `20`×6 and `19`×6. B and D are `20`×8 and `19`×6, plus one `72` and two `17`. Lone digits were kept. The moments check still fails because the slice is not a full-match highlight window.

ONNX every-frame identity matches PyTorch every-frame on this window. ONNX risk matches PyTorch risk. The identity change is the scheduler. The speed change is both. Measured detector time falls from 87.84 s to 48.53 s when the same ONNX session skips 135 frames, and propagation adds 1.09 s. That is a stopwatch, not 135 times a PyTorch per-frame rate. The earlier 56.5 s figure remains a calculation from the PyTorch reference and is not cell D. Process CPU is higher under ONNX because the runtime was not pinned to four threads. Peak RSS did not fall. No dollar saving is claimed.

Cell D meets the local contract: wrong identity stays 0, recall rises from 0.571 to 0.617, complete wall falls from 194.859 s to 112.644 s. It is one development window.

### Why the scheduler changed recall

Against the PyTorch every-frame claims, the risk claims gain 29 labelled frames (1,163.9–1,166.7 s) and lose 16 (1,159.9–1,161.4 s). Net +13. 148 frames stay correct and 94 stay unclaimed. Only 8 of the 29 gains were fully propagated frames, so the gain is mostly a change in the detections that the tracker, OCR and association then see, not the optical-flow box standing in as the claim. The same pattern appears when the detector is ONNX. This is not yet shown on a second recording.

### Unclaimed labels

Of the 110 corrected visible labels the risk candidate did not claim, 109 had a reference detection at IoU ≥ 0.5 and 1 had none. None was a wrong-player claim. The lost time is unpublished identity, not a missed player. Thresholds were not relaxed. Full-number `19` reads were kept.

Resolve time falls with OCR count (305 to 238 reads; numbers remain the largest stage, about 33–36 s). No crop-selection policy and no identity-graph change was shipped. Scaling beyond 30 s was not measured.

### Integration

`extract()` still detects every frame unless `SCOUTX_SCHEDULER=risk`. Unknown values raise. Risk requires keyframe every 1 and batch 1, calls the existing propagator, and records `detectorCalls` and `propagatedFrames`. It does not import `experimental_run`. An explicit `SCOUTX_ORT_PROVIDERS` value that is not the session's first provider drops the session and raises. Unset or `auto` still allows the historical CPU fallback. Default execution was not switched. `select_time_basis` is tested, including the tie that keeps 0.0. `pytest` on the foundation and experimental suites: 24 passed in 3.38 s.

Not done, and not described as done: a second real job through one reused production session, shared discovery and extraction decode, durable cloud orchestration, an OCR selection change, and any GPU run. `experimentalOrchestration` remains in-memory and unregistered.

### Held-out windows, frozen and not decoded

Development window, already used, not to be the only tuning target: 1,150–1,180 s. Held-out labels already in `bench/results/5.1/gt_img4809_intervals.json`, same proxy, same number 20, not authorised for this session: 225–255, 400–430, 600–630, 1,295–1,325, 1,500–1,530, 1,680–1,710, 1,800–1,830, 1,890–1,920 s. Each is 300 frames at 10 fps. A combined ONNX risk pass is on the order of two minutes of wall per window on this PC, from the 112.6 s measurement, plus identity scoring. Stop if wrong-identity duration exceeds the matching every-frame run or if a window exceeds about 15 minutes. Do not use those labels as anchors.

### GPU FP32 proposal, not launched

Official ONNX Runtime CUDA provider table: `onnxruntime-gpu` 1.29.x on PyPI is built with CUDA 13.0 and cuDNN 9.x, and requires CUDA 13.0 or newer. A separate CUDA 12.x package for 1.27–1.30 is built with CUDA 12.8. Source: https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html. Do not install either package into `.local/engine7/onnx-venv`. The experiment, if approved, is the same eight decoded frames at 1,150 s, the same ONNX file, identical preprocessed tensors, FP32, batch 1, then a controlled batch. Fail if `CUDAExecutionProvider` is absent from `session.providers`. No FP16 until that comparison exists. No region, instance, or cost is selected here because no GPU was authorised.

### Local development reference

This PC, parent commit `3bfca5e`, Python 3.12.10, torch 2.8.0+cpu, onnxruntime 1.29.0 in the dedicated venv, OpenCV decode, four-thread parity was a separate microbench. It is not the historical CPU8 image and it does not replace either gate.
