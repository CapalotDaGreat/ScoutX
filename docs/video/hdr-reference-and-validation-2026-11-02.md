# HDR decoding reference, contact-margin correction, frame accounting and broader validation (2026-11-02)

Branch `codex/gpu-benchmark-5-3`. Follows [windows-bundle-decode-trace-2026-11-02.md](windows-bundle-decode-trace-2026-11-02.md). The pinned GPU inference commit `51d41c9` is unchanged.

- No cloud resources. `productionApproval=false`.
- The default decoder, thresholds, safeguards, gates and label-time policy are unchanged.
- Evidence: [hdr-reference-20261102/](../../workers/football-cv/bench/results/5.3/hdr-reference-20261102/) and [windows-bundle-trace-20261102/reconciliation/](../../workers/football-cv/bench/results/5.3/windows-bundle-trace-20261102/reconciliation/). Numbers and text only; no frames or crops.

## 1. Contact margin at 1155.7 s (window-local 5.7 s): exact calculation and a correction

**Source.** `crossings.split_at_contacts` → `_link_event`. Read from the code and recomputed from the saved trace (`reconciliation/trace_v1_with_heights.json`; costs rounded to 3 dp by the trace):

- **Event.** Contacts connected through same-kit partnership form one event.
  - Pre pieces: the track pieces before the contact, described by up to 2.5 s next to it with at least 3 non-contact rows.
  - Post pieces: the pieces after it, described the same way.
  - Pieces without a usable descriptor are dropped.
- **Cost.** `distance(pre, post)` = 0.7 × (1 − cos of region-weighted mean colour signatures) + 0.3 × (1 − cos of mean grid embeddings). There is no further normalisation.
- **Assignment.** The optimal joint assignment of pres to posts (Hungarian, `linear_sum_assignment`; rectangular, so a pre may stay unassigned).
- **Margin of a pre.** The cost of the best assignment in which this pre does not get its optimal post, minus the optimal total. Every row is forced to an alternative post or allowed to stay unassigned.
- **Decision for a pre whose optimal post is its tracker successor:**
  - **same**, unless the event is `small` and the margin is below 0.10;
  - **unclear** otherwise.
  - `small` is an **event** flag: the minimum median box height over all the event's described pieces is below 90 px.
  - Identity may follow `same`, never `unclear`.

**The recorded event (Windows colour):**

- Pres: 199, 14, 133 (target, 221 px), 5, 6.
- Posts: 127, 135 (target successor, 117 px), 137, 139.
- Pre 14 (46.5 px) has no tracker successor among the posts. Pre 6 is 79.7 px. So the event is `small`.

| | Optimal | Best alternative for the target pre |
|---|---|---|
| Assignment | 199→127 (0.079), **133→135 (0.116)**, 5→137 (0.066), 6→139 (0.119) | 199→127, **14→135 (0.174)**, 5→137, 6→139, target pre unassigned |
| Total | 0.380 | 0.438 |
| Margin | | **0.058** from the rounded costs (0.174 − 0.116); **0.059 recorded** from unrounded costs |

**Correction.** The previous report described the competitor as "another player's piece at 0.120 vs 0.116". That is wrong.

- 0.120 is the target pre's cost to post 127. It is not part of the margin.
- The margin comes from pre 14, a 46.5 px piece without its own continuation, competing for the target's successor.
- With Linux colour (m1/v2), pre 14 keeps its own successor (50.3 px) inside a smaller event. The best alternative must swap both, giving a margin of 0.158–0.188 → `same`.
- The formula, the 0.10 threshold and the trace data are unchanged.
- Regression test: `test_recorded_1155_7_event_margin_is_the_joint_assignment_gap_not_a_pairwise_cost_difference`. It reproduces the decision from the saved costs and checks that piece 14 never receives the target's successor (wrong-player counterexample).

## 2. Frame-level reconciliation (gap1150, automatic)

Tool: `bench/frame_sets.py`; data: `reconciliation/frame_sets.json`. All sets are generated from saved timelines, not report text.

| Basis | Target-labelled | Scorable | Correct in both | Linux only | Windows only | Neither | Net |
|---|---|---|---|---|---|---|---|
| Stored label times | 287 | 287 | 144 | 84 | 8 | 51 | +76 |
| Corrected (+0.1 s) | 287 | 286 (the label at 1180.0 s is outside the window: no prediction) | 150 | **91** | **9** | 36 | **+82** |

**Claims outside correct coverage (corrected basis, all 300 labelled frames):**

- Linux:
  - 1 unmatched (1159.8 s);
  - 3 "?"-label claims (1168.2–1168.4 s).
- Windows: 1 unmatched (1159.8 s).
- No wrong-player or overlap-ambiguous claims in either run.

**Attribution of the 91 Linux-only frames**, by single-factor interventions on the Windows run, read per frame:

| Intervention on Windows stage 1 (others at Windows) | Linux-only frames it gets correct | Frames (window index) |
|---|---|---|
| Linux OCR reads (`identity-replays/winbase-ocr`) | 29 | 138–166 |
| Linux colour signatures, frames 35–60 only (`m1`) | 51 | 39–45, 48–54, 56–63, 67–95 |
| Linux colour signatures, all frames (`v2`) | 61 | the 51 + 64–66, 134–137, 184–186 |
| none of the above | **1** | 55 (1155.5 s) |

- The OCR set and the colour set are **disjoint**, and 29 + 61 + 1 = 91.
- The earlier "33-frame" and "55-frame" groups were interval sizes (13.5–16.7 s and 4.0–9.6 s), not per-frame recoveries. Within 13.5–16.7 s, 29 frames are recovered by the read swap. Within 4.0–9.6 s, 54 are recovered by the full colour swap.
- 10 frames (64–66, 134–137, 184–186) are recovered by the full colour swap but not by colour on frames 35–60. Their mechanism is **not traced**.
- These recoveries show per-frame **sufficiency of one swapped input on the Windows stage-1 output**. They are not an additive decomposition:
  - swapping reads and sightings together gives 66 correct, fewer than either swap alone;
  - the read swap also **loses** 10 frames that both baselines get right (98–107).
- The 88 attributed frames are not independently causal.

**The 9 Windows-only frames:**

- Frames: 108–109, 272–273, 279–281, 292, 295.
- With Windows discovery sightings on Linux stage 1 (`linbase-sightings`), all 9 are correct. With Windows reads, only 108–109 are.
- So they are associated with Windows' extra discovery sightings (3 vs 1). Swapping the sightings on the Windows base changes nothing, so the sightings are sufficient on the Linux base but not shown to be necessary.

**Unexplained:** frame 55 (Linux-only), the mechanism of the 10 full-colour-only frames, and why the read swap loses frames 98–107.

## 3. Source colour metadata (IMG_4809)

Commands and outputs are in `hdr-reference-20261102/` (`tech_checks.json`, `freeze.json`).

| | Proxy `IMG_4809_proxy_10fps.mp4` (SHA `b1077af3…`) | Original `IMG_4809.MOV` (SHA `6450a5bb…`) |
|---|---|---|
| Codec | H.264 High 10, x264 core 163 (CRF 24), Lavf58.76.100, 10 fps | HEVC Main 10, Apple "HEVC", iPhone 15 Pro, iOS 17.5.1, 30 fps |
| Samples | yuv420p10le, 4:2:0, 10-bit (SPS `bit_depth_*_minus8 = 2`) | yuv420p10le |
| Colour (bitstream VUI) | `colour_primaries 9` (BT.2020), `transfer_characteristics 18` (HLG), `matrix_coefficients 9` (BT.2020 NCL), `video_full_range_flag 0` | stream: bt2020 / arib-std-b67 / bt2020nc / tv |
| Container | `colr` `nclx` 9 / 18 / 9, full range 0: agrees with the VUI | as stream |
| Chroma location | not signalled (`chroma_loc_info_present_flag 0`): H.264 default type 0 (left) | not reported |
| HDR side data | none (no mastering display or content light level); one x264 user-data SEI | **Dolby Vision configuration record, profile 8** (base layer HLG; RPU not used by any path here) |
| Rotation / display matrix | none | none reported |

The proxy is a transcode, not the camera stream. Its levels follow the original: mean luma differs by 0.1–0.4 codes over the first 9 frames of a stream-copied 3 s cut at 1150 s. Exact frame correspondence between the proxy and the original was **not** established, because a stream-copy cut starts at a keyframe.

## 4. What "reference" means here, and the frozen candidate

There are five distinct stages. Only the first has a unique correct answer.

1. **Native decoding to Y'CbCr samples.**
   - Deterministic by the codec specification.
   - **Verified:** native planes are bit-identical across two independent FFmpeg builds: FFmpeg 6.1.1 CLI (libavcodec 60) and PyAV 19.0.2 (libavcodec 63.1). That holds for 300/300 proxy frames and for 30/30 frames of the original HEVC cut.
   - The OpenCV, Windows and reference paths differ **only after** this stage.
2. **Y'CbCr → R'G'B'.** Fixed by the signalled metadata: BT.2020 NCL matrix (Kr 0.2627, Kb 0.0593) and narrow range (10-bit Y' 64–940, Cb/Cr 64–960 about 512).
   - Normative sources: [ITU-R BT.2020](https://www.itu.int/rec/R-REC-BT.2020/en), [ITU-R BT.2100](https://www.itu.int/rec/R-REC-BT.2100/en) and ITU-T H.273 for the code points (summary: [Coding-independent code points](https://en.wikipedia.org/wiki/Coding-independent_code_points)).
   - Not unique: the chroma upsampling filter.
3. **HLG interpretation.** HLG is scene-referred. BT.2100 defines an OOTF that depends on the display peak (system gamma 1.2 at 1,000 cd/m²) ([Rec. 2100](https://en.wikipedia.org/wiki/Rec._2100), [HLG](https://en.wikipedia.org/wiki/Hybrid_log%E2%80%93gamma)).
   - ITU-R BT.2408 places HDR reference white at 75% HLG, about 203 cd/m² on a 1,000 cd/m² display ([Borer, BBC, W3C colorweb 2017](https://lists.w3.org/Archives/Public/public-colorweb/2017Nov/0018.html); [BT.2408 contents](https://www.itu.int/dms_pub/itu-r/opb/rep/R-REP-BT.2408-2017-TOC-HTM-E.htm)).
4. **HDR → SDR rendering.** There is **no single normative answer**.
   - Documented options include display-light down-mapping (OOTF, map reference white to SDR, tone-map highlights, gamut-map) and the HLG backward-compatible rendering. In the latter, the HLG signal is shown as an SDR gamma signal, with a BT.2020 → BT.709 matrix for BT.709 displays ([Cotton, BBC, W3C workshop: HLG format conversion](https://w3.org/Graphics/Color/Workshop/slides/talk/cotton2); [BT.2087](https://www.itu.int/rec/R-REC-BT.2087/en) for the BT.2020 → BT.709 conversion).
   - The ITU HLG text itself was not retrievable in this environment (ITU pages returned empty). Equations and constants were checked against the open-source colour-science 0.4.7 implementation, not quoted from the PDF.
5. **8-bit model input.** OpenCV-style 8-bit full-range BGR.

**Frozen candidate `hlg-bc709-g2.2-v1`** (`bench/hdr_reference.py`, frozen at commit `22a58b9`, module SHA in `freeze.json`, recorded before any broader tracking output):

| Stage | Choice | Basis | Assumption? |
|---|---|---|---|
| 1 | native yuv420p10le planes from FFmpeg | codec spec; verified bit-exact across builds | — |
| 2 | bilinear chroma upsampling, chroma location 0 | H.264 default location; filter choice | **yes (filter)** |
| 2 | BT.2020 NCL, narrow range → R'G'B' (HLG signal) | signalled metadata | — |
| 3–4 | HLG backward-compatible SDR rendering: signal as gamma 2.2; BT.2020 → BT.709 in that linear light; hard clip | BBC / ITU description of HLG SDR compatibility | **yes (rendering, gamma 2.2, hard clip; no OOTF, no highlight tone mapping)** |
| 5 | 8-bit full range, round half up, BGR | model input contract | — |

**Metadata guard.**

- The candidate refuses any source whose stream or first decoded frame does not signal exactly yuv420p10le / bt2020 / arib-std-b67 / bt2020nc / tv. Missing, `unknown` or conflicting values are never guessed.
- A Dolby Vision configuration produces a warning: the RPU is ignored and the HLG base layer is rendered.
- SDR BT.709 sources (IMG_4529) are refused.

**Reference-value checks** (`tests/test_hdr_reference.py`; cross-checks in `hdr-reference-20261102/`):

- The BT.2020 → BT.709 matrix matches the published BT.2087 values within 1e-4, and colour-science to 7e-16.
- Y'CbCr → R'G'B': code 64 → 0, 940 → 1, 502 → 0.5, pure primaries round-trip exactly; colour-science agrees to 2e-16.
- Stages 2–3 on a real frame agree with an independent implementation (zimg / FFmpeg `zscale`, bilinear, left siting) to 1.9e-7 (float32 precision). zimg in this build does not support the gamma-2.2 transfer (H.273 code 4), so stages 4–5 are cross-checked by the matrix test, not end to end.
- Neutral greys keep their signal value to within one 8-bit code.

**Characterisation** (301 frames, 1150–1180 s, same source frames; offsets checked; per-pixel mean absolute error in 8-bit codes; `characterization.json`):

| Pair | Mean of per-frame mean abs error | Range |
|---|---|---|
| reference vs Windows path (BT.601 matrix, no gamut conversion) | 7.2 | 5.6–8.4 |
| reference vs Linux OpenCV path | 23.1 | 20.9–26.7 |
| Linux vs Windows | 21.6 | 19.0–25.2 |
| reference gamma 2.2 vs gamma 2.4 (sensitivity) | 0.80 | 0.54–0.96 |

**Clipping at frame 11500** (other frames are similar):

| Path | Pixels at 255 | Pixels at 0 |
|---|---|---|
| Reference | 0.04% | 2.0% |
| Windows | 0.02% | 0.2% |
| Linux | **17.9%** | 0.8% |

- In the reference, 2.2% of samples are clipped by the gamut conversion (mostly negative values: saturated BT.2020 colours outside BT.709). 0.17% of R'G'B' signal values lie outside [0, 1] before rendering.

**What the Linux OpenCV path does:**

- **Documented.** Current OpenCV `cap_ffmpeg_impl.hpp` converts with `sws_scale_frame` when libswscale ≥ 6.4. It does not call `sws_setColorspaceDetails`. A source comment notes that frame properties matter for this call from libswscale 8.12.100.
- **Documented.** In FFmpeg 8, `sws_scale_frame` in dynamic mode takes all properties from the frames, and colour conversions follow an "intent" whose default is perceptual tone mapping ([OpenCV source](https://raw.githubusercontent.com/opencv/opencv/4.x/modules/videoio/src/cap_ffmpeg_impl.hpp), [FFmpeg swscale.h](https://ffmpeg.org/doxygen/trunk/swscale_8h_source.html), [FFmpeg 8.0 swscale.h](https://ffmpeg.org/doxygen/8.0/swscale_8h.html)).
- **Measured.** The Linux wheel bundles libswscale 9.5.102.
- **Measured.** The Linux output is closest (mean abs error 3.9 codes) to a display-light rendering: BT.2100 OOTF at 1,000 cd/m², 203 cd/m² → SDR white, BT.709 primaries, gamma 2.4. That hard-clipped variant puts 32.6% of pixels at 255; Linux has 17.9%, so Linux uses some highlight compression.
- **Inference (not verified).** The Linux path is FFmpeg's colour-managed HLG → SDR conversion.
- **Measured.** The Windows path equals FFmpeg swscale's BT.601 limited-range conversion bit for bit. The Windows build's library version was not recorded.

**SDR control (IMG_4529 cut, BT.709 8-bit):**

- Native planes are identical across builds (30/30).
- The Linux OpenCV path equals an explicit BT.709 limited-range conversion on 10/10 frames, and differs from BT.601 by a mean of 1.7 codes. The default path therefore honours SDR metadata on Linux.
- The reference refuses SDR, so it changes nothing for SDR footage.

**Conclusion.** No unique correct rendering exists for this HLG source and an 8-bit SDR-trained model. Stages 1–2 are defined by the metadata and verified. Stages 3–4 are a choice. `hlg-bc709-g2.2-v1` is a **documented candidate**, not ground truth:

- it is the one rendering here that needs no peak-luminance, reference-white or tone-curve parameters;
- it uses the signalled matrix;
- it clips almost nothing.

The Windows path differs from it mainly by using the wrong matrix (BT.601 for BT.2020 NCL content) and no gamut conversion. The Linux path is a different legitimate class of rendering (display-light, tone-mapped) with heavy highlight clipping. Neither existing path is shown to be wrong for tracking. Both remain experimental, as does the candidate.

## 5. Broader validation of the frozen candidate (IMG_4809 labelled intervals; local CPU)

**Protocol**: [validation_protocol.json](../../workers/football-cv/bench/results/5.3/hdr-reference-20261102/validation_protocol.json), committed at `ec9d637` **before** any candidate tracking output outside gap1150 existed.

**Footage inventory and limits.**

| Source | Format | Labels | Role here |
|---|---|---|---|
| IMG_4809 proxy (10 fps) | HLG BT.2020, H.264 10-bit | 9 × 30 s developer intervals (single annotator; T / N / ?) | tracking comparison |
| IMG_4809.MOV | HLG + Dolby Vision 8, HEVC 10-bit; **same match** | none on its own time base | technical checks only |
| IMG_4529, IMG_5105 (other matches) | SDR BT.709 8-bit | claim-audit labels only (boxes an older engine claimed) | SDR control of the default path; the candidate refuses SDR |

- There is **no independent labelled HLG match**.
- The 8 non-gap1150 intervals are held out from the 5.3 decode analysis only. They are existing evaluation labels from the same match, used by 5.1/5.2 gates, and are **not independent footage**.
- Selection rule: all labelled intervals (no selection by outcome).

**Ground truth and time basis (verified per interval).** All boxes of each interval were matched geometrically against the default run's raw detections (`interval_scores.json`, `timeBasisCheck`):

| Interval | Best shift (median IoU, share ≥ 0.5) | Basis used |
|---|---|---|
| 225, 400, 600 | +0.0 s (0.92 / 0.92 / 0.91; ≥ 99.7%) | stored |
| 1150, 1295, 1500, 1680, 1800, 1890 | +0.1 s (0.89–0.92; ≥ 99.6%) | corrected; agrees with the correction record |

This is the first identity-independent check for 1295, 1500, 1680 and 1800 (the record had been inferred from the timestamp pattern there). It also confirms that 225, 400 and 600 need no correction. The original labels are unchanged.

**Scenario descriptors** (from labels and default stage-1 output, not from candidate outcomes):

| Interval | Target-labelled frames | Target height (median px) | Detections < 90 px | Cuts | Camera motion p90 (px/frame) | Luma (10-bit, mean) |
|---|---|---|---|---|---|---|
| 225 | 68 | 180 (close) | 74% | 0 | 51.5 (fast pan) | 643 (brightest) |
| 400 | 0 | — | 76% | 0 | 18.1 | 624 |
| 600 | 0 | — | 87% | 0 | 12.4 | 629 |
| 1150 | 286 (dev window) | 131 | 62% | 0 | 38.1 | 597 |
| 1295 | 94 | 97 (small) | 86% | 0 | 23.5 | 597 |
| 1500 | 0 | — | 96% (distant) | 0 | 16.4 | 593 |
| 1680 | 0 | — | 84% | **3** | **92.9** (cuts / zoom) | 596 (range 579–680) |
| 1800 | 0 | — | 76% | 0 | 20.2 | 589 |
| 1890 | 54 | 127 | 76% | 0 | 28.0 | 585 |

**Coverage gaps:**

- no shade-versus-sun contrast beyond a 585–643 mean luma range;
- no off-screen return with labels outside 1150;
- no different HLG device or encoder with labels;
- 5 of 9 intervals have no target label, so they measure only false claims.

**Baseline reproduction.**

- **Default run.** It is bit-identical to the saved Linux run on 1150–1180 s: same detections and colour signatures, and 300/300 timeline states and evidence. Its decoded frames equal the Linux probe on 301/301.
- **Candidate run.** Its decoded frames on 1150–1180 s equal the frozen reference hashes on 301/301.
- Model hashes and the effective `SCOUTX_*` settings are identical between the two runs.
- Runtime (stage 1 + discovery + resolve per 30 s interval, 2 vCPU): about 4.5 min default and about 6.5 min candidate. The candidate's extra is numpy conversion, about 0.4 s per frame.

**Tracking and safety results.** Automatic only (no owner anchors). Verified basis. Wrong / unmatched / "?" / ambiguous claims are counted over all labelled frames and are never correct.

| Interval | Decoder | Correct / target-labelled | Confirmed + likely | Abstained | Wrong player | Overlap-ambiguous | Unmatched | "?" claims |
|---|---|---|---|---|---|---|---|---|
| 225 | default | 60 / 68 | 6 + 54 | 7 | 0 | 0 | 3 | 0 |
| | **candidate** | **9 / 68** | 9 + 0 | 25 | **26 (18 confirmed)** | 0 | 16 | 25 |
| 1150 | default | 241 / 286 | 18 + 223 | 45 | 0 | 0 | 1 | 3 |
| | candidate | 244 / 286 | 90 + 154 | 41 | 0 | 0 | 4 | 0 |
| 1295 | default | 0 / 94 | — | 94 | 0 | 0 | 0 | 0 |
| | candidate | 33 / 94 | 33 + 0 | 61 | 0 | 0 | 6 | 41 |
| 1890 | default | 0 / 54 | — | 54 | 0 | 0 | 0 | 0 |
| | candidate | 0 / 54 | — | 54 | 0 | 0 | 0 | 0 |
| 400, 600, 1500, 1680, 1800 (no target labels) | both | — | — | all frames | 0 | 0 | 0 | 0 |
| **All 9** | default | **301 / 502** | 24 + 277 | 200 | **0** | 0 | 4 | 3 |
| | candidate | **286 / 502** | 132 + 154 | 181 | **26** | 0 | 26 | 66 |

**Representative changes, traced** (traces in `validation/*.txt`; detections, OCR caches, timelines and results kept for 225, 1150, 1295 and 1890):

- **Regression, 225 s (safety).** The candidate makes 26 wrong-player claims: 18 **CONFIRMED** by number at 242.6–246.1 s (traced below) and 8 likely at 238.6–239.9 s (**not traced**).
  - **Observed chain:**
    - a "20" read (conf 0.95, shirt region) at 244.4 s (window frame 194). Its box matches the **T** label (IoU 0.91), so the read is on the target;
    - the detection belongs to tracklet 205 (raw tracker track 98, 176–262), which carries an **N**-labelled player in every other labelled frame (IoU 0.8–0.97);
    - one tracker association put the target's detection into that player's track for one frame. The target's own track (194) continues at the neighbouring position at 195;
    - neither the contact-split nor the box-steal rule cut the track there (tracklet 205 is not a contact piece);
    - the single read made the whole tracklet number evidence, and conflict-free frames within the hard-evidence radius were claimed as confirmed.
  - The default run has no read at frame 194 and tracks the target correctly there (likely, 0.88–0.98 IoU).
  - **Status:** the failure mode is reproducible from the saved stage-1 output. It is a pipeline vulnerability (number evidence from one frame of a tracklet is not checked against that tracklet's continuity at the read frame), exposed by the candidate's different association. Whether frame 194 is a genuine one-frame crossing or a coincidence between label and OCR is **unresolved without visual review** of source frames 2443–2445.
  - **Candidate fix (proposed, not implemented, needs its own validation):** accept a read as hard evidence for a tracklet only if the read row is geometrically continuous with that tracklet's neighbouring rows, or corroborated by a second read. No threshold or solver change was made in this task.
- **Improvement, 1295 s.** The candidate reads "20" at 1301.2 s on the T box and attaches a discovery sighting, giving 33 confirmed correct frames where the default abstains everywhere. The same chain adds 41 "likely" claims on "?" boxes (1295.0–1299.5 s): unresolved, not counted.
- **1150 s.** 244 vs 241 correct, with many more confirmed (90 vs 18). Unmatched claims rise from 1 to 4; the "?" claims (3) disappear.

**SDR control.** The candidate refuses SDR (metadata guard). The default path decodes SDR BT.709 bit-identically to an explicit BT.709 conversion. No SDR tracking run was needed or made.

## 6. Recommendation

**Retain the candidate as experimental. Do not prepare a promotion proposal.**

- Technically, stages 1–2 are verified and the rendering is documented. That does not make it the right input for this model.
- On the broader sample it **lowers correct coverage (286 vs 301 of 502)** and introduces **26 wrong-player claims, 18 of them confirmed**, plus more unmatched and "?" claims. Higher confirmed coverage does not offset that.

Evidence required before any future default change:

1. Resolution of the 225 s failure (visual review), and a separately validated fix if it is a defect, re-run on both decoders.
2. Zero wrong-player claims on the IMG_4809 intervals **and** a full-match run.
3. At least one **independent** labelled HLG match (different day, ideally a different device or encoder).
4. An SDR regression check.
5. A kit-colour calibration check under the chosen rendering, since kit colour was calibrated on the Linux OpenCV path.

The default decoder, every threshold and every safeguard are unchanged. The original GPU accuracy gap is **not** resolved by any of this CPU work.

## 7. Changes, commits and tests

- `22a58b9`: freeze of `bench/hdr_reference.py` (candidate, metadata guard, `ReferenceCapture`), `tests/test_hdr_reference.py`, the margin regression test, `bench/frame_sets.py`, and trace heights in `identity_replay_swap.py`.
- `ec9d637`: validation protocol.
- This commit adds:
  - `bench/decoder_interval_eval.py` (interval runner with an explicitly named decoder; the harness hashes the label file for provenance);
  - `bench/interval_scores.py` (per-interval time-basis check, scoring, descriptors);
  - the evidence;
  - the corrected margin text in the earlier report.
- Worker suite: **608 passed** (Linux container, Python 3.13.17, CPU; 602 + 6 new tests).
- colour-science 0.4.7 was installed in the container for cross-checks only. No test depends on it.

**Smallest next validation step.** A visual review of source frames 2443–2445 (244.3–244.5 s) and the surrounding 242–247 s, to decide whether the 225 s failure is a one-frame crossing the tracker mis-associated (a pipeline defect independent of decoding) or a label/OCR coincidence. Only then should a narrowly scoped evidence-continuity candidate be considered.

## Addendum (2026-11-02, later): 225 s failure reviewed

The visual review asked for in §6 item 1 was done. Details: [wrong-player-exchange-2026-11-02.md](wrong-player-exchange-2026-11-02.md). The tables above are unchanged (original labels), but two statements in §5 need qualifying:

- **The 18 confirmed wrong-player frames are two different things.** 13 are real (an unrepaired track exchange at 244.4 s carried a correct #20 read back onto another orange player). 5 (window frames 195–197, 208, 211) are an **annotation issue**: the claimed box shows a visible "20" but is labelled N. Labels were not changed.
- **"Default: 0 wrong-player claims" holds only under the original labels.** At window frames 195–197 the default claims (likely) the other player after its own exchange. The label file follows the same exchange, so these count as correct but are visually wrong-player. Frame 194 is an unmatched claim.
- The 8 likely wrong-player claims at 238.6–239.9 s are a separate mechanism (an appearance-only choice of a distant, blurred orange player while #20 was unclaimed). The exchange repair does not address them.
