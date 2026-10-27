# Video Intelligence 5.0 — report (2026-10-27)

Continues 4.1 on `feature/player-tracking-v3`. Every measurement below ran in this cloud
container (**2 vCPU, 7 GB RAM, no GPU**) unless marked. No GPU, no Google Cloud / Firebase, no
Gemini / TwelveLabs / SoccerNet access was available (network allowlist; confirmed with the
owner: continue CPU-only). Measured, computed and target values are labelled. Release gates and
feature flags are unchanged; the new reasoning layer adds one more flag, off by default.

Companion documents: [research and decision record](intelligence-5.0-research.md),
screenshots in `screenshots-5.0/`.

## 1. Repository audit (verified, not taken from the 4.1 report)

* Branch `feature/player-tracking-v3` at `02f768d` (4.1), in sync with GitHub before 5.0.
* Re-run at the start of 5.0: worker `pytest` 500 passed; app + Functions unit tests 702 passed;
  `tsc` and ESLint clean — the 4.1 claims hold.
* Evaluation data: one recording (IMG_4809, 34 min, 1080p 30 fps 10-bit HLG HEVC, 10 fps proxy),
  developer labels (single annotator). PLACEHOLDER_RECORDINGS

## 2. Architecture (four layers)

| Layer | 5.0 implementation | Evidence rule |
|---|---|---|
| A — perception | YOLOX-s detector (416 px discovery, 1280 px dense), PARSeq + EasyOCR agreement, kit colour, tracklets, camera-cut and camera-motion handling, **explicit colour pipeline** (`colour.py`), **match-adaptive ball colour gate** | deterministic; every output timestamped |
| B — temporal understanding | ball/contact/pass candidates (existing), **clip-level off-ball sequences** (`offball.sequence_observations`), **optional clip reasoning** (`videoReasoning.ts`, off by default) | candidates stay candidates; model output is validated before use |
| C — evidence & verification | identity states CONFIRMED / LIKELY / AMBIGUOUS / NOT_IDENTIFIED / not visible; server parser + invariants (`trackingV3.ts`); **sequences accepted only inside CONFIRMED identity time**; reasoning validator (no unknown frames, no numbers except the shirt number, no goal/assist/distance/speed/rating claims) | nothing uncertain becomes "confirmed" downstream |
| D — coaching | coach with **evidence tiers 1–4**, **8 position roles**, up to 3 strengths / 3 improvements / 1 focus, **narrow clip observations**, Ask PitchProof (new intents), **focus follow-up** across matches | coaching reads only layer-C output |

Processing stages (Functions + Cloud Tasks, unchanged contract): ingestion → consent → discovery
chunks (stream sightings) → prioritised dense extraction → resolve → report versions → on-demand
clip reasoning (`explainTrackingMoment`, owner-initiated, cached per report version and moment).

## 3. Performance

### Time to first playable moment (IMG_4809, 1 worker process)

| | 4.0 | 4.1 | **5.0** |
|---|---|---|---|
| First playable moment | 2,148 s, not confirmed | 60 s (5.9 s model load + 53.7 s) | **30.5 s** (8.2 s model load + 22.3 s), confirmed by the number at 0:36 |

### Discovery pass, whole recording

| | 4.1 | **5.0** (quiet run) |
|---|---|---|
| Wall time, 34-min recording | 2,176 s | **1,257 s** (−42 %) |
| Stage seconds | decode 143 + convert 357, detect 626, OCR 843 | decode 121 (incl. conversion), detect 480, OCR 505 |
| OCR reads | 5,014 | 3,266 |
| Sightings (all checked by eye: every crop shows #20) | 4 moments (0:36, 4:01, 19:21, 32:35) | **7 moments** (0:36, 4:01, 19:22, 21:43, 28:11, 30:11, 32:37) — 0 wrong |
| Model load + first sighting | 5.9 + 53.7 s | 6.4 + 23.7 s |

The discovery pass is still ≈ 0.62 s of CPU per second of video on one process; with 600 s
chunks on parallel workers the last chunk would finish after ≈ 6–7 min (**computed, not run**).

What changed (measured on the first minute and the whole match):
* **Decoding**: explicit-colour ffmpeg pipe (multi-threaded, runs in parallel with inference):
  9.9 s per minute of 10 fps 1080p HLG video including conversion, vs 32.5 s with OpenCV (×3.3);
  sparse 2 fps: 6.5 s vs 12.9 s.
* **Detector input 416 px** for the overview (0.034 vs 0.095 s/frame on this CPU; 97 / 98 % of
  the ≥ 160 px players found at 640).
* **Evidence-driven refinement**: neighbour frames are read only after the sample showed the
  number, one of its digits, or a very close player; neighbours are re-detected in a region
  around the player (same model, 16:9 canvas) instead of the whole frame.
* A frame-grid offset between ffmpeg and OpenCV (one frame after long runs) was found and is
  handled when sightings are attached to the dense pass (±1 frame, IoU ≥ 0.5).

### Dense analysis, corrections, GPU

| | Measured |
|---|---|
| Dense stage 1, 1280 px, CPU | 3.61 s per video second (20 s slice, `bench/pipeline_benchmark.py`); ≈ 2 h for 34 min (**estimate**) |
| Resolve with cached detections (whole match, 24 parts) | 8.8 s with 39 answers, 25 s first resolve after start (cold OCR cache); target < 5 s **not met on CPU** |
| GPU (L4) | **not measured** — no GPU. `Dockerfile.tracker-gpu` now has version metadata, a health check, NVDEC and the 5.0 decoder settings; `bench/pipeline_benchmark.py` validated end-to-end on CPU (it found and fixed a crash on recordings shorter than 30 s) |
| Cost per match | **not measured**. Reference list price only: Cloud Run L4 ≈ $0.0001867/s + CPU/memory. Must come from the benchmark run |

The GPU runtime targets (first moment 1–3 min, full 34-min analysis < 10 min, correction < 5 s)
remain unverified.

## 4. Identity evaluation (IMG_4809, labelled crops)

Same harness and labels as 3.2/4.0/4.1 (311 crops; 10 target crops; 138 crops of other numbered
players, 80 of them the look-alike team-mate **#17**; 21 crops visually judged "not #20").

| Run | Confirmed (s) | Likely (s) | Target claimed / confirmed (of 10) | #17 claimed | Other-number claimed / confirmed (of 138) |
|---|---|---|---|---|---|
| Automatic, no sightings | 12.5 | 233.0 | 7 / 7 | 0 | 2 / 0 |
| Automatic, 4.1 sightings (4) | 13.4 | 110.5 | 7 / 7 | — | 2 / 0 |
| **Automatic, 5.0 sightings (7)** | **20.0** | 276.0 | 7 / 7 | **0** | **21 / 0** |
| 39 answers, no sightings | 55.3 | 345.3 | 7 / 7 | 0 | 21 / 0 |
| 39 answers, 4.1 sightings | 56.2 | 306.0 | 7 / 7 | — | 7 / 0 |
| **39 answers, 5.0 sightings** | **62.8** | 336.9 | 7 / 7 | **0** | 7 / 0 |

(— = not broken down by number in 4.1.)

* **#20 vs #17 benchmark**: the look-alike #17 was never shown as the target (likely or
  confirmed) in any run, with or without answers.
* **False confirmed attribution: 0** in every run (no other-number crop confirmed).
* **Wrong likely attribution rises without answers**: the 21 "other" crops are one 2-second
  stretch (31:44–31:46) of one tracklet that the solver extends from the new sighting at 21:43
  together with the one at 0:36 (ablation). It is shown as *likely* ("needs your check"),
  never confirmed. With answers it stays at 7 crops (0.7 s). Reported, not hidden.
* Full engine on the whole match (5.0 code, sightings attached): automatic 22.4 s confirmed,
  15 moments (4.1: 15.8 s, 7); with answers 64.2 s confirmed (4.1: 57.6 s).
* OCR pre-processing (from 4.1) stays off by default (mixed effect).

## 5. Ball and events

* **Ball detection precision** (developer-labelled random samples of stage-1 ball detections):

  | Sample | Score ≥ 0.3 | Score < 0.3 |
  |---|---|---|
  | dev sample (60), before → after colour gate | 26/30 → 26/27 | 11/30 → 11/18 |
  | **held-out sample (60)**, before → after | **28/30 → 28/28** | **7/30 → 7/15** |

  No true ball was removed in either sample. False balls were an umbrella, corner flags, socks,
  boots and grass patches. The gate only applies when the match ball is evidently not warm-
  coloured (median of confident detections), so an orange ball is never filtered.
* **Ball recall and event precision/recall: not measured** — that needs frame-level ball and
  event labels, which do not exist yet. Ball detections exist on 30 % of frames.
* Events stay candidates; no event total is shown as a complete statistic (unchanged).

## 6. Coaching from real evidence

| | 4.1 | 5.0 |
|---|---|---|
| Evidence-based coaching insights on IMG_4809 (39 answers) | 0 | **2**: a match-level off-ball observation (64 s confirmed ≥ 60 s; nearest opponent median 3.8 body heights; free 61 % / tight 13 % of measured time) and one clip-level observation (22:36–22:44: no opponent within 3 body heights 100 % of the time) |
| Without answers | 0 | 0 — limitation shown instead |

* Short-sequence rule: a continuous confirmed sequence of ≥ 6 s, opponents measured on ≥ 70 %
  of its frames and the player ≥ 60 px tall supports one narrow observation about that clip only;
  the server drops any sequence that is not inside confirmed identity time.
* Position-specific explanations for 8 roles (lines: defence / midfield / attack); strengths and
  improvements still need measured ball actions — none on this recording.
* The clip at 22:36 was checked by eye: the outlined player is the confirmed target and no
  opponent is near; distances are image-plane body heights, not metres (stated in the app).
* Not done: review by qualified coaches (usefulness, agreement).

## 7. Ask PitchProof

New deterministic intents: first vs second half (only when half-time is known), defensive
actions (shown as unverified candidates), "what should I practise", positioning/supporting
runs (answered from clip observations when only those exist), "what could I have done
differently at mm:ss" (returns the clip and says the measurements do not contain the better
option; offers the optional clip explanation). Optional clip reasoning: gated, cached,
validated, rate-limited (20/day) — **not quality-evaluated** (no provider reachable).

## 8. Product and UX

* "Follow me" player-focused view in the moment player (smoothed virtual camera, zoom ≤ 2× and
  ≥ 6 body heights visible, full-view toggle); "Explain this clip" only when the server flag is on.
* "Your focus from earlier matches": shows evidence about a saved focus without grading it.
* All new strings in 7 languages. Screenshots: `screenshots-5.0/` (web renders of the real
  components, not device screenshots).

## 9. Tests

PLACEHOLDER_TESTS

## 10. Deployment plan

1. Build `Dockerfile.tracker-gpu` (Artifact Registry), deploy to Cloud Run with 1 × L4, 8 vCPU /
   32 GiB, concurrency 1, min instances 0, zonal redundancy off, region europe-west4 (or west1),
   `TRACKING_V3_ENABLED` per environment, `TRACKING_ARTIFACT_ROOT` with the storage lifecycle rule.
2. Run `bench/pipeline_benchmark.py` on IMG_4809 and the new recordings; record first-moment,
   full-analysis and cost per match in this report before any claim.
3. Functions: deploy `discoverTrackingTask` / `explainTrackingMoment`; secrets: existing
   `OPENROUTER_API_KEY`; flags stay off (`VIDEO_REASONING_ENABLED`, `CV_WORKER_APPROVED`,
   `CV_EVENTS_VALIDATED`); app flag `EXPO_PUBLIC_VIDEO_REASONING` mirrors the server flag.
4. Monitoring: worker `stageSeconds` (decode, detect, OCR, wall) per task, queue delay from
   Cloud Tasks, report version changes, reasoning outcomes (`answered` / `rejected` / reason).
5. Rollback: previous image revision on Cloud Run (traffic split), flags off; reports are
   versioned, so a rollback never overwrites newer results.

## 11. Remaining blockers

PLACEHOLDER_BLOCKERS
