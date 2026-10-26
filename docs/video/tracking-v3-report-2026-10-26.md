# Flagship Video Intelligence 3.0: delivery report (2026-10-26)

Branch `feature/player-tracking-v3`. Every number in this report was measured in this work, unless
it is labelled **estimate**. Nothing here bypasses the release gate:
- `CV_WORKER_APPROVED` and `CV_EVENTS_VALIDATED` are untouched;
- `TRACKING_V3_ENABLED` defaults to off.

## A. Repo and artifact audit (reconciliation matrix)

| Area | Before (claimed or found) | Verified state | Action |
| --- | --- | --- | --- |
| Player tracker v1 (`scoutx_tracker`) | "15.8 min tracked, ~1.2 km" on IMG_4809 | Counted appearance-only guesses as tracking. A same-team swap inside one tracklet was marked confirmed (#24 at 32:27). The summary peak speed (21.6 km/h) contradicted the sprint peaks (27.5–31.9 km/h). | Rewritten as engine 3.1. The v1 claims are withdrawn in `player-tracking-v3.md`. |
| Identity states | Binary "tracked / not tracked" | No ambiguity state and no denominators | Added 7 states and a coverage partition, checked by `invariants.check`. |
| Confirmation | One number read or answer confirmed a whole tracklet | Wrong at 13:39 (answer) and 32:27 (number) | Hard evidence is local (±4 s). Tracklets are split when number reads conflict. |
| Physical metrics | Two estimators that disagreed | Inconsistent | Replaced by one estimator with validity gates, provenance and age-group thresholds. Metrics are never production-visible until calibrated. |
| Worker HTTP | README said no OpenAPI | `/openapi.json` was served | `openapi_url=None`. The v3 routes return 404 unless enabled. |
| Worker deps | `supervision` unpinned | 0.27 removed `sv.ByteTrack`, which broke the existing tests | Pinned `>=0.22,<0.27`. |
| Veo import | Not present | No public API exists: the Public API is partner-only, and match pages are JS shells | Recognised in the app. Shows the official export steps. No scraping. |
| Direct-link import | Not present | Not present | SSRF-safe server inspection is done. **Ingest into quarantine is not implemented.** |
| App tracking UI | Not present | Not present | `tracking` tab, swipe review deck and import panel, in 7 locales. |
| Release gate | BLOCKED (12 items) | Unchanged after this work, row for row | Not modified. |
| Detector licence | YOLO11 (AGPL-3.0) in tracker | Still AGPL-3.0 | **Blocker** for commercial service (see H). |
| User's local folder `C:\Users\masap\ScoutX` | README plus v1 patch | The patch was not applied | A new patch is delivered there. User work is not overwritten. |

## B. Implementation summary

The worker package `workers/football-cv/scoutx_tracker` is at version 3.1.0. Its modules:

| Module | What it does |
| --- | --- |
| `extract` | Stage 1, cached per 1-minute chunk: detection, camera-motion compensation (CMC), shirt signatures, grass fraction. |
| `tracklets` | Kit purification and number-conflict splitting. |
| `identity` | Per-match appearance model, DP chain, local hard evidence, and active review questions (value × uncertainty × diversity, batch of 8, ≥ 90 px). |
| `periods` | Play, non-play and unobserved periods, plus user corrections (kick-off, half-time, full-time). |
| `states`, `invariants` | Coverage partition and consistency checks. |
| `metrics` | A single speed estimator with validity gates and provenance. |
| `ball` | Ball tracks; contacts, carries and pass attempts. A pass is "completed" only with a verified reception, otherwise "unknown". |
| `calibration` | Manual-landmark homography only. |
| `ocr` | PARSeq plus EasyOCR agreement, with a 2nd-pass refinement on question tracklets. |
| `report`, `cli` | `track`, `answer` (y/n/u/s), `undo`, `periods`, `pick`. |

It is cached throughout: tracklet pickles and a path-independent OCR cache. One re-solve after an
answer takes **20–27 s, down from 73 s**.

The worker API is `app/tracking_v3.py`: `/v3/tracking:extract` and `/v3/tracking:resolve`. Both
are target-only output. Non-target identities, number reads and iterations are stripped.

Firebase Functions:
- `inspectVideoSource` is rate-limited and SSRF-safe.
- `answerTrackingQuestion`, `undoTrackingAnswer` and `setTrackingPeriods` check owner and
  guardian consent, are idempotent by opId, and enqueue a re-resolve.
- The `resolveTrackingTask` Cloud Task runs the gates and the superseded check, rejects
  unapproved workers and inconsistent reports, and stores owner-only review images.

Rules:
- `tracking` is a readable subcollection.
- `matchFootage/{jobId}/tracking/*` is owner-read and server-write.

The app adds:
- `TrackingReportSection`: coverage with denominators, a state timeline, periods, and on-ball
  and movement figures with provenance badges, plus an "unavailable and why" list;
- `TrackingReviewDeck`: swipe yes, not me or unsure, with undo;
- `ImportFromLinkPanel`.

i18n is in all 7 locales, and the parity test passes.

Privacy:
- no facial recognition;
- non-target data is not persisted;
- answers are stored as feedback for this match only and are **not** used as training data;
- the #20 and #8 footage was not used for training.

## C. Accuracy report (IMG_4809.MOV, orange #20, 33:55)

All figures are development measurements on **one** video, labelled by the developer. They are not
an independent benchmark.

| Check | Result |
| --- | --- |
| Certain-negative crops (readable #17, #24, #19; n = 47) wrongly given to #20 | **0** (v1/early v3: 2) |
| Certain #20 crops (n = 3) recovered | 1 / 3, which is too few to estimate recall |
| Report invariants | ok, 0 violations |

Answer replay (rounds of up to 8 answers each):

| Round | Confirmed | Likely | Note |
| --- | --- | --- | --- |
| 0 | 13 s | 191 s | |
| 4 | 67 s | 407 s | No confirmed time gained in this round |
| 5 | | | First wrong-person moment introduced |

Final state, after 39 answers:

| State | Seconds |
| --- | --- |
| Confirmed | 72.8 |
| Likely | 443.5 |
| Ambiguous | 988.6 |
| Not identified | 359.2 |
| Analysed (total) | 1864.1 |

(confirmed + likely) / analysed = 27.7 %.

Physical figures are experimental and uncalibrated, measured over 406 s of valid observation:

| Metric | Value |
| --- | --- |
| Distance | 373 m |
| Work rate | 55.2 m/min |
| Peak speed | 24.1 km/h |
| Sprints | 1 |

Ball: 1 contact and 1 pass attempt (outcome unknown). Not validated.

Not evaluated:
- the #8 / Veo footage (no access);
- labelled events;
- calibrated distance;
- other cameras.

**Conclusion:** precision on clear negatives is good. Coverage of verified identity is low (about
1.2 min). The main limit is the far, wide camera: a readable number appears in only a few frames,
and #17 looks the same as #20.

## D. Performance and cost

Measured on the CPU container: 2 processes, 10 fps sampling, imgsz 1280.

| Stage | Measured |
| --- | --- |
| Stage 1, 33:55 video (20,350 frames) | 9,629 process-seconds (0.473 s/frame); **about 80 min wall** with 2 processes |
| Breakdown (300-frame profile) | detect 71 %, decode 16 %, embedding 6 %, CMC 5 %, rest about 2 % |
| Resolve (OCR + identity + metrics), first run | 54 s (numbers 29.8 s, identity 20.5 s) |
| Re-solve after answers | 20–27 s |
| Phone-video proxy transcode on user PC | about 40 s per video-minute |
| onnxruntime CPU vs torch | 0.268 vs 0.233 s/frame, so torch is kept |

Projection, assuming linear scaling with duration:

| Recording | CPU, 2 processes (measured rate) | Cloud Run 4 vCPU/16 GiB CPU-only (**estimate**) | Cloud Run + L4 GPU (**estimate, not benchmarked**) |
| --- | --- | --- | --- |
| 34 min | about 80 min wall | about 40 min, about $0.25 | about 15–40 min, about $0.30–0.70 |
| 90 min | about 3.5 h | about 1.8 h, about $0.65 | about 40–100 min, about $0.70–1.75 |
| 140 min | about 5.5 h | about 2.8 h, about $1.05 | about 60–155 min, about $1.05–2.70 |

How the estimates were derived:
- Prices are Cloud Run list prices: L4 ≈ $0.000187/s, and 4 vCPU plus 16 GiB ≈ $0.000104/s.
  That makes about $1.05/h with the GPU and about $0.37/h without.
- The CPU-only column assumes 4 parallel processes scale linearly. This was not measured.
- The GPU column assumes detection drops to about 10 ms/frame (published YOLO11n T4/TensorRT
  figure: 1.5 ms at 640 px). The CPU part (decode, CMC, signatures) is then about
  0.08–0.11 s/frame.
- **No GPU was available, so these figures are not measured.**

## E. Veo integration

Findings:
- The Veo Public API is limited to partners (Veo support and job listing); no partnership access
  exists.
- Match pages (`app.veo.co/matches/...`) serve only a JavaScript shell.
- Veo's official route is the in-app **Download** (follow-cam MP4), which is available to team
  members and admins.

What was built:
- the app recognises Veo links and reads their public page metadata where it is available;
- it shows the three official export steps;
- the user then uploads the MP4 through the normal pipeline.

What was not done:
- no sign-in bypass, stream extraction, DRM work or private APIs;
- no passwords stored;
- no training on imports.

The #8 Veo match was **not** evaluated, because it was not accessible.

## F. Test report (all executed in this session)

| Suite | Result |
| --- | --- |
| Worker pytest | **467 passed** (with supervision 0.26.1). Includes 13 tracker tests and 8 v3 API tests. |
| Worker HTTP stall loop | 15/15 passed; no stall reproduced on Linux |
| Root unit tests (`node --test`) | **665/665** (baseline 650). The new tests are videoProviders (6), trackingV3 (7) and trackingResolve (2). |
| Typecheck, ESLint, functions build | pass |
| Release gate | BLOCKED, identical to baseline (PASS 22, CODE BLOCKER 2, EXTERNAL CONFIG 4, LEGAL 3, NOT VALIDATED 3) |
| Firestore/Storage rules tests | **Not run**: the emulator JAR download returned 403 and the firebase CLI is absent (exit 127) |
| e2e web-desktop | legal and video specs: 6 passed. welcome.spec: 6 failed, because the container has no `EXPO_PUBLIC_FIREBASE_*` env; this is environmental and not caused by this change. |

## G. Deployment instructions

1. Review and merge `feature/player-tracking-v3`. Deploy rules and functions to **staging**.
2. Worker: build the `workers/football-cv` image and deploy it to Cloud Run with a GPU (L4).
   Set `TRACKING_V3_ENABLED=true` on the worker **in staging only**.
3. Functions:
   - leave `TRACKING_V3_ENABLED` unset in production;
   - in staging, set it with the existing `CV_WORKER_URL`, and configure the Cloud Tasks queue
     for `resolveTrackingTask`;
   - the CV approval record must name the worker version. Unapproved workers are rejected.
4. Run the rules suite where the emulator can be downloaded:
   `npm run test:rules`.
5. Before production:
   - complete the independent evaluation in `full-match-validation.md`, using several matches
     and cameras;
   - resolve the YOLO licence;
   - run the release gate.
   Only an authorised reviewer may then set the approval flags.
6. For the local tool: right-click `Track-Player.ps1` and choose *Run with PowerShell*.

## H. Remaining blockers

1. **Detector licence:** YOLO11 is AGPL-3.0. Either buy an Ultralytics enterprise licence, or
   swap to an Apache-2.0 detector (the RT-DETR already in the repo) and re-measure.
2. **Validation:** there is one video and a handful of certain labels. An independent labelled
   multi-match evaluation is required. Events and pass outcomes are unvalidated.
3. **Calibration:** only manual landmark calibration exists. Until a match is calibrated,
   physical metrics stay experimental.
4. **GPU benchmark:** not run, because no GPU was available. The section D figures for GPU are
   estimates.
5. **Direct-link ingest:** inspection is done, but download into quarantine and scanning is not
   implemented. The UI says so.
6. **Veo:** there is no partner API access, so only the manual export route works. The #8 footage
   was not evaluated.
7. **Rules tests and full e2e:** blocked by the environment (emulator 403, missing Firebase env).
8. **Number reading:** the docTR/EasyOCR recall on far shots is low. A vision-model reader is not
   implemented. The SoccerNet jersey pipeline was rejected because it is CC BY-NC.
9. **Release gate:** remains BLOCKED (12 items, unchanged).

Sources:
- [Veo support: download a recording](https://support.veo.co)
- [Ultralytics YOLO11 docs and licence](https://docs.ultralytics.com/models/yolo11/)
- [Cloud Run pricing](https://cloud.google.com/run/pricing)
- [SoccerNet jersey-number pipeline](https://github.com/mkoshkina/jersey-number-pipeline)
