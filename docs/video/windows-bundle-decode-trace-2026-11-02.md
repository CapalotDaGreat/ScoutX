# Windows diagnostic bundle: decode trace through identity (2026-11-02)

Branch `codex/gpu-benchmark-5-3`, follows [cpu-divergence-and-label-time-audit-2026-11-01.md](cpu-divergence-and-label-time-audit-2026-11-01.md) (`8012c3d`). The pinned GPU inference commit `51d41c9` is unchanged; `scoutx_tracker/` and `bench/fp32_comparison.py` have not changed since it.

- No cloud resources. No inference code, threshold, gate or label changed. `productionApproval=false`.
- Evidence (JSON/NPZ only, no frames or crops): [windows-bundle-trace-20261102/](../../workers/football-cv/bench/results/5.3/windows-bundle-trace-20261102/), summary in `summary.json`.

## Result in one paragraph

The Windows probe reproduces the original Windows run's decoded pixels exactly (301/301). Those pixels are reproduced exactly on Linux by an explicitly documented path: FFmpeg CLI with swscale's BT.601 limited-range YUV→BGR24 conversion. Re-running the Linux pipeline with only that decode path swapped in reproduces the Windows run end to end: same detections, same OCR text, same tracklets, the same 300/300 timeline states and the same metrics. **The decoded pixels account for the whole Linux/Windows CPU difference in this window.** Platform, Python, torch and harness-hash differences change nothing measurable here. Neither decode path is shown to be the correct rendering of this BT.2020/HLG source. **The GPU gap is not addressed by this and remains unresolved.**

## 1. Bundle and provenance

- **Bundle.** `cpu-windows-handoff-20261102.zip`, SHA-256 `62713545…598348d`, verified. Its members and their hashes are kept unchanged in `windows-bundle-20261102/`. The run files are dated 2026-10-30, the original run; `decode_windows_20261102.json` is dated 2026-11-02, the later probe.
- **What matches across the three runs:**
  - video `b1077af3…`;
  - the four model files (SHA-256 equal);
  - profile cpu-onnx: ONNX CPU provider, batch 1, cv2 decoder, keyframe 1, discovery 416, OCR enhance 0;
  - window 1150–1180 s.
- **Frame alignment.** Source frame 11500+i = window frame i = 1150 + i/10 s in every run. The `detections.npz` times are equal across runs, and decoded hashes match only at offset 0 (offsets −2…+2 checked).
- **Remaining confounders between the original runs:**
  - harness probe hash `6c0e4dd…` vs `39e839f…` (corpus refinement only);
  - torch 2.8.0 vs 2.14.1;
  - Python 3.12 vs 3.13;
  - 16 vs 2 cores.

  The decode swap below shows that none of these alter outputs in this window.

## 2. Decoding (earliest divergence)

| Check | Result |
|---|---|
| New Windows probe vs original Windows run `decodedPixels` | **301/301 identical**, so the probe is valid evidence for that run |
| Linux probe vs Linux run | 301/301 |
| Windows vs Linux | 0/301; both report backend `FFMPEG` |
| FFmpeg 6.1.1 CLI, `scale=in_color_matrix=bt601:in_range=tv`, bgr24 vs Windows | **301/301 identical** |
| Same with BT.709 or BT.2020 matrix, or full-range input | 0 (histogram distance 0.065–0.30) |
| Linux OpenCV 4.14 / 5.0 wheel path (avcodec 62.28, swscale 9.5) | not identified: swscale, zscale, tonemap and colorspace variants tried, none match |

- **Windows path.** The 10-bit BT.2020/HLG stream (`yuv420p10le`, tv range) is converted with the conventional BT.601 limited-range matrix, with no HLG handling.
- **Linux path.** It is brighter and higher-contrast. At frame 11500, mean BGR is 126/187/179 vs 122/165/156 on Windows, and std 95/69/70 vs 74/58/59.
- **Histogram distances** are reported as distribution distances, not per-pixel error.
- **The repository already notes such a difference.** `discovery.py` says kit colour was calibrated on OpenCV's conversion, and that the CLI conversion "differs by ~22 grey levels". The prebuilt FFmpeg in the Windows OpenCV wheel therefore behaves like the CLI here. Which build setting causes this is not established.

## 3. Controlled decode swap (one factor)

`run_decode_swap.py`:
- Same Linux container, models and harness profile as the saved Linux run. Fresh output and caches.
- `cv2.VideoCapture` is replaced only for this process by an FFmpeg-CLI pipe with the BT.601 path above.
- Exploratory, bench-only; no source change.

| Layer | Decode swap vs original Windows run |
|---|---|
| Decoded pixels | 301/301 identical |
| Detections | 6,492 vs 6,492, all matched one-to-one; max coordinate/score difference 0.0009; embeddings identical |
| OCR | 253/253 input crops pixel-identical; 253/253 texts and regions identical; max confidence difference 0.0035 |
| Tracklets / identity | 16 chosen tracklets identical; solver mode, positives and negatives identical |
| Timeline | states, evidence and presence identical on 300/300 frames |
| Metrics | identical: 152 correct, 128 abstained, 7 unmatched on stored times |

## 4. Linux vs Windows, layer by layer (`linux_vs_windows.json`)

**Detection** (both runs store source-pixel boxes, so no coordinate transform is needed):

| | Count |
|---|---|
| Linux / Windows boxes | 6,407 / 6,492 |
| Matched one-to-one (IoU ≥ 0.5), mean IoU 0.95 | 6,105 |
| Linux-only boxes | 302 (260 of them score < 0.22, near the 0.12 threshold) |
| Windows-only boxes | 387 (328 of them score < 0.22) |
| Target frames with a target detection | **286/286 in both runs** |

The differences are mostly low-score boxes, many near the target.

**Base tracking without OCR** (`base_tracking_without_ocr.json`, run in one environment on both detection sets):
- the target stays in a single track over 4.9–9.6/9.7 s in **both**;
- so the detection differences alone do not fragment it there.

**OCR.** Accepted reads (`numberReads`) and sightings:

| | Linux | Windows |
|---|---|---|
| Accepted reads | 25 | 30 |
| "20" reads | 2, on 1 tracklet | 7, on 5 tracklets |
| Discovery sightings | 1 | 5 |
| Number-conflict splits | 1 | 3 |

- Raw OCR events: 746 on Linux vs 253 on Windows.
- **OCR opportunities differ with the tracklet structure.** Linux refinement read 165 focused crops, Windows 92 + 35.

**Identity.** Linux used template mode (1 positive, 4 negatives, 10 tracklets chosen). Windows used classifier mode (5 positives, 22 negatives, 16 chosen). Timeline states agree on 27% of frames.

## 5. Consistent rescoring (gap1150, automatic; the same basis for both runs)

Denominator: 286 target-visible labelled frames on the corrected basis, 287 on stored times. Original scores are kept alongside.

| Basis | Run | Correct | Wrong player | Overlap-ambiguous | Abstained | Unmatched |
|---|---|---|---|---|---|---|
| Stored label times (original) | Linux | 228 | 0 | 0 | 46 | 13 |
| | Windows | 152 | 0 | 0 | 128 | 7 |
| +0.1 s time-corrected | Linux | **241** | 0 | 0 | 45 | 0 |
| | Windows | **159** | 0 | 0 | 127 | 0 |

**All 300 labelled frames, corrected basis:**

| | Correct | Abstained | Unmatched | "?"-label claims | No prediction |
|---|---|---|---|---|---|
| Linux | 241 | 54 | 1 | 3 | 1 |
| Windows | 159 | 139 | 1 | 0 | 1 |

- The unmatched claims and "?"-label claims are **not** counted as correct.
- Zero wrong-player attribution does not show that every claim is safe.
- The default gate is unchanged.

**13-claim audit reconciled** (`claim_audit_reconciliation.json`):
- **Frames 41, 42, 45, 49, 52, 60, 185:** Linux is correct after alignment; Windows abstains (7 of the 12 alignment-defect claims).
- **Frames 126, 238, 294, 297, 298:** correct in both.
- **Frame 295:** Linux abstains; Windows is correct.
- **Frame 97 (1159.8 s corrected, no target label):** an unmatched claim in **both** runs; still unresolved.
- **The three "?"-label claims (1168.2–1168.4 s):** Linux only; Windows abstains there.

## 6. Where the 82-frame difference comes from

There are 91 Linux-only correct frames and 9 Windows-only correct frames (corrected basis).

**13.5–16.7 s (1163.5–1166.7 s): 33 frames. Causal within the rules.**

source frame 11660 → Windows-path pixels (established by the swap) → target detected in both runs → the Windows-path crop of the target at window frame 160 reads **"11"** (0.944, shirt:dark); the Linux-path crop reads nothing → `identity.incompatible_with_target` ("11" is a different full number) → conflict time on tracklet 120 → `stats.build_timeline` labels the frames within 4 s that are nearer the conflict than any #20 evidence `conflict` → 29 conflict + 4 interpolated frames, not claimed.

- This is the existing wrong-player safeguard abstaining on an OCR misread of the true target. It produced no wrong claim, and it is not changed.
- Not separated: whether pixel values or the 0.001-px box difference produced "11". Both follow from decoding.

**4.0–9.6 s (1154.0–1159.6 s): 55 frames. Association / unresolved dependency.**

- Windows has `contact_unclear` contact pieces plus 38 unidentified frames; Linux has one anchored tracklet.
- Base tracking keeps the target in one track on both detection sets, so the loss arises downstream of OCR feedback. That is the number-conflict splits (3 vs 1), the extra #20 evidence and the classifier-vs-template solver mode.
- Which of these removes the piece is not isolated.

**Other frames:**
- 18.5–18.7 s: 3 frames, unresolved.
- Windows-only: 9 frames (10.9–11.0 s and 27.3–29.6 s), associated with Windows' extra #20 reads at frames 228/247.

**Explained:** 33 of the 91 frames (36%) are traced causally; 55 (60%) are associated but not isolated.

## 7. Changes and tests

- `bench/compare_window_runs.py` (new) compares two runs of one window layer by layer:
  - decode hash reconciliation, including probe-vs-run;
  - one-to-one detection matching and target-frame detection;
  - accepted OCR reads;
  - identity claim intervals with evidence labels;
  - outcomes under both time bases, never mixed.
- `bench/decode_probe.py` now also:
  - records OpenCV's bundled FFmpeg library versions and the stream colour metadata;
  - checks frame offsets −2…+2 in `--compare`;
  - takes `--ffmpeg-vf` to probe an explicitly documented FFmpeg-CLI decode path.
- `tests/test_window_run_comparison.py` covers:
  - one-to-one matching with near-duplicate boxes;
  - abstentions staying abstentions in interval comparison;
  - detection of a frame offset hidden by pixel differences.
- The worker suite result is in the commit message.

## 8. Remaining limits and the smallest next experiments

1. **Isolate the 4.0–9.6 s loss** (local, no cloud). In the fixed Linux environment, start from the decode-swap stage-1 output and replay identity with one input changed at a time:
   - (a) Linux accepted reads instead of Windows reads;
   - (b) Linux discovery sightings only.

   This shows whether solver mode or the extra splits drop the target piece. No threshold changes.
2. **Which decode path is right for HLG.** A defensible reference is needed first, for example an owner-reviewed colour target or kit-colour calibration on both paths. No brightness correction should be applied before that.
3. **The GPU gap remains unresolved.** The L4 CPU and GPU runs shared one machine and `opencv-python 4.14.0.94`, so this decode difference does not explain them. No GPU decoded-pixel hashes were recorded. A further GPU run needs separate approval of zone, exact commit, cost and lifetime.
