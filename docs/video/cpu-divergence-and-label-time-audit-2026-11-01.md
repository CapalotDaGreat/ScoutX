# Linux/Windows CPU divergence and ground-truth time-basis audit (2026-11-01)

Branch `codex/gpu-benchmark-5-3`. Base `4e9c5e6`. The pinned GPU inference commit `51d41c9` is unchanged.

- No cloud resources were used.
- No inference code, identity threshold, gate threshold or label was changed.
- `productionApproval=false`.

Evidence: [time-basis-audit-20261101/](../../workers/football-cv/bench/results/5.3/time-basis-audit-20261101/). It holds JSON only; review frames stayed local and are not committed.

## 1. Provenance comparison: Windows CPU ONNX vs Linux CPU ONNX, window 1150–1180 s

| | Windows run | Linux run |
|---|---|---|
| When / repo commit | 2026-10-30, `c6c4320` | 2026-11-01, `95cf3a8` |
| Engine + evaluator code hash | same (`codeSha256` equal) | same |
| fp32 harness (probe) hash | `6c0e4dd…` (before the corpus refinement) | `39e839f…` (`51d41c9` harness) |
| Video bytes | `b1077af3…` | `b1077af3…` (container remux with the encoder tag restored) |
| Model files (4) | identical SHA-256 | identical |
| Profile settings | ONNX CPU provider, batch 1, cv2 decoder, keyframe 1, balanced, OCR enhance 0 | same |
| Python / torch / OpenCV | 3.12.10 / 2.8.0+cpu / 5.0.0 (Windows prebuilt FFmpeg) | 3.13.17 / 2.14.1 / 4.14.0 (pip wheel FFmpeg) |
| docTR / EasyOCR / ONNX Runtime / NumPy | 1.1.0 / 1.7.2 / 1.29.0 / 2.5.3 | same |
| Threads | `OMP_NUM_THREADS=2` (overlay) | 2 |
| Windows evaluated | gap1150 only | gap1150, 3144, 1073 |

The window inputs, labels and the metric definitions are the same. The runs are not controlled against each other: platform, Python, torch and OpenCV all differ.

## 2. Earliest divergence: decoded pixels

- **The two runs disagree from the first frame.** All 301 frames of 1150–1180 s have different decoded-pixel hashes in the Windows run and the Linux run.
- **One-factor check on Linux.** Same reference bytes, same seek and read method as the harness:
  - OpenCV 4.14.0 reproduces the Linux run on 301/301 frames;
  - OpenCV 5.0.0 also reproduces it on 301/301 frames, and is pixel-identical to 4.14;
  - neither matches the Windows run (0/301).
- **What that means.** The OpenCV Python version is not the cause. The Windows decode path is: its prebuilt FFmpeg build and/or the platform, converting the 10-bit HLG source to 8-bit BGR.
- **Not measured.** How large the Windows pixel difference is. Its pixels are not available here.

**Downstream consequences (observed, not individually traced):**

| | Windows | Linux |
|---|---|---|
| Discovery sightings of #20 | 3 (1161.8 s, 8 frames; 1169.5 s; one more) | 1 (1161.9 s, 2 frames) |
| Stage-1 OCR reads of "20" | 4 | 1 |
| Correct target frames | 152 | 228 |
| …of which confirmed | 132 | 17 |
| Abstained | 128 | 46 |

Linux has more coverage but less number evidence: its extra time comes from anchored "likely" claims.

The Windows timeline, `result.json`, `detections.npz` and OCR cache were not exported, so detection, tracklet and identity paths cannot be aligned frame by frame. This is a description of two different inputs, not an attribution of the 76-frame difference.

## 3. Ground-truth time-basis defect (evaluation, not tracking)

**What the file says.** In `gt_img4809_intervals.json`, intervals 225–630 s have `time = frameIndex/10`. All six intervals from 1150 s onward have `time = frameIndex/10 − 0.1`. The gap1150 fixture was built from those times. The 3144 fixture was built from the same 5.1 run.

**Identity-independent check.** Labelled boxes of other players (`N`) were compared with raw person detections from a fresh stage-1 run:

| Window | N boxes | Stored time: median IoU (share ≥ 0.5) | +0.1 s: median IoU (share ≥ 0.5) |
|---|---|---|---|
| 1150–1180 | 1,286 | 0.65 (69.5%) | **0.913 (99.9%)** |
| 1880–1925 | 523 | 0.666 (68.3%) | **0.932 (100%)** |
| 1050–1085 (control, labelled separately) | 52 | **0.887 (100%)** | 0.566 |

So those labels are stamped 0.1 s early. The origin is unconfirmed; most likely a one-frame index/time offset between 630 s and 1150 s in the 5.1 stage-1 run used for labelling.

**Changes.** The record [gt_time_basis_corrections.json](../../workers/football-cv/bench/references/gt_time_basis_corrections.json) carries this justification. The original labels and boxes are unchanged. `pp_bench.apply_time_basis` and `pp_bench.best_label_time_shift` were added, with tests: the shift is detected from detections alone, and correcting it never turns a claim on another player into a success. The acceptance gate and its default basis are unchanged; switching the default is a separate decision.

**Effect on the completed L4 full-match comparison** (same claims files, re-scored):

| Basis | CPU IDF1 / recall | GPU IDF1 / recall | Gate |
|---|---|---|---|
| Stored times | 0.766 / 0.621 | 0.661 / 0.494 | fails |
| Time-corrected | 0.811 / 0.683 | 0.706 / 0.546 | **still fails** |

Wrong identity and overlap-ambiguous time stay 0 s in both runs. Almost the entire GPU gap is in interval 1150–1180:

| | CPU | GPU |
|---|---|---|
| Correct (corrected basis) | 25.0 s | 18.1 s |
| Confirmed | 8.4 s | 8.0 s |

The GPU loses "likely" coverage, not confirmed number evidence. **The time-basis defect does not explain the GPU gap.**

## 4. The 13 unmatched target-visible claims (Linux cpu-onnx, gap1150, automatic)

"Unmatched" means a claimed box overlaps no labelled box at IoU ≥ 0.5. Recount from the timeline:

- 15 unmatched claims on labelled frames, 13 of them on frames with a target label;
- all are anchored LIKELY, except frame 126, which is CONFIRMED by number.

Classification (per-claim data in [unmatched_audit.json](../../workers/football-cv/bench/results/5.3/time-basis-audit-20261101/unmatched_audit.json)):

| Class | Frames (window index, source time) | Count |
|---|---|---|
| Evaluation time-basis defect: the claim matches the target's label at +0.1 s (IoU 0.76–0.98, other players ≤ 0.24) | 41, 42, 45, 49, 52, 60, 126, 185, 238, 294, 297, 298 | 12 |
| Time-basis defect with no claim after alignment: the label pairs with an abstention at +0.1 s | 295 (1179.5 s) | 1 |
| Non-target frames: both become abstentions after alignment | 46, 179 | 2 |

Frame 185 looked like an overlap at the stored time (IoU N 0.491, T 0.459). At +0.1 s it is T 0.885 and N 0.24.

**Rescored gap1150 with corrected times:**

| Outcome | Target-visible frames |
|---|---|
| Correct | 241 |
| Abstained | 45 |
| Unmatched | 0 |
| Wrong player | 0 |

Across all labelled frames, one unmatched and three "?"-label claims remain.

**The remaining unmatched claim: frame 97, 1159.8 s (corrected), a non-target-labelled frame.** It is unresolved, and **not counted as correct**:
- the frame has only three "?" labels;
- the claim is continuous with the target label on frames 95, 98 and 99 (IoU 0.90 / 0.79 / 0.97);
- on the local source frame the same orange player is on the ground while an opponent passes;
- the likely cause is an annotation gap.

## 5. Changes and tests

- **Changes (evaluation only, no inference change):**
  - `bench/references/gt_time_basis_corrections.json`;
  - `pp_bench.apply_time_basis` and `pp_bench.best_label_time_shift`;
  - `bench/decode_probe.py`, a JSON-only decode-path probe that records the VideoCapture backend;
  - a regression test.
- **Worker suite:** 591 passed (Linux container, Python 3.13.17, CPU).

## 6. Unknown, and the smallest next experiments

1. **Windows decode magnitude.** On the Windows machine, in the same overlay:
   `python bench/decode_probe.py --video "C:\Users\masap\Downloads\Mobile Devices\IMG_4809_proxy_10fps.mp4" --out decode_windows.json`.
   Then compare with `decode_probe_linux.json` using `--compare`. This shows the backend (FFMPEG or MSMF) and the per-channel brightness/histogram shift: one file, no footage exported.
2. **Windows downstream path.** Export the existing Windows run's `gap1150/automatic/timeline.npz`, `result.json`, `stage1/*/detections.npz` and `meta.json`. These are numeric only; no crops. With them, detections, tracklets and identity can be aligned frame by frame against the Linux run.
3. **GPU gap.** Still needs CUDA profiles 3–6. It is now localised to likely coverage in 1150–1180 under both time bases. Re-scoring the time-corrected per-interval numbers needs no cloud.
4. **Default time basis.** Deciding whether corrected label times become the default for gates is a separate evaluation-policy decision, ideally after an independent re-check of a few label frames.
