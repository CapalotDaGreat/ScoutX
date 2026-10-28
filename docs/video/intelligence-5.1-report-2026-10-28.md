# Video Intelligence 5.1 — tracking consistency, re-identification, speed (2026-10-28)

Continues 5.0 on `feature/player-tracking-v3`. Everything below ran in this cloud container
(**2 vCPU, 7 GB RAM, no GPU**) unless marked. Measured values, computed values and targets are
labelled. Recordings are the owner's, used for testing only, never for training. All labels are
developer labels (**one annotator**); every number here is indicative, not a validation.
Machine-readable results: `workers/football-cv/bench/results/5.1/`.

Commits: `401a19e` (phases 1–5), `27f596b` (corrections), `ddd5c36` (adaptive detection),
`8d0363f` (discovery OCR, versions), and the final commit of 2026-10-28 (multi-match check, GPU image fixes, this report).

## 1. Repository audit

* Start: `03dd307` (5.0 part 2), in sync with GitHub; worker tests 509 passed, app + Functions
  713 passed (5.0 report §9 re-checked).
* Identity pipeline as found: stage 1 (`extract.py`, YOLOX-s 1280 px, 10 fps, colour signature,
  grid descriptor every 2nd frame) → BoT-SORT-style tracker with Kalman, camera-motion
  compensation and a shirt-colour gate (`tracker.py`) → colour purification and number-conflict
  splits (`tracklets.py`) → per-match logistic appearance model + dynamic-programming chain over
  tracklets (`identity.py`) → frame states (`states.py`).
* The resolver is already an exact single-target optimum: the best chain of non-overlapping
  tracklets on a time-ordered DAG is a unit-flow min-cost-flow problem. A generic min-cost-flow
  solver would give the same answer more slowly, so 5.1 changes the **graph** (what a node is,
  which edges may carry identity), not the solver; the solver itself was vectorised (§7).
* Versions: the engine version in every report was still "3.1.0"; now `5.1.0`. The worker
  version is now `football-cv/0.8.0`, so 5.1 output needs its own `CV_WORKER_APPROVED` entry
  (an approval of the 5.0 worker does not carry over).

## 2. Profiling (5.0 baseline, measured)

| Stage | 5.0 measured | Where the time goes |
|---|---|---|
| Discovery, IMG_4809 34 min | 1,518 s (first sighting 33.5 s) | OCR 775 s (main reader ≈ 64 %, weak torso check ≈ 36 %), detection 479 s, decode 123 s |
| Dense stage 1 (YOLOX-s 1280) | 3.61–3.74 s per video second | detector 76 %, OpenCV HDR decode 15 % |
| Correction (cached artifacts, 39 answers) | **15.5 s** warm, 18.6 s cold (this session) | tracklets assembled twice (2.7 s each), per-detection kit scores (2.4 s), crop-path parsing (1.4 s), panorama transforms ×3 (1.3 s), per-tracklet classifier calls (1.5 s), 428 k Python transition calls (1.4 s) |
| Correction repeatability | **not idempotent** | random k-means seeding changed the review questions, and with them the refinement OCR workload: the same request took 15 s or 115 s |

Clean per-crop timings of the number reader (no contention): localisation 3 ms, PARSeq 90 ms,
EasyOCR 7 ms — PARSeq dominates.

## 3. Root cause of the 31:44 wrong-likely interval (mandatory regression)

Found by following the chain frame by frame (`exp51/diag3144.py`, full-frame renders):

1. At 31:43.6 two orange team-mates overlap. The tracker's track for #20 (number "20" read at
   31:42.7) continues on the other player (knee supports, larger build). The shirt-colour gate
   cannot see this: same shirt.
2. Hard evidence already stopped at the contact (5.0), but the rest of the tracklet kept the
   label "continuity" with the tracklet's **boosted** appearance score (positives get app ≥ 3.0)
   → confidence ≥ 0.75 → LIKELY.

So the cause was tracklet stitching plus evidence inheritance — not long-range propagation and
not a camera cut. Fix (no timestamp rule): tracks are cut at team-mate contacts, an unclear
contact never carries identity, and anchored parts of a tracklet use the un-boosted appearance
score. Test `test_regression_3144_wrong_player_never_claimed_and_target_kept` runs the real
pipeline on an IMG_4809 slice (numbers only, no images; `tests/fixtures/img4809_3144_slice.*`):
**the 5.0 engine attributes the wrong player (2 labelled frames on the slice), 5.1 none**, and the
number read stays confirmed.

## 4. Tracking architecture changes

| Change | File | Measured effect |
|---|---|---|
| **Contact pieces**: every track is cut where a same-kit box covers ≥ 50 % of it (pre / contact / post) | `crossings.py`, `tracklets.assemble` | 463 contact events in IMG_4809, 0.9 s per match |
| **Crossing links**: pre→post assignment by match-scoped appearance (head / shorts / socks colour, shirt down-weighted, + grid descriptor), with the tracker's own continuation as prior: kept when appearance agrees, *unclear* when it disagrees by < 0.20, a swap only above; players < 90 px need a 0.10 margin to keep | `crossings.py` | on 49 labelled pieces in 27 random contacts (≥ 90 px) the tracker was right 49/49; appearance agreed 46/49, the 3 disagreements were appearance errors (margins ≤ 0.051) → rule. One small-player swap (19:51, 75 px, margin 0.081) found on the whole match → small-player margin |
| **Anchored continuity**: a piece joined to a number read / "that's me" only by clean hand-offs (≤ 0.5 s, ≤ 0.75 body heights, same shot) or clear contact links is LIKELY within 30 s of the evidence, whatever look-alikes are in view; never confirmed | `identity.py`, `stats.py`, `states.py` | main source of the coverage gain (§6) |
| Unclear contact → everything after it on the chain is AMBIGUOUS until new hard evidence or a re-identification step | `identity.py`, `states.py` | |
| Trusted gallery = confirmed observations only (no self-training from likely members); negative gallery adds the other players of a contact the target clearly left | `identity.py` | `GALLERY_SELF_TRAINING = False` |
| Evidence provenance per frame: `number`, `anchor`, `anchored`, `appearance`, `continuity`, `contact_unclear`, `conflict`, `interpolated` | `stats.py` | in `timeline.npz` and the evidence-seconds summary |
| Adaptive detection (keyframes + optical-flow propagation) | `propagate.py`, `extract.py` | **measured, not safe → off** (§7) |

Tracker choice: the existing BoT-SORT-style tracker (Kalman + camera-motion compensation +
appearance/colour gate) was kept: on the labelled contacts it never switched identity on
≥ 90 px players, so the failures are handled where they occur (contacts, small players) rather
than by replacing a tracker that measured well. ByteTrack-style low-score association is already
part of it.

## 5. Appearance and jersey-number evaluation

**Appearance (re-identification).** Match-scoped, in memory, no face model, nothing persisted:
colour signature per body region and the weight-free grid descriptor. Commercially usable
pretrained re-ID weights: the common OSNet / BoT weights are trained on Market-1501 /
DukeMTMC / MSMT17 (research-only terms) → not used (as in 5.0); football re-ID models
(SoccerNet re-ID) need a licence review and were not reachable (network allowlist). Measured
use: crossing decisions above.

**Read independence.** In every logged discovery sighting (IMG_4809 first 21 min, IMG_5105
whole match), the numbers read at least twice in one sighting were real shirts (17, 19, 20, 24 —
the "19" double read was checked by eye: a real orange #19). None of the misreads (74, 71, 78,
13, 54, 41, 14, and "19" on the #17) repeated within a sighting, so the two-read rule was not
defeated by near-identical frames on this data (small sample).

**Legibility gating** (`legibility.py`: height, torso sharpness at a fixed 64 px height, contrast,
digit-shaped candidates). On 5,363 logged reads: full-number reads come from crops ≥ 118 px, but
#20 itself is read from 116–126 px crops on IMG_4529 / IMG_4809, and sharpness is not comparable
across recordings (median 2,727 on the HDR day match vs 511 on IMG_5105). No gate that saves
time keeps all target reads → **gate implemented, off by default**.

**OCR speed** (fixed subset, `bench/results/5.1/discovery_configs.json`):

| Configuration | Wall | OCR | Sightings vs 5.0 |
|---|---|---|---|
| 5.0 | 761 s | 457 s | — |
| **Main read + weak check in one PARSeq batch (5.1 default)** | **731 s (−4 %)** | 433 s | identical |
| + skip players settled on another number for 6 s | 770 s | 453 s | loses 3 night sightings → rejected |
| 352 px detector (with batching) | 688 s (−6 % vs batching alone) | 417 s | loses the night sightings at 22:42, 24:03 and 24:29 → rejected |
| int8 PARSeq | OCR −48 % | | 8 of 56 confident two-digit reads change → rejected |

## 6. Identity results (before / after)

IMG_4809, same stage 1, dense OCR and 5.0 discovery sightings for both engines. Crop labels: 10
target crops, 138 crops of other numbered players (80 of them #17). **Interval ground truth
(new)**: all orange pieces ≥ 50 px in nine 30 s intervals (4:00, 6:40, 10:00, 19:10, 21:35, 25:00,
28:00, 30:00, 31:30), labelled target / not target / unsure; 50.4 s of labelled target time. One
labelling error of mine (a #17 back view labelled as #20 at 21:43) was found by checking the
full frame and corrected before the comparison.

| Automatic (no answers) | 5.0 | **5.1** |
|---|---|---|
| Confirmed / likely seconds, whole match | 26.6 / 226.4 | 25.7 / 182.2 |
| Target crops claimed (of 10) | 7 | **9** |
| Other-number crops claimed (of 138) | **21** (31:44) | **0** |
| #17 claimed | 0 | 0 |
| Interval GT: target time claimed correctly | 21.1 s (19.2 confirmed + 1.9 likely) | **41.3 s** (18.8 + 22.5) |
| Interval GT: wrong attribution | 2.4 s (likely) | **0.0 s** |
| Interval GT: claimed recall [95 % CI by interval] | 0.42 [0.29–0.70] | **0.82 [0.70–0.95]** |
| Interval GT: IDF1 [95 % CI] | 0.57 [0.45–0.78] | **0.90 [0.83–0.98]** |
| Identity switches in claimed frames | 1 | 0 |
| Confirmed precision | 1.0 | 1.0 |

| With the 39 owner answers | 5.0 | **5.1** |
|---|---|---|
| Other-number crops claimed | 7 | **0** |
| Interval GT: correct / wrong | 25.1 s / 0.9 s | **42.1 s / 0.0 s** |
| Interval GT: IDF1 | 0.66 | **0.91** |

Confirmed time is ~0.4 s lower in 5.1 (hard evidence now stops at every contact piece); the gain
is likely time on the right player. Zero errors in 50 s of labelled target time is not a zero
error rate. HOTA is not reported: it needs full multi-object ground truth.

**Manual identification.** Review questions are now deterministic. A component-aware ranking
(one answer settles everything joined by clean hand-offs / clear links) is implemented but **not
enabled**: a simulated review with a label oracle could answer only 8 of 40 questions, which
cannot show a reduction in user effort.

### Other recordings (multi-match check)

Dense stage 1 (YOLOX-s 1280, every frame) on five 60 s pieces of the two other readable matches,
then both engines on the same data, dense OCR and the 5.0 discovery sightings. Every box either
engine claimed as #20 was checked by eye per second (`bench/results/5.1/multimatch_claim_audit.json`).

| Piece | Why chosen | 5.0 claimed correct / wrong | 5.1 claimed correct / wrong |
|---|---|---|---|
| IMG_4529 night, 24:00–25:00 | #20 sighting with a main-reader read at 24:03 | 4.3 s / **5.9 s** (a player whose back shows **12**, 24:21–24:27) | **6.1 s / 0.0 s** |
| IMG_4529 night, 16:00 and 21:00 | #20 sightings, weak reads only | 0 / 0 | 0 / 0 |
| IMG_5105 day, 0:00 and 3:00 | #17 and the known misreads ("19", "41"); #20 not seen near the camera in the whole match (5.0 inventory) | 0 / 0 | 0 / 0 → **target not confidently found** |

On IMG_5105 neither engine forces a positive result. On the night pieces at 16 and 21 minutes the
only evidence is weak torso reads, which by design never become identity evidence, so #20 stays
unidentified there in both versions (he is visible and readable to a person — a recall limit, §11).
The #7 recordings (IMG_6565, IMG_7332) could not be evaluated (§11).

## 7. Performance (before / after, measured on this CPU)

| | 5.0 | 5.1 | Target |
|---|---|---|---|
| Correction, warm worker (answering real review questions) | 15.5 s | **2.2–2.9 s** | < 5 s ✔ |
| Correction, first after a worker restart | 18.6 s | 16.0 s | — |
| Same correction twice | different questions / OCR load | identical report (no new OCR in corrections; deferred reads counted in `engine.ocrDeferred`) | idempotent ✔ |
| Discovery (subset) | 761 s | 731 s (−4 %) | −30 % ✘ |
| Dense stage 1 | 3.74 s/s | 3.74 s/s (default unchanged) | −40 % ✘ |
| Dense stage 1, keyframes every 2nd frame (opt-in) | | 2.31 s/s (−38 %) | not safe: labelled #20 time 23.6 → 17.4 s on one slice, +0.5 s wrong on the other |
| … + ffmpeg decoding | | 1.94 s/s (−48 %) | not safe: explicit HDR conversion lowers kit scores (0.54 → 0.35) below the calibrated thresholds |
| Threaded decode prefetch | | identical output, no gain on 2 vCPU | on automatically only with a GPU detector |

Why the CPU targets for discovery and dense were not reached: both are bound by two neural
networks (YOLOX at 0.35 s per 1280 px frame, PARSeq at 90 ms per crop). Every reduction that
removed work from them lost target evidence on at least one recording, and the brief does not
allow trading identity for speed. The remaining lever is hardware (GPU), which could not be
measured (§9).

Memory: correction peak RSS 2.2 GB for a 34-min match (whole-match detections in memory, as in
5.0); the per-process memo is an LRU of 24 entries and never persisted.

## 8. Tests

All suites run on 2026-10-28 in this session with the final code:

| Suite | Result |
|---|---|
| Worker tests (`pytest workers/football-cv/tests`) | **517 passed** (5.0: 509) |
| App + Functions unit tests (`npm run test:unit`) | 713 passed |
| `npm run typecheck`, `npm run lint`, Functions `tsc` build | clean |
| Full-match production path (`analyze` on IMG_4809, auto and with answers) | report invariants OK; engine 5.1.0 |
| Firestore rules tests, device tests, GPU image build | **not run** (no emulator, no devices, no Docker daemon / registry) |

New tests (`tests/test_51.py`): vectorised kit scores; contact detection and pre/contact/post
pieces; the link rule (tracker prior, unclear, swap only above the margin, small-player margin);
the **31:44 regression on real IMG_4809 data**; the vectorised chain solver equals the reference
loop on random problems; memo keys by content; discovery: settled skip and gate never create
evidence; batched read+verify gives the same sightings as two calls.

## 9. GPU

**Blocked.** No GPU in this environment; no Docker daemon, and the image registries (Docker
Hub, nvcr.io) are unreachable, so the image could not be built either. Static review of
`Dockerfile.tracker-gpu` found and fixed two defects: `python3.11 -m pip` fails on Ubuntu 22.04
(pip belongs to the system Python 3.10 → now a 3.11 venv), and the health check called `curl`,
which the image does not contain. `bench/pipeline_benchmark.py` now records model start-up,
peak RSS and peak GPU memory and takes `--keyframe-every`, so CPU and GPU can be compared on the
same clip and settings. No acceleration ratio is claimed.

Commands for the GPU host:

```
docker build -f workers/football-cv/Dockerfile.tracker-gpu -t pitchproof-tracker-gpu:5.1 workers/football-cv
docker run --gpus all -v /path/to/clips:/data pitchproof-tracker-gpu:5.1 \
  python3.11 bench/pipeline_benchmark.py --video /data/IMG_4809_proxy.mp4 --number 20 --kit orange \
  --segment 300 --out /tmp/bench_gpu.json --price-per-hour <rate>
# the same command without --gpus on a CPU host gives the comparison run
```

## 10. Deployment and rollback

* Deploy the new image (worker `football-cv/0.8.0`, engine `5.1.0`) behind the existing flags.
  It reports nothing to users until `TRACKING_V3_ENABLED` is set for the environment and the new
  worker version is added to `CV_WORKER_APPROVED` — neither was set here.
* New settings (all optional): `SCOUTX_CONTACT_SPLIT` (default 1; 0 restores the 5.0 tracklet
  assembly), `SCOUTX_CORRECTION_OCR_BUDGET_SEC` (default 0 = corrections read no new crops),
  `SCOUTX_KEYFRAME_EVERY` (default 1), `SCOUTX_DECODE_PREFETCH` (default auto = GPU only).
* Existing reports stay valid; report versions are monotonic and stamped with the engine version.
* Rollback: route traffic back to the previous Cloud Run revision (worker 0.7.0); or keep the
  image and set `SCOUTX_CONTACT_SPLIT=0` to disable the contact pieces only.

## 11. Remaining limitations

1. **#7 not evaluated.** IMG_6565 (16.08.2025) and IMG_7332 (14.02.2026) are still only partly
   downloaded on the laptop (4.55 of 7.7 GB and 3.85 of 8.5 GB, unchanged for several hours; no
   index, ffprobe cannot open them). Nothing was tuned or tested on a non-orange kit or on #7.
2. **CPU speed targets not met** for discovery (−4 % instead of −30 %) and dense extraction
   (default unchanged; the faster keyframe mode lost target time). GPU not measured.
3. **Night recall.** On IMG_4529 most #20 evidence is weak torso reads, which never become identity
   evidence; dense OCR reads little at night. A jersey-specific recogniser needs licence-reviewed
   training data (not customer footage).
4. **Corrections defer new number reads.** A correction never reads new crops (idempotent, fast);
   the deferred count is reported (`engine.ocrDeferred`), but nothing yet schedules the follow-up
   full resolve that reads them — orchestration change for a later release.
5. **Evaluation size.** One annotator; 50 s of labelled #20 time in nine intervals on IMG_4809,
   49 labelled contact pieces, one night piece with claims. Thresholds (contact margins, 30 s
   anchoring) were chosen on IMG_4809 and then checked on IMG_4529 / IMG_5105 pieces — not on an
   independent labelled set. Zero errors in these samples is not a zero error rate.
6. **Review-question ranking** (component-aware) not evaluated; off.
7. **Release gates unchanged**: `CV_WORKER_APPROVED`, `CV_EVENTS_VALIDATED`,
   `TRACKING_V3_ENABLED` not set; worker 0.8.0 needs its own approval; nothing is production-ready.
