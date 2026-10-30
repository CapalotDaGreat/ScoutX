# Video Intelligence 5.3: acquisition and validation progress

Date: 2026-10-30. Base: `883229e`, `codex/gpu-benchmark-5-3`.
The identity engine still reports **5.2.0**. This milestone is **not accepted**:
fresh evidence exposed wrong-player attribution in an owner-assisted case.
No solver, confirmation threshold, production crop format, approval gate or
release flag was changed during that local phase. **Correction:** an L4 benchmark
had already run separately in europe-west4-c on 2026-10-29, 14:56:37–17:50:02 UTC.
Its downloaded results now establish 1853.86 s GPU versus 7528.287 s CPU, but the
GPU candidate fails the relative accuracy gate. This local phase launched no VM.
See [the reconciled 5.3b report](intelligence-5.3-gpu-benchmark-report.md) for the
recovery path, cleanup, current contact-entry patch and validation limitations.

5.3b follow-up: fresh reruns now remove the 0.5 s owner-assisted wrong-LIKELY
interval while retaining four correctly confirmed frames. Automatic acquisition
still abstains on both fresh windows. PNG remains experimental; the cloud GPU
relative gate still fails. Final combined checks: 579 worker and 718 app tests
passed, zero skips, plus TypeScript checks. See the linked report for scope and
unmatched claims; archived replay accuracy is not fresh inference accuracy.

## Restored local model environment

The isolated evaluation overlay is
`C:\ZLI\M335\ScoutX\.local\identity-validation-runtime-20261030`.
It uses Python 3.12.10 and reuses the existing test environment's packages through
a `.pth` file. New packages are installed in the overlay, not the original venv.
`pip check` passed. This is a functional Windows CPU environment, not the pinned
Linux/Python 3.13.17 CUDA image. The Docker Linux daemon is not running locally.

- Torch 2.8.0+cpu, torchvision 0.23.0+cpu, ONNX Runtime 1.29.0, docTR 1.1.0,
  EasyOCR 1.7.2, OpenCV 5.0.0, NumPy 2.5.3, SciPy 1.18.1.
- All four files in `bench/references/model_hashes.json` verified successfully:
  official YOLOX-s, docTR PARSeq, and the two existing EasyOCR weights.
- FFmpeg and ffprobe 9.0.2 were restored locally. The archive's SHA-256 was checked
  against its published checksum before use. Stage 1 retained its existing OpenCV
  decoding path; discovery used the existing automatic decoder selection.
- Actual fresh extraction used YOLOX-s at 1280 with ONNX Runtime CPU inference,
  stride 1 and keyframe interval 1. Recognition used the existing two-reader logic.

Proof: [restored runtime and model inventory](../../workers/football-cv/bench/results/5.3/runtime_restored_20261030.json).
Upstream references: [docTR recognition API](https://mindee.github.io/doctr/latest/api/models.html),
[FFmpeg binary source/checksums](https://www.gyan.dev/ffmpeg/builds/).

## Fresh inference and the report-time correction

Input: `IMG_4809_proxy_10fps.mp4`, 1,413,632,177 bytes, SHA-256
`b1077af3c975e0e1b5d15a9f0dc3895ac87fa296cad4f41d267368c260fb679c`.
This matches the committed reference exactly. The original phone recording was
not substituted. Models, source bytes, code and label hashes are bound in outputs.

Fresh decoding, detection, discovery and OCR ran on the same two fixed regression
windows as the archived replay: 1880–1925 s and 1050–1085 s. They processed 450
and 350 source frames respectively. These are previously examined development
windows, not an independent holdout or a whole-match test.

The first owner-assisted report was rejected by invariants: the new window harness
passed absolute times around 1073 s into a 35 s report. The harness now normalises
prediction times, labels, sightings and anchors to window-local time while keeping
the absolute source-video offsets for decoding. A regression test covers this
mapping. The invariant checks were preserved.

Reports were rebuilt from the freshly produced stage-1 outputs and OCR caches.
They pass report invariants, but explicitly have `timingComplete: false` and
`reusedStage1AndDiscovery: true`. Their short reconstruction times are not new
end-to-end processing measurements. The first failed attempt remains in `.local`
with its log; it is not presented as a successful uninterrupted benchmark.

The original, measured phase times were:

- 45 s window: discovery 43.636 s, extraction 199.423 s, initial automatic
  resolution 75.041 s.
- 35 s window: discovery 152.270 s, extraction 154.953 s, initial automatic
  resolution 80.731 s.
- Initial shared model setup: 9.838 s.

These are individual local phase observations, not full-match speed estimates or
a CPU/GPU comparison. Model export/probe and integrity work have separate scope;
the report reconstruction reused work. No 34/90/140-minute projection is made.

## Default JPEG pipeline findings

See [fresh-model reports](../../workers/football-cv/bench/results/5.3/fresh_jpeg_windows_20261030.json).

- **31:44 automatic:** all 54 target-labelled frames were abstained; correct
  recall and sampled IDF1 were 0. Fresh detections overlapped the labelled target
  at IoU >= 0.5 in 42/54 frames. None of 181 OCR cache entries read `20`.
- **17:53 automatic:** all 31 target-labelled frames were abstained; correct
  recall and sampled IDF1 were 0.
- **17:53 owner anchor:** 4/31 target-labelled frames were correctly claimed and
  confirmed (0.4 s); recall 0.129 and sampled IDF1 0.200. Separately, five frames
  matched a labelled wrong player: **0.5 s of wrong likely attribution**, at source
  times 1072.7–1073.1 s. Confirmed wrong-player attribution was 0; measured
  overlap ambiguity was 0. The existing absolute wrong-identity gate fails.

These results are worse than the archived-feature replay. The fresh detector
boxes, source crops and live recogniser outputs are different inputs from the
archived detections and supplied reads. The archived 53/54 and 28/31 results do
not establish current end-to-end accuracy. The fresh isolated windows also lack
full-match acquisition history, so their results are not whole-match accuracy.

## Compression loss isolated without changing the solver

At source time **1902.6 s**, the normal saved crop was selected and read, but the
reader abstained. A controlled comparison using the same source frame and fresh
detector box found:

- Tight raw box, 132×66 px: `20`, confidence 0.999994.
- Existing padded raw box, 138×78 px: `20`, confidence 0.948899.
- The existing padded JPEG at quality 92, same dimensions: abstained.

This establishes one compression-sensitive acquisition opportunity. It does not
show that all acquisition failures have this cause. No diagnostic read was
injected into the normal pipeline's identity evidence.

Proof: [crop diagnostic](../../workers/football-cv/bench/results/5.3/acquisition_crop_diagnostic_20261030.json).

## Lossless-crop experiment: useful lead, not approved

`bench/lossless_crop_experiment.py` regenerated **every retained crop** from the
verified source using PNG: 1,153 crops in the first window and 1,182 in the second.
Each PNG was checked for exact pixel round-trip equality. Crop geometry,
detections, appearance features, models, OCR confidence rules and identity solver
were unchanged. The experiment supplied explicit PNG crop paths through the
existing injectable data object; production JPEG writing/loading was not changed.
Discovery had zero sightings in both baseline windows, so the same empty sighting
evidence was reused. New OCR caches were separate from JPEG caches.

- **31:44 automatic PNG:** 40/54 correctly claimed frames (4.0 s), of which 26
  were confirmed (2.6 s). Recall 0.741; sampled IDF1 0.851. Two target-visible
  frames were abstained. **Twelve remaining target-visible claims did not match
  an annotated box at IoU >= 0.5** and require review. No measured wrong-player or
  overlap-ambiguous attribution was found on matching annotations.
- **17:53 automatic PNG:** still abstained on all 31 target-labelled frames.
- **17:53 owner-assisted PNG:** still 4 correct target frames and **0.5 s wrong
  likely attribution**. This fails the absolute gate just as the JPEG result did.

The older metrics exclude claims that match no labelled box. The new offline
outcome audit exposes those claims separately, so they cannot disappear into a
zero false-attribution figure or be counted as abstentions. Across all annotated
frames in the first PNG window, 125 claims were unmatched; only 12 of those were
on frames with a target-visible label. Sparse annotations cannot establish the
correct identity of the remaining unmatched claims.

Results: [31:44 comparison](../../workers/football-cv/bench/results/5.3/lossless_3144_20261030.json),
[17:53 comparison](../../workers/football-cv/bench/results/5.3/lossless_1073_20261030.json),
[complete outcome partition](../../workers/football-cv/bench/results/5.3/fresh_claim_outcomes_20261030.json).

The PNG experiment reuses detections/features and is explicitly **not** an
end-to-end performance benchmark. Neither PNG nor a new identity rule was
selected for production. The five wrong-player frames and unmatched claims must
be resolved/reviewed before promotion. Only 8.5 s of target-visible labels from
one recording and previously examined developer annotations were scored; they
do not satisfy the planned representative multi-match evaluation set.

## Tooling and verification

- Added a source/model-bound fresh-window runner, explicit time-basis conversion,
  cache-reuse disclosure and retention of discovery sightings for future replay.
- Added a lossless-crop experiment with complete crop regeneration and pixel
  equality checks, plus an offline outcome audit that separates unmatched claims.
- Fixed the full-match benchmark's peak-RSS reporting on Windows. Linux uses
  KiB and macOS bytes; tests verify both conversions and actual Windows access.
- Final restored-runtime suite: **575 passed, zero failed/skipped**, in 65.59 s.
  All five previously blocked FFmpeg/ONNX checks now execute. Three deprecation
  warnings remain (Starlette test client and legacy torch ONNX export).

The app's source code was not changed. Its last verified suite remains 718 passes
and TypeScript checks passed in the earlier baseline phase.

## Cloud status

Google Cloud CLI **591.0.0** was installed as a portable local archive, verified
against SHA-256 `109de903a875d840f839342af4eab77dcfe622417437d302208a73b48832da4c`.
No global PATH/profile change was needed. Source:
[Google's versioned archive instructions/checksums](https://docs.cloud.google.com/sdk/docs/downloads-versioned-archives).

CLI authentication checks returned no active account. The owner indicated they
would sign in; completion has not yet been observed. The read-only helper
`bench/gcp/inspect_baseline.ps1` refuses to proceed without an active account, then
lists VMs, buckets, recent operations, benchmark-result objects and billing-project
association with explicit project arguments. It does not enable APIs, upload
footage, change IAM, create resources or launch benchmarks. Its empty-account
path and PowerShell syntax were verified locally.

VM/result/billing status therefore remains unverified. Quota approval is not
treated as evidence of a running or completed benchmark. No L4 benchmark is
approved by these findings: current owner-assisted accuracy still fails the gate.

## Reproduction

Run from the current checkout's `workers/football-cv` directory. Use new output
directories; raw footage, crops, caches and full local logs remain ignored.

```powershell
$evalPython = 'C:\ZLI\M335\ScoutX\.local\identity-validation-runtime-20261030\Scripts\python.exe'
$env:SCOUTX_WEIGHTS_DIR = 'C:\ZLI\M335\ScoutX\.local\identity-models-20261030'
$env:PATH = 'C:\ZLI\M335\ScoutX\.local\identity-video-tools-20261030\ffmpeg-9.0.2-essentials_build\bin;' + $env:PATH
$env:OMP_NUM_THREADS = '2'
$env:MKL_NUM_THREADS = '2'
$video = 'C:\Users\masap\Downloads\Mobile Devices\IMG_4809_proxy_10fps.mp4'
& $evalPython -m scoutx_tracker.envinfo --require-models
& $evalPython bench/validate_identity_windows.py --video $video --out-dir 'C:\path\new-fresh-run'
& $evalPython bench/lossless_crop_experiment.py --video $video --baseline 'C:\path\new-fresh-run' --window 3144 --out-dir 'C:\path\new-png-experiment'
& $evalPython -m pytest -q -rs
```

Report-only reconstruction is separate: add
`--reuse-stage1-from 'C:\path\prior-fresh-run'` to the validation command. It
requires identical source/model provenance and engine/evaluator/label hashes,
allows the harness revision to change, and marks timing incomplete. This was
used to repair the initial absolute-time harness error, not to claim a new cold
end-to-end measurement.
