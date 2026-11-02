# Windows diagnostic bundle: decode trace through identity (2026-11-02)

Branch `codex/gpu-benchmark-5-3`, follows [cpu-divergence-and-label-time-audit-2026-11-01.md](cpu-divergence-and-label-time-audit-2026-11-01.md) (`8012c3d`). The pinned GPU inference commit `51d41c9` is unchanged; `scoutx_tracker/` and `bench/fp32_comparison.py` have not changed since it.

- No cloud resources. No inference code, threshold, gate or label changed. `productionApproval=false`.
- Evidence (JSON/NPZ only, no frames or crops): [windows-bundle-trace-20261102/](../../workers/football-cv/bench/results/5.3/windows-bundle-trace-20261102/), summary in `summary.json`.

## Result in one paragraph

The Windows probe reproduces the original Windows run's decoded pixels exactly (301/301). Those pixels are reproduced exactly on Linux by an explicitly documented path: FFmpeg CLI with swscale's BT.601 limited-range YUV→BGR24 conversion. Re-running the Linux pipeline with only that decode path swapped in reproduces the Windows run end to end: same detections, same OCR text, same tracklets, the same 300/300 timeline states and the same metrics. **The decoded pixels account for the whole Linux/Windows CPU difference in this window.** The other environment differences (platform, Python, torch, harness hash, core count) had no observable effect in this controlled replay; that is not a claim about other windows or machines. Neither decode path is shown to be the correct rendering of this BT.2020/HLG source: both stay experimental, and the default decoder is unchanged. **The GPU gap is not addressed by this and remains unresolved.**

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

  In the decode swap below, none of them had an observable effect on any output in this window. That does not make them irrelevant in general.

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
| Discovery sightings | 1 | 3 |
| Identity `numberSightings` (discovery + attached reads) | 1 | 5 |
| Number-conflict splits | 1 | 3 |

- Raw OCR events: 746 on Linux vs 253 on Windows.
- **OCR opportunities differ with the tracklet structure.** Linux refinement read 165 focused crops, Windows 92 + 35.

**Identity.** Linux used template mode (1 positive, 4 negatives, 10 tracklets chosen). Windows used classifier mode (5 positives, 22 negatives, 16 chosen). Timeline states agree on 27% of frames.

## 5. Consistent rescoring (gap1150, automatic; the same basis for both runs)

Denominators differ by basis and are stated separately:

- **Stored label times:** 287 target-labelled frames, all scorable.
- **Corrected (+0.1 s):** 286 target-labelled frames are scorable; the 287th label moves to 1180.0 s, outside the window, and has no prediction.

Original scores are kept alongside.

| Basis (denominator) | Run | Correct | Wrong player | Overlap-ambiguous | Abstained | Unmatched |
|---|---|---|---|---|---|---|
| Stored label times, original (287) | Linux | 228 | 0 | 0 | 46 | 13 |
| | Windows | 152 | 0 | 0 | 128 | 7 |
| +0.1 s time-corrected (286) | Linux | **241** | 0 | 0 | 45 | 0 |
| | Windows | **159** | 0 | 0 | 127 | 0 |

**All 300 labelled frames, corrected basis** (299 scorable, 1 without prediction):

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

**4.0–9.6 s (1154.0–1159.6 s): 55 frames. Follows the stage-1 output; not OCR reads or sightings (see §6a).**

- Windows has `contact_unclear` contact pieces plus unidentified frames; Linux has one anchored tracklet.
- The earlier hypothesis (number-conflict splits, extra #20 evidence, solver mode) is **refuted for this interval** by the replays in §6a.
- §6b isolates it with the boxes fixed: it follows the colour signatures on 3.5–6.0 s through tracker association of neighbouring players and the contact-link margin rule; embeddings have no observable effect.

**Other frames:**
- 18.5–18.7 s: 3 frames, unresolved.
- Windows-only: 9 frames (10.9–11.0 s and 27.3–29.6 s), associated with Windows' extra #20 reads at frames 228/247.

**Explained:** 33 of the 91 frames (36%) are traced to one OCR read through the conflict rule, and the replays confirm the OCR dependence (§6a). 55 (60%) are traced through colour signatures, tracker association and the contact-link rule (§6b). 3 are unresolved.

## 6a. Identity replays: OCR reads and sightings swapped separately

`bench/identity_replay_swap.py`, local, CPU, same Linux container. Each replay copies one run's stage-1 output (detections, colour signatures, embeddings, crops) into a fresh directory and re-runs stage 2 only, with one input taken from the other run:

- **OCR reads:** every base crop gets the read the other decode gives for the matched detection (one-to-one, IoU ≥ 0.5). That is the other run's cached read (266 / 252 crops), else a fresh read of the other run's own crop file (other pixels, same reader; 1,047 / 1,060), else no text (20 / 38 crops with no matching detection or no other crop). No number is ever invented, and no base-pixel crop is read.
- **Sightings:** the other run's retained discovery sightings (Windows 3, Linux 1).
- **The OCR cache starts empty**, as in the original runs, and reads are served when the pipeline asks. A first attempt with a pre-filled cache did **not** reproduce either run (Windows 200 instead of 159 correct), because which reads exist at the first tracklet split changes; that attempt was discarded.
- **Sanity check:** both own-input replays reproduce their original run on 300/300 frames.
- Sightings-only variants may read crops the base run never selected, on base pixels (52 Windows-base, 12 Linux-base); they are counted.

Correct target frames, corrected basis (denominator 286; 1 further label has no prediction). Wrong-player and overlap-ambiguous claims are 0 in every replay; unmatched and "?"-label claims are listed and never counted as correct.

| Stage 1 from | OCR reads | Sightings | Correct | Abstained | Correct in 4.0–9.6 s (of 55) | Correct in 13.5–16.7 s (of 33) | All-labelled unmatched / "?" | Solver |
|---|---|---|---|---|---|---|---|---|
| Windows pixels | Windows | Windows | 159 | 127 | **0** | 0 | 1 / 0 | classifier, 5 pos |
| Windows pixels | **Linux** | Windows | 178 | 108 | **0** | 29 | 0 / 0 | classifier, 2 pos |
| Windows pixels | Windows | **Linux** | 159 | 127 | **0** | 0 | 1 / 0 | classifier, 5 pos |
| Windows pixels | **Linux** | **Linux** | 66 | 220 | **0** | 29 | 0 / 0 | template, 1 pos |
| Linux pixels | Linux | Linux | 241 | 45 | **55** | 33 | 1 / 3 | template, 1 pos |
| Linux pixels | **Windows** | Linux | 154 | 132 | **54** | 17 | 2 / 4 | classifier, 4 pos |
| Linux pixels | Linux | **Windows** | 249 | 37 | **54** | 33 | 2 / 3 | classifier, 2 pos |
| Linux pixels | **Windows** | **Windows** | 154 | 132 | **54** | 17 | 2 / 4 | classifier, 4 pos |

What this shows, and what it does not:

- **4.0–9.6 s follows the stage-1 output.** It is lost in all four Windows-stage-1 replays and kept (54–55 of 55) in all four Linux-stage-1 replays, whichever OCR reads, sightings or solver mode are used. OCR reads, sightings and solver mode are therefore not the cause of this interval.
- Under Windows stage 1 the target's piece over this interval exists but is not chosen. With its own reads it is split at about 5.5 and 9.8 s and is raised as an owner review question (tracklet 135, 4.7–9.7 s, uncalibrated score 0.23; its box matches the target label at IoU 0.97). With Linux reads it is one piece (4.9–10.8 s), and it is still not claimed. So that split is not necessary for the loss.
- **13.5–16.7 s follows the OCR reads.** Linux reads on Windows stage 1 recover 29 of 33 frames; Windows reads on Linux stage 1 lose 16 of 33. This is consistent with the "11" trace above.
- **The effects are not additive.** Swapping both inputs on Windows stage 1 gives 66 correct, fewer than either single swap, because the solver switches to template mode with one positive. Per-input attributions should not be summed.
- Windows sightings on Linux stage 1 give 249 correct (0 wrong), but 2 unmatched and 3 "?"-label claims remain. That is not evidence that more sightings are better in general.
- The conflicting-number safeguard is unchanged in every replay. Abstaining after a plausible "11" read is the intended cautious behaviour.

## 6b. Appearance features with the Windows boxes fixed (2026-11-02, later)

Evidence: [appearance-isolation/](../../workers/football-cv/bench/results/5.3/windows-bundle-trace-20261102/appearance-isolation/). Tool: `bench/appearance_features.py`. Replays with `bench/identity_replay_swap.py --variant own` (cold OCR cache, Windows OCR reads and Windows discovery sightings in every variant).

**Baseline reconstruction (verified before any swap).**

- Base: the original Windows run's `detections.npz` (bundle). Boxes are the saved float32 detector boxes; frame indices, detection order, scores and `emb_idx` are unchanged. The saved `emb_idx` equals the extraction rule for these boxes, and the 1,333 OCR crop files equal the crop rule.
- Frames were decoded fresh: the BT.601 FFmpeg path matches the Windows probe on 300/300 frames, and the Linux `cv2` path matches the Linux probe on 300/300.
- Colour signatures and grid embeddings were recomputed from Windows-path pixels at the Windows boxes:
  - **embeddings: bit-identical** (2,536 × 256);
  - **colour signatures: identical except one element of one detection** (frame 6, by one float16 ulp, 2.4e-4). The float32 value lies one float32 ulp from a float16 rounding midpoint, so a one-ulp platform difference flips the rounding. No tolerance was widened; this single element is the only difference.
- **Replays.** The saved features (v0) and the reconstructed features (v1) both reproduce the original Windows run on 300/300 states and evidence, with the same outcomes, the same unresolved claim (frame 97) and the same owner question.

**What a swap changes, and hidden dependencies.** Only `sigs` and/or `embs` are replaced (`variants/*.json` record this and assert every other field byte-identical). Grass, camera motion, ball features and OCR crop pixels stay Windows-decoded. A colour swap is **not** colour alone downstream:

- colour signatures are also the tracker's association feature;
- they feed the track-wide colour purification, kit scores and contact-link costs.

A colour swap also changes which crops OCR is asked to read. With Linux colour, the pipeline asked for 25 crops the Windows run never read. Reading them on Windows pixels or answering them with no text gave identical outcomes.

**Matrix** (corrected basis: 286 scorable target-labelled frames, plus 1 label at 1180.0 s without prediction; original basis: 287). Wrong-player and overlap-ambiguous claims are 0 everywhere. Unmatched and "?"-label claims are counted over all labelled frames and never as correct.

| Variant (colour / embeddings) | Correct (confirmed + likely) | Abstained | Unmatched | "?" claims | 4.0–9.6 s (of 55) | 13.5–16.7 s (of 33) | Original basis correct /287 | Target piece 4.7–9.7 s |
|---|---|---|---|---|---|---|---|---|
| Windows run (original) | 159 (134 + 25) | 127 | 1 | 0 | 0 | 0 | 152 | not chosen; owner question, score 0.23 |
| v1 control: W / W (reconstructed) | 159 (134 + 25) | 127 | 1 | 0 | 0 | 0 | 152 | same |
| v2: **L** / W | 221 (142 + 79) | 65 | 3 | 4 | **54** | 4 | 207 | chosen (anchored); owner question, currently target |
| v3: W / **L** | 159 (134 + 25) | 127 | 1 | 0 | 0 | 0 | 152 | not chosen (identical to v1, 300/300) |
| v4: **L** / **L** | 221 (142 + 79) | 65 | 3 | 4 | **54** | 4 | 207 | identical to v2, 300/300 |
| m1: W, **L colour on frames 35–60 only** / W | 211 (134 + 77) | 75 | 2 | 0 | **51** | 0 | 196 | chosen (anchored); owner question, currently target |
| m2: L, **W colour on frames 35–60 only** / W | 166 (142 + 24) | 120 | 2 | 4 | **0** | 4 | 160 | not chosen; owner question |
| m3: W, L colour on frames 90–105 only / W | 159 | 127 | 1 | 0 | 0 | 0 | 152 | identical to v1 |
| Linux run (original) | 241 (18 + 223) | 45 | 1 | 3 | 55 | 33 | 228 | — |

- **Embeddings: no observable effect** in this window (v3 ≡ v1, v4 ≡ v2 on 300/300 frames). No colour × embedding interaction was observed.
- **Colour signatures on frames 35–60 (3.5–6.0 s) are sufficient and necessary for the interval** in these replays: m1 recovers 51/55 and m2 loses 55/55. Colour around 9.8 s (m3) changes nothing.
- The 13.5–16.7 s interval stays OCR-driven: the Windows "11" read is kept here, and the safeguard abstains as designed.

**Contact-linking trace** (`runs/*/trace.json`: read-only spy on `crossings._link_event`, window-local seconds, exact frames verified against the corrected labels).

| | Windows colour (v1, m2) | Linux colour on 3.5–6.0 s (m1, v2) |
|---|---|---|
| Target's own tracker association | target piece 4.0–4.3 → contact piece 4.4–4.6 → piece 4.7/4.9–9.6/9.7 | same pieces from 3.0 to 9.6 s (no differing tracker continuation involves a target detection); in v2 the single frame at 9.7 s forms its own piece |
| Contact event after 4.4–4.6 s | merged with a neighbouring same-kit contact: 5 pre × 4 post pieces, ends 5.7 s; event marked small (< 90 px piece) | 3 pre × 3 post pieces, ends 4.6 s; small |
| Target pre → its tracker successor | cost 0.116; nearest competitor (another player's piece) 0.120; **margin 0.059** | cost 0.125–0.13; competitors ≥ 0.308; **margin 0.159–0.188** |
| Link decision (rule: small-player continuation needs margin ≥ 0.10) | **unclear** (identity may not follow) | **same** (clear) |
| Identity decision for 4.7–9.7 s | not chosen; contact pieces claimed `contact_unclear`; owner question (score 0.23–0.28, not currently target) | chosen through the clear link, `anchored`; owner question raised but already currently target (score 0.44–0.5) |

**Earliest changed decision, verified by one-factor splits:**

| Tracker association sigs | Purification sigs | Target link at contact exit |
|---|---|---|
| Windows | Windows | unclear, 0.059 |
| Windows | Linux | unclear, 0.059 |
| Linux | Windows | same, 0.164 |
| Linux | Linux | same, 0.164 |

Holding association rows fixed while swapping the contact-stage colour (kit scores and link costs) gives the same split: Windows association → unclear (0.059 / 0.049), Linux association → same (0.164 / 0.159). The decision therefore follows the **online tracker association** (`PlayerTracker.update`, colour signatures as association features). It does not follow purification, the contact/kit stage or link costs.

In the raw tracker rows, the first continuation that differs is at **frame 38 (3.8 s)**: a neighbouring player's track, lost after frame 32, resumes on detection 906 at frame 38 with Windows colour, and on detection 931 at frame 39 with Linux colour. No differing continuation involves a target detection (IoU with the target label ≤ 0.09). These neighbouring re-associations put a second same-kit pair into the target's contact event. That adds a near-equal competitor and drops the margin below the small-player rule.

**Causal chain, as supported:** decoded pixels → colour signatures of neighbouring players' detections (3.5–6.0 s) → tracker re-association of those neighbours from 3.8 s → contact-event composition → the target's continuation margin 0.059 < 0.10 → link `unclear` → identity is not carried into the 4.7–9.7 s piece → abstention and an owner question for 55 frames.

- Each arrow from colour onward is verified by a one-factor replay or split.
- What is not established is which colour difference in which neighbouring detection is decisive. Many detections change together in a 26-frame span.

**This is not a defect.** The `unclear` decision is the documented guard: small-player continuations need margin ≥ 0.10, after a measured 75 px swap with margin 0.081. Here it abstains on a true target because a team-mate's piece is almost as similar. Linux colour happens to keep the competitor out of the event; that is not evidence that Linux colour is more correct. No threshold, guard or solver change is made.

**Changed claims to review (not counted as correct):**

- Frame 46 (1154.7 s corrected, labels N, ?, ?, N; no target label): v2 and m1 claim a box that overlaps no label (IoU ≤ 0.05). It continues the target's 1154.6 s claim (IoU 0.95). Most likely an annotation gap like frame 97; unresolved.
- Frame 97 (1159.8 s): unmatched in every variant, as before.
- Frames 180–183 (1168.1–1168.4 s, "?" labels): v2 and v4 claim them (three of them **confirmed** by number) on the "?" box (IoU 0.86–0.97). Linux claims 181–183 as likely, and Windows abstains. These stay indeterminate. A confirmed claim on an annotator-uncertain box is not evidence of a correct identification.
- Frame 179 (1168.0 s, no target box under the claim): unmatched in v2 and v4.
- Contact-transition claims at 1154.6–1154.7 s and 1168.5 s:
  - frame 45 is correct in all claiming variants;
  - at frame 184, v1 and m1 are AMBIGUOUS on a box overlapping an N label (IoU 0.87), which is an abstention, not a claim;
  - v2 claims the T box there (IoU 0.83, N 0.38).

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
- `bench/identity_replay_swap.py` (new) replays stage 2 on one run's stage-1 output with OCR reads and/or sightings from another run, cold OCR cache, reads served by crop pixel hash, OCR on base pixels refused when reads are transferred.
- `bench/appearance_features.py` (new) recomputes colour signatures and grid embeddings for fixed boxes from an explicitly named decode path (frame hashes checked against a probe), and builds stage-1 variants that change only `sigs` and/or `embs` (optionally only on a frame range), asserting every other field byte-identical.
- `bench/identity_replay_swap.py`: `--trace` (read-only capture of target pieces, contact-link events with cost matrices, tracker successors and decisions, and per-tracklet identity decisions including owner questions) and `--unseen-ocr {read,blank}`.
- `tests/test_appearance_isolation.py` covers the extraction rules, reconstruction equality for fixed boxes, refusal of inconsistent `emb_idx` or missing frames, field-isolated variant building, and the contact-link rule with the observed costs. It includes a wrong-player counterexample: an appearance disagreement below the swap margin never re-points identity to a team-mate.
- `tests/test_window_run_comparison.py` covers:
  - one-to-one matching with near-duplicate boxes;
  - abstentions staying abstentions in interval comparison;
  - detection of a frame offset hidden by pixel differences;
  - OCR transfer using only matched reads and never inventing text (a base misread such as "11" does not survive transfer).
- The worker suite result is in the commit message.

## 8. Remaining limits and the smallest next experiments

1. **Which neighbouring detection decides it** (local, optional). Bisect the Linux-colour substitution within frames 35–60 by detection (or by player track) and re-run the tracker-only split. This would name the decisive colour difference. It would not change any conclusion above, and nothing should be tuned on it.
2. **Which decode path is right for HLG.** Both paths stay experimental; the default decoder and the pinned GPU baseline are unchanged. A defensible reference is needed first, for example an owner-reviewed colour target or kit-colour calibration on both paths. No brightness correction should be applied before that.
3. **The GPU gap remains unresolved.** The L4 CPU and GPU runs shared one machine and `opencv-python 4.14.0.94`, so this decode difference does not explain them. No GPU decoded-pixel hashes were recorded. A further GPU run needs separate approval of zone, exact commit, cost and lifetime.
