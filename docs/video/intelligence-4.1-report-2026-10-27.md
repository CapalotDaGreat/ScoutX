# Video Intelligence 4.1 — fast first results, tracking and coaching (2026-10-27)

Continues 4.0 on `feature/player-tracking-v3`. Hardware for every measurement below: this cloud
container, **2 vCPU, 7 GB RAM, no GPU**. No GPU and no Google Cloud / Firebase project access were
available to this session (confirmed with the owner: continue CPU-only). Measured, computed and
target values are labelled. Release gates and feature flags are unchanged.

## Why the 4.0 first report was slow and empty

* The 4.0 pipeline processed the match chronologically at full density (every frame at 10 fps,
  1280 px detector, dense OCR) and could only confirm identity where the shirt number was read.
* On IMG_4809 "20" is readable only in a handful of instants. Dense OCR over 12,412 target-kit
  crops read it 7 times (5 distinct moments, the earliest at 4:01). The first 2-minute part had
  no read, so its report (after 628 s) had no identity and no moments; the second report (after
  35.8 min, single worker) had 3 "needs review" moments and 1.1 s of confirmed footage.
* The engine also could not read numbers that it never looked at at the right instant: the
  number is often visible for 1-3 frames as the player turns.

**Fix — early discovery pass** (`scoutx_tracker/discovery.py`, worker `/v3/tracking:discover`,
Functions `discoverTrackingTask`): it runs *before* the dense pass and looks only for the selected
player's number. Sparse sampling (2 fps, 640 px detector), target-kit filter, adaptive density
(close players are read on every following frame), OCR throttling, multi-frame voting where lone
digits are ignored and any other full number abstains. Each sighting becomes a playable clip with
the target outlined and the read crop as thumbnail — the number itself is the evidence, nothing
is inferred from appearance. Discovery chunks (600 s) stream sightings to the app as they are
found; when discovery finishes, extraction is queued with the segments that contain sightings
first, and the sightings are attached to the dense pass as number reads.

## 1. Time to first playable moment

Same recording, same 2-vCPU container, single worker process, measured unless marked.

| | 4.0 (before) | 4.1 (after) |
|---|---|---|
| First report | 628 s — empty (0 moments) | — |
| First playable moment | 2,148 s (35.8 min): 3 *needs review* moments, none confirmed | **60 s** (5.9 s model load + 53.7 s): #20 read at 0:36, confirmed by the number |
| First playable *confirmed* moment | only in the full report (full analysis ≈ 2.5 h, estimate) | **60 s** |
| Playable confirmed moments while the dense pass has not started | 0 | 4 (0:36, 4:01, 19:21, 32:35) after the 36-min discovery pass |

An earlier, lighter discovery configuration reached the first sighting in 41 s but missed 3 of
the 4 sightings; the shipped configuration trades ~13 s for recall. All 4 sightings were checked
by eye: every crop shows "20" (0 wrong). Discovery still misses brief reads the dense pass makes
(e.g. 27:48 at 126 px) — the dense pass keeps them.

The 2–5 minute GPU target is **not measured** (no GPU). On CPU the first moment arrives in about
a minute *here* because the first sighting is at 0:36; a recording whose first readable number
is late would wait until discovery reaches it (≈1.07 s of CPU per second of video on one
process; with 600 s chunks on parallel workers, at most one chunk ≈ 11 min — computed, not run).

## 2. Full processing time

| Stage (34-min recording) | Measured | Notes |
|---|---|---|
| Discovery, whole recording, 1 process | 2,176 s (decode 143, BGR conversion 357, detect 626, OCR 843) | 4,070 samples, 5,014 reads |
| Dense stage 1, YOLOX-s ONNX | 0.44–0.47 s per frame (530 s / 120 s; 1,384 s / 300 s) | unchanged per frame |
| Dense stage 1, whole recording | ≈ 9,000 s on one worker | **estimate** from measured rate |
| Resolve, whole match (24 cached parts) | 4.0: 40.6 s cold, 13.5 s per correction. 4.1 warm (detections kept in the worker): 8.1–9.8 s per resolve (loading the 24 parts once: 2.9 s; quiet CPU) | target < 5 s **not met** on CPU |
| Batched detection (4 frames) | identical detections to per-frame (max diff 0.0); default batch 8 on CUDA, 1 on CPU | measured on a 6 s segment |

On CPU 4.1 does **not** shorten the full analysis: discovery adds ≈36 min of single-process work
before extraction is queued (it can run on other workers; on a saturated single worker the full
report arrives later than in 4.0). What it changes is that useful, confirmed moments arrive at the
start instead of the end. Decoding was found to be 80 % colour conversion (10-bit HLG → BGR); a
multi-threaded ffmpeg path is implemented but **off by default** because its conversion differs
by ~22 grey levels from the one the kit-colour model was calibrated on.

## 3. GPU hardware and cost

**Not measured — no GPU was available** (this container and the linked computer have none; no
cloud project access). Prepared and validated on CPU only:

* `Dockerfile.tracker-gpu`: the previous image did not contain the tracking engine at all; the
  new one packages `scoutx_tracker`, hash-pinned YOLOX weights and OCR models at build time.
* Persistent models per worker process (detector, OCR) and an in-memory LRU of the last two jobs'
  stage-1 detections (warm corrections); OCR runs on CUDA when present; batched detection.
* `bench/pipeline_benchmark.py`: one command on the GPU host measures discovery (time to first
  moment), one extraction segment, cold and warm resolve, hardware, and cost at a given hourly
  price. Its projection block is labelled as such.

List prices for reference (Cloud Run, instance-based): L4 $0.0001867/s + 4 vCPU/16 GiB ≈ $1.05 per
hour. Any cost per match must come from the benchmark run, not from this table.

## 4. Confirmed coverage and false attribution

**Labelled evaluation** (same harness, labels and stage-1 data as the 3.2/4.0 evaluation: 311
labelled crops, 10 target crops, 138 crops of players with another readable number; dense OCR).
"Other-number claimed" = crops of a *different* numbered player shown as the target (likely or
confirmed) — the wrong-player attribution measure.

| Run | Confirmed (s) | Likely (s) | Target claimed / confirmed (of 10) | Other-number claimed / confirmed (of 138) |
|---|---|---|---|---|
| Automatic, 4.0 | 12.5 | 233.0 | 7 / 7 | 2 / 0 |
| Automatic, 4.1 (+ discovery sightings) | 13.4 | 110.5 | 7 / 7 | 2 / 0 |
| 39 answers, 4.0 | 55.3 | 345.3 | 7 / 7 | 21 / 0 |
| 39 answers, 4.1 (+ discovery sightings) | 56.2 | 306.0 | 7 / 7 | **7** / 0 |

* Confirmed coverage rises by under a second: the sightings mostly re-confirm frames the dense
  OCR already had. **Confirmed coverage was not inflated** — it is still only what a number read
  or an owner answer supports, and no other-number crop is ever confirmed.
* The extra number evidence mainly *removes* wrong likely coverage: with answers, wrong-player
  likely crops fall from 21 to 7 of 138 (likely seconds 345 → 306). Without answers, likely time
  falls from 233 s to 110.5 s while the same target crops are kept.
* Full-match engine run (4.1 code, 24 cached parts, discovery sightings attached): automatic 7
  moments / 1 confirmed / 15.8 s confirmed; with the 39 answers 28 moments / 5 confirmed / 57.6 s
  confirmed (4.0: 6/1/14.9 s and 29/5/56.7 s). Invariant checks pass in both.
* Discovery sightings themselves: 4 moments, all visually checked as #20 (0 false).
* Honest limit: on this recording the target is confirmed for under 1 minute of 31 analysed —
  the shirt number is small and rarely readable. Better tracking cannot invent evidence that the
  footage does not contain.

OCR pre-processing (2× upscale + sharpen) read 14 instead of 10 of 71 labelled number crops,
with no extra full-number errors; re-reading the whole match with it (11,061 crops, 2,008 s) gave 9 reads of
"20" instead of 7. Its identity effect is mixed:

| Run (dense OCR) | Confirmed (s) | Likely (s) | Target claimed / confirmed | Other-number claimed / confirmed |
|---|---|---|---|---|
| Automatic, plain | 12.5 | 233.0 | 7 / 7 | 2 / 0 |
| Automatic, enhanced | 13.6 | 94.3 | 9 / 8 | **7** / 0 |
| 39 answers, plain | 55.3 | 345.3 | 7 / 7 | 21 / 0 |
| 39 answers, enhanced | 50.3 | 379.9 | 4 / 4 | 0 / 0 |

Without answers it finds more of the target but also shows more wrong players as *likely*; with
answers it removes wrong likely crops but loses target crops. Because the priority is avoiding
wrong-player attribution and the result is not consistently better, it ships **off by default**
(`SCOUTX_OCR_ENHANCE=1` enables it) until it is evaluated on more than one recording.

## 5. Manual corrections required

Without answers the full report confirms 12.5 s; discovery sightings add 4 confirmed playable
moments with zero answers. The 4.0 evaluation used 39 answers (11 yes, 28 not me) to reach 55.3 s
confirmed. In 4.1 an answer can be given on any moment while watching it; the number of answers a
typical player needs was **not measured with real users**.

## 6. Coaching from real evidence

The coach now has an **off-ball positioning** observation (`scoutx_tracker/offball.py`): on
confirmed frames only, the image-plane distance to the nearest opponent and team-mate in the
target's own body heights; share of time "free" (> 3 body heights) and "tightly marked"
(< 1), and timestamped episodes of ≥ 2 s that open as clips. The measured part (what) and the
interpretation (labelled "Interpretation (not verified)") are shown separately; distances are not
metres and the caveat says so.

**Result on the real recording: 0 coaching insights from real evidence.** The observation needs
60 s of confirmed footage; IMG_4809 has 15.8 s automatically and 57.6 s with 39 answers, so the
engine returns `insufficient` and the app shows the limitation ("I could confirm you for only …")
instead of an opinion. No ball action of the target is measured either (ball rarely trackable
near the target), so strengths/improvements remain limitations — as required, nothing is
inferred without evidence. The positioning layout was verified with unit tests on synthetic
inputs only; it has not been seen on a real match yet.

## 7. Ask PitchProof

Deterministic retrieval over the match's own evidence (no model call, no footage leaves the
system). New in 4.1: clip retrieval by time ("What happened at 32:40?" → the moments within
±30 s, nearest first, or the nearest available moment with an honest "no footage of you there"),
an off-ball question ("Was I free or tightly marked?") answered only from measured observations,
and discovery sightings included in every answer. Latency: 0.04 ms per answer, 0.17 ms to build
the review (measured in 4.0, Node; 4.1 adds one pattern and a ±30 s filter, not re-timed). Quality was checked against the recorded reports in unit tests
(refusals for km/speed/goals, correct timestamps); it has **not** been rated by users. The
multimodal "video reasoning" layer stays off: no provider is configured and private footage must
not be sent without authorisation and disclosure.

## 8. App integration and device testing

* Workspace: "Looking for #20: n of m parts scanned", "Your moments so far" with the sightings
  before any report exists, notification "first moments" when the first sighting lands.
* A report without moments no longer completes the "Discovering moments" stage.
* Every moment can be saved as a private draft clip from the player; sightings show "Shirt number
  read"; review answers work on every moment; the off-ball section appears only with evidence.
* All new strings in 7 languages (parity test). Screenshots: `docs/video/screenshots-4.1/`
  (preview renders, not device screenshots).
* **Not done**: real Firebase/Cloud Tasks execution, GPU worker integration, physical devices,
  push delivery and background behaviour on a phone, emulator rules tests (emulator download
  blocked). These remain blocked by access, not by code.

## 9. Remaining production blockers

1. **GPU benchmark.** Build `Dockerfile.tracker-gpu` on a GPU host and run
   `bench/pipeline_benchmark.py`; only then quote GPU time to first moment, full time and cost.
   Until then the 2–5 min target is unverified and the CPU full analysis (≈2.5 h estimated) is
   too slow for production.
2. **Live cloud run.** Discovery → prioritised extraction → resolve has run end to end only in
   unit tests with fakes and on the worker directly; never through real Cloud Tasks, Firestore,
   Storage and FCM. Firestore rules emulator tests are still blocked (emulator download).
3. **Devices.** No iOS/Android device testing: playback of 10-bit HEVC clips, push delivery,
   background/resume, deep links into a moment, cancellation from the phone.
4. **Evidence on this recording.** The target is confirmed for < 1 min; off-ball coaching and
   ball-action coaching are both unavailable. Higher, closer, steadier recordings — or more
   number-readable kits — are the main lever, not more code.
5. **Discovery recall.** Brief, small reads (e.g. 27:48 at 126 px, 31:42) are missed by the sparse
   pass; the dense pass keeps them. A second discovery sweep at full rate around reads is a
   possible follow-up, not measured.
6. **Colour pipeline.** Faster multi-threaded ffmpeg decoding needs the kit-colour model
   recalibrated on its HDR conversion before it can be the default.
7. **Worker artifact retention.** Job-scoped discovery crops rely on the storage lifecycle rule
   that 4.0 documented; account deletion now also removes the `tracking` subcollection.
8. **Users.** No real-user evaluation of Ask answers, the number of answers needed, or the early
   moments flow. Release gates and the flags `CV_WORKER_APPROVED`, `CV_EVENTS_VALIDATED`,
   `TRACKING_V3_ENABLED` are unchanged (all off).

## Tests run for this phase (this container)

* Worker: `pytest` — 500 passed (incl. 9 discovery/endpoint tests, 3 off-ball tests).
* App + Functions unit tests: 702 passed; `tsc` (app, tests) and ESLint clean; Functions `tsc`
  build regenerated `functions/lib`.
* Batched vs per-frame detection: identical. Full-match resolve with 4.1 engine: invariants OK.
* Not run: Firestore rules emulator, real Cloud Tasks/Firestore/Storage/FCM, GPU, devices.
