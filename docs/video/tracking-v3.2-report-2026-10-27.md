# Video Intelligence 3.1 brief: delivery report (engine 3.2), 2026-10-27

Branch `feature/player-tracking-v3`, on top of commits `91f069d` and `8ad9170`.

Every figure below was **measured in this work** on `IMG_4809.MOV` (orange #20, 33:55, 1080p at
10 fps), unless it is labelled *estimate* or *not measured*.

- **Labels:** all accuracy labels were made by the developer, by eye, and are used **for evaluation
  only**. No model was trained on this footage, and the per-match classifier is unchanged.
- **Split:** results are given for all labels and for the held-out half (odd 4-minute blocks).
- **Not deployed:** no flag was enabled and nothing was deployed. The release gate is unchanged:
  BLOCKED, 12 items.

## 1. Code changes and commits

`8ad9170` and both patches were verified: applied with `git am --keep-cr` onto `origin/main`, they
reproduce the branch tree byte for byte.

> **Correction to the earlier instructions:** `functions/src/index.ts` has CRLF line endings, so a
> plain `git am` fails on patch 2. Use `git am --keep-cr`.

New commits are listed in section 9.

| Area | Change |
|---|---|
| Identity (`identity.py`, `stats.py`, `states.py`) | **Contrary evidence:** a full other-number read ("17") makes nearby frames AMBIGUOUS, never claimed. **Bounded hard evidence:** a number read or answer confirms at most ±4 s, never past the midpoint to a contrary read and never across contact with a team-mate, which is where tracker swaps happen. **Lone digits are never used as evidence:** measured, OCR read "1" on a clearly visible "20" and "4" on the same shirt at confidence 1.0. **"Unsure"/"skip" answers are remembered** and never asked again. |
| OCR (`analyze.py`) | **Dense temporal OCR:** every target-kit close-up ≥ 120 px, one per 0.4 s, no early stop. It keeps 187 of 192 full-number reads (7 of 7 "20" reads) at 48 % of the cost of reading every close-up. Crop selection uses recorded box heights instead of opening images. |
| Questions (`identity._questions`) | **"resolve" strategy:** a question about a look-alike in view while the target is claimed is valued by the overlap a "not me" removes. Tracklets already settled by a contrary number read are never asked about. |
| Corrections | **Faster re-solve:** tracking rows are cached once per match (kit/answer independent; `.npy`, no pickle) and only cheap assembly re-runs. The unused embedding PCA/SVD was removed (identical classifier inputs). The stage-1 data is loaded once. The frame cache stops repeated video seeks, and contact-sheet bins are stable. The highlight video is rendered at the end of review (`render`), not on every answer. |
| Detector (`yolox_net.py`, `extract.py`) | ONNX Runtime is the default CPU backend (the export is derived from the hash-checked weights). **Ultralytics YOLO11 (AGPL-3.0) removed.** It is replaced by **YOLOX** (Apache-2.0): the network is written in-repo and the official weights are loaded with `weights_only=True` and `strict=True`, with SHA-256 pins. The CNN embedder (Ultralytics yolo11n-cls) is replaced by a weight-free grid colour descriptor. `requirements-tracker.txt` no longer lists ultralytics. |
| Benchmark (`bench/inference_benchmark.py`) | **Reproducible inference benchmark** (CPU or GPU): torch fp32/fp16 and ONNX Runtime (CPU/CUDA/TensorRT EP, whichever is installed). It reports fps, ms/frame, batching, model init, NVDEC decode, GPU utilisation and memory, peak RSS, and projections to 34/90/140 minutes with cost. |
| Calibration (`calibration.py`, `metrics.py`, `analyze.py`, `cli.py`) | **Confidence-aware pitch-line and landmark detection:** a line must have grass on both sides, which rejects advertising boards. A per-frame feasibility check is added. **Manual calibration assistance:** `scoutx_tracker calibrate OUT --at mm:ss` shows numbered landmark candidates and a pixel grid; `--set "1=lbox_top …"` validates, saves and propagates the calibration through camera motion. Metrics become "calibrated" only from calibrated frames, and only with ≥ 30 s of them. |
| Ball and events (`ball.py`) | **Duel and tackle candidates** with explicit evidence rules: listed for review and **never counted**. Contact counts are split by identity state. The app parser accepts the new types and flags them `candidate`. |
| Link ingestion (`functions/src/uploads/linkImport*.ts`) | **`startLinkImport` callable and `processLinkImportTask`**, described in section 8. |
| App | **Linked video in the analysis form:** the link card, an expected-length field and the start/progress flow. Error and candidate labels are added in 7 locales. `unsure`/`skip` answers are sent to the worker as `asked`. |
| Tests | 13 new worker tests (`tests/test_tracking_32.py`), 10 link-import unit tests, a candidate-event parser test and a rules test for the server-only link store. |

## 2. Tracking accuracy before and after

### Evaluation set (developer-labelled)

| Set | What it is | Count |
|---|---|---|
| Other-number crops | Engine-independent: 311 large orange crops sampled evenly in time (≥ 100 px), plus 50 earlier number crops, plus 21 frames of a visually verified swap | 138 |
| Non-player crops | Flags, spectators, the filming phone/hand | 25 |
| #20 crops | Number visible, found by a targeted search and verified by eye | 10, at 5 distinct moments |

Of the 311 engine-independent crops, **none shows a readable #20** (44 show #17). When #20 is close
enough to read, it's rare. #17 and #20 are visually alike (dark skin, curly hair, the same kit).

Labelling errors were found and fixed during the work. One crop I had labelled "other digit" was
#20 (31:43); it's now '?'. This is evidence that eye labels at this size are fallible.

### Results (engine 3.1 = production; 3.2 = this delivery, dense OCR)

| | 3.1 auto | 3.1 + 39 answers | **3.2 auto** | **3.2 + 39 answers** |
|---|---|---|---|---|
| #20 crops claimed (all / held-out) | 5/10 · 3/3 | 5/10 · 3/3 | **7/10 · 2/3** | **7/10 · 2/3** |
| Other-number crops claimed | 22/138 | 22/138 | **2/138** | 21/138 |
| …of which CONFIRMED (verified) | **21** | **21** | **0** | **0** |
| Non-player crops claimed | 0/25 | 0/25 | 0/25 | 0/25 |

All remaining false claims (2 auto, 21 with answers) are LIKELY frames in **one** incident: a
team-mate swap at 31:44–31:46 inside one tracklet, which colour cannot separate. They are never
verified claims.

**Leave-one-out recall** removes the tracklet's own number reads and any answers within ±10 s. It
is **0/10 in every engine**: without a number read on his own tracklet, nothing else recovers #20.
This is the honest ceiling of appearance and association on this footage.

**Claim-precision audit** used 42 random claimed moments per engine, labelled blind to state:

| | CONFIRMED: right / wrong / unverifiable | LIKELY: right / wrong / unverifiable |
|---|---|---|
| 3.1 | 4 / 2 / 6 | 0 / 1 / 29 |
| 3.2 | **9 / 0 / 3** | 0 / 0 / 30 |

## 3. Coverage (seconds of 1,864 s analysed)

| | Confirmed | Likely | Ambiguous | Not identified |
|---|---|---|---|---|
| 3.1 + 39 answers (baseline) | 72.8 | 443.5 | 988.6 | 359.2 |
| 3.2 auto (no answers) | 12.5 | 233.0 | 1,360.3 | 258.3 |
| 3.2 + same 39 answers | 55.3 | 345.3 | 1,185.3 | 278.2 |

Confirmed and likely time **fell** on purpose. In 3.1, wrong hard evidence leaked onto team-mates
and lone digits counted as evidence, and the brief says "do not increase confirmed coverage
without supporting evidence". A smaller, correct verified figure is the improvement.

### Why the ambiguous time exists

From the measured breakdown of 3.1's 988.6 s:

| Cause | Seconds |
|---|---|
| A look-alike team-mate in view while #20 is claimed | 411.5 |
| No chain, but a look-alike in view | 573.3 |
| Weak score | 3.8 |

Ruled out as causes:
- **Camera motion:** CMC quality < 0.7 in 4 % of ambiguous frames, against 5 % overall.
- **Fragmentation:** the median ambiguous tracklet lasts 23 s.
- **Crop size:** median 75 px; 15 % are under 60 px.

Fixes require new evidence (number reads, answers, or a stronger appearance cue).

### Approaches benchmarked or tried

- **Region-aware colour features:** a head-band (hair/skin) colour change across the swap (0.89–0.97
  similarity) sits inside the normal same-player range (median 0.95, 5th percentile 0.81), so it is
  not usable.
- **OSNet / pretrained re-ID:** blocked. Hugging Face, Google Drive and download.pytorch.org are
  refused by this sandbox's egress, and the boxmot route is AGPL.
- **Tracklet splitting on lone conflicting digits:** tried and rejected, because it broke a correct
  #20 track at 4:03.

## 4. Human corrections required

The comparison is over 3 rounds of 8 questions each, answered by the developer with a strict rule:
"yes" only with the number visible.

| | Legacy selector | **Resolve selector (3.2)** |
|---|---|---|
| Answerable (not "unsure") | 11/24 | **13/24** |
| Wrong LIKELY time removed | 71 s | **110 s** |
| Wrong current claims caught | 2 | 2 |

Both strategies surfaced the same two wrong claims: 1:47 and 20:06, both actually #17. A strict
rater never says "yes" without a visible number, and those moments are already confirmed by OCR,
so this test can only measure removal. Under the strict rule, the 39 answers of the 3.0 session
(11 "yes") would have produced far fewer confirmations.

**Correction speed** (34-minute match, CPU, 2 cores):

| Path | Seconds |
|---|---|
| 3.1 correction path (with dense OCR) | 163 |
| **3.2 correction** | **19.2** (8.5× faster) |

The 3.2 breakdown: engine 14 s (tracklet assembly 1.7, OCR cache 4.0, identity 6.0, metrics and
events 2.5), then about 3 s of report images. The one-off costs per match are tracking rows (40 s)
and dense OCR reading. The highlight video is rendered once, at the end of review.

## 5. Processing time: CPU measured, GPU not measured

Detector accuracy was measured on 120 real frames against YOLO11m boxes, which are an internal
yardstick only:

| Detector (licence) | Person recall | Far players (< 50 px) | Agreement precision | Ball recall | CPU ms/frame (2 threads) |
|---|---|---|---|---|---|
| YOLO11n (AGPL), **removed** | 0.78 | 0.54 | 0.96 | 0.22 | 207 (1 thread) |
| YOLOX-tiny (Apache-2.0) | 0.90 | 0.81 | 0.87 | 0.31 | 266 torch / **194** ONNX (batch 4) |
| **YOLOX-s (Apache-2.0), default** | 0.90 | 0.79 | 0.91 | 0.36 | 405 torch / **277** ONNX (batch 4) |
| YOLOX-m (Apache-2.0) | 0.94 | 0.88 | 0.90 | 0.53 | 909 torch |

End to end on the same 0–21 min, with the same 3.2 engine, dense OCR and labels:

| | #20 crops claimed (confirmed) | Other-number crops claimed | Confirmed / Likely / Ambiguous (s) |
|---|---|---|---|
| YOLO11n, auto | 5/7 (4) | 0/69 | 3.5 / 33.9 / 874 |
| **YOLOX-s, auto** | 5/7 (**5**) | 0/70 | 2.3 / 0.0 / 1,178 |
| YOLO11n + 27 answers | 4/7 (4) | 0/69 | 27.8 / 233.6 / 812 |
| **YOLOX-s + 27 answers** | 5/7 (**5**) | 0/70 | 27.7 / 100.2 / 1,024 |

YOLOX sees many more far players. That means more look-alikes in view, so less time is LIKELY and
more is AMBIGUOUS. Identity accuracy on the labels is equal or better.

The full-match stage-1 YOLOX-s run (torch, 2 processes × 1 thread, 2 vCPU) was stopped by the
session's 2-hour job limit after **8 of 12 chunks (0–24 min)**. That's why the comparison uses the
common span. Measured stage-1 throughput:

| Stage 1 | Seconds per frame (per process) | Wall time per 34-min match |
|---|---|---|
| YOLO11n (3.0) | 0.47 | about 80 min |
| YOLOX-s, torch (measured) | 0.79 | about 2.2 h |
| YOLOX-s, ONNX Runtime (now the CPU default) | not measured end to end | about 1.6 h (*estimate*, from the 30 % faster detect step, which is 87 % of stage-1 time) |

Other measured times:

| Step | Measured |
|---|---|
| Dense OCR | 0.19 s per crop (4,049 crops in 0–21 min, 2 cores) |
| Correction re-solve | 19.2 s |
| Detector-only CPU projection for a 90-min match (2 vCPU, $0.37/h) | YOLOX-s ONNX about 4.2 h, about $1.54 |


**No GPU is available in this environment, so GPU performance is not measured.** The benchmark
harness (`bench/inference_benchmark.py`) runs unchanged on a GPU host and records the device; run
it there before quoting GPU numbers. Earlier GPU/cost figures (3.0 report) are estimates only.

## 6. Physical metric validation status

Automatic calibration was investigated on 2,035 frames (1 per second):

| Measure | Share of frames |
|---|---|
| ≥ 1 pitch line | 90.3 % |
| ≥ 2 line directions | 30.0 % (only the near and far touchlines, which are parallel and meet off-image) |
| A landmark (intersection) in view | **0 %** |
| Geometry feasible for a homography | **0 %** |

The cause is that the phone stands on the near touchline at head height and pans; penalty boxes, the
halfway line and the circle are essentially never in frame. Even manual calibration needs 4
landmarks in one frame, and **no such frame exists in this recording**. The manual tool is in place
(validated on synthetic propagation and rejection tests).

**Status:** distance, speed and sprints stay *experimental*, are never production-visible, and are
consistent by construction (one speed series, invariants pass). Calibrated metrics are only possible
from a recording position that shows pitch markings.

## 7. Football event accuracy

Ball-contact precision audit: 36 random contact candidates for any player, labelled from frame strips.

| | Contact precision | Ball on a valid track | Contact candidates / 34 min |
|---|---|---|---|
| 3.1 detector (YOLO11n) | **30/31 decidable (97 %)**, 5 unclear | 7.1 % of frames | 50 (all players) |
| 3.2 detector (YOLOX-s), 0–21 min | **29/30 decidable (97 %)**, 5 unclear | **9.9 %** of frames (YOLO11n, same span: 6.6 %) | **35** (YOLO11n, same span: 25) |

Precision is high but **recall is very low**: a match has hundreds of touches, so counts are lower
bounds. Passes, possession, tackles and duels are **not validated**. Duel and tackle are candidates
only (review state `candidate`, never counted).

Multimodal AI interpretation of grounded observations is **not implemented** (no model access was
used or configured).

## 8. URL import

What was built:
- **Direct HTTPS links:** implemented end to end into the existing quarantine path. That gives the
  same size, CRC32C, magic-byte, ffprobe, plan-limit and scanner checks, and the same promotion,
  retention and media lifecycle as a device upload.
- **Same gates as a device upload:** account setup, media-upload consent, job ownership,
  cloud-video consent, plan size, quota (charged per job, refunded on failure or cancel) and the
  active/daily upload limits. Starting an import is rate-limited (10/day).
- **DNS pinning:** the connection uses only addresses that were validated as public, so DNS
  rebinding can't redirect it. Proven by a test where a host resolving to 127.0.0.1 is never
  connected to.
- **Download safeguards:** redirects (max 3) are re-validated. The download needs an exact
  Content-Length and must stay within the plan limit; it has idle and overall timeouts; MP4/MOV
  magic bytes are checked on the first bytes; and the CRC32C is declared before finalising.
- **Cancellation and consent withdrawal** are observed while streaming, and the partial write is
  aborted.
- **Source URL privacy:** the URL may contain a token, so it lives server-only
  (`mediaImportSources`, no client access) and is deleted at the end. It is also purged on account
  deletion.

Veo:
- **No public API;** download is limited to team members and Clubhouse admins, as a follow-cam MP4.
  The app explains the export path, and nothing is scraped.
- **The orange #8 match remains blocked** until authorised frames are provided.

## 9. Test results (all executed)

| Suite | Result |
|---|---|
| Worker pytest | **481 passed** (467 before, plus 14 new: YOLOX network and fusion, strict-load rejection, letterbox/NMS, ONNX = torch, grid embedder, contrary reads, same-kit contact, OCR crop selection, conflict times, pitch lines and feasibility, ground speed, calibration propagation and rejection) |
| App/Functions unit tests | **676/676** (665 before, plus link import 10 and candidate events 1) |
| TypeScript (app + tests + functions), ESLint, functions build | pass |
| Web e2e (web-desktop + web-mobile, demo Firebase config) | **42 passed, 0 failed**, 58 skipped (emulator flows, marketing capture, experimental flag). The earlier welcome.spec failures are resolved by supplying the demo config the emulator script already uses. |
| Firestore/Storage rules tests | **Not run.** The emulator JAR download (`storage.googleapis.com`) is refused by egress in the cloud sandbox and on the linked computer. The new rules tests (`mediaImportSources` denied; account deletion) are written but not executed. |
| Emulator e2e flows | Not run (same blocker) |
| Release gate | BLOCKED, 12 items (PASS 22, CODE BLOCKER 2, EXTERNAL CONFIG 4, LEGAL 3, NOT VALIDATED 3), unchanged |
| Physical devices | Not tested (no device access) |
| 7 localizations | New keys added in all 7; the i18n parity unit test passes |

## 10. Remaining production blockers

1. **Verified identity coverage is small:** about 13 s automatic and about 55 s with 39 strict
   answers on this footage. LIKELY claims are unverifiable from the image. A real parent's "yes" by
   appearance is untested.
2. **No calibration possible on this footage:** physical metrics must stay experimental.
3. **Ball recall is very low:** events are lower bounds, and passes, possession, duels and tackles
   are unvalidated.
4. **GPU not measured:** the harness is ready.
5. **Rules tests and the emulator e2e can't run here:** the Firestore emulator download is refused
   by egress, both in the cloud sandbox and on the linked computer.
6. **No physical-device test** was possible.
7. **Labels are one developer on one match:** an independent, multi-match, multi-annotator
   evaluation is still required.
8. **Release gate:** BLOCKED (12 items, unchanged). No flags were set.
9. **Veo / #8:** blocked; the Veo partner API is partner-only.
10. **Pretrained re-ID (OSNet) not benchmarked:** weight hosts are blocked.
