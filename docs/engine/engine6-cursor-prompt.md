# Cursor prompt: PitchProof analysis engine — faster, cheaper, still honest

Paste everything below the line into Cursor (Agent mode, strongest model), with the ScoutX repo open.
Prepared 2026-11-25 from an audit of `main` at `fed4ac7a5c7fea3c79c303a88614b36d9b6d8e26`.

---

## 0. Role and the one rule that judges everything

You are the principal engineer of the PitchProof football-cv engine (`workers/football-cv/scoutx_tracker/`) and its
orchestration (`functions/src/analysis/`). The product follows **one user-nominated player** through **one
recording**. It emits only what the evidence contract allows: full jersey number (never a lone digit), kit, match-scoped
appearance, camera-compensated motion, explicit owner answers, and metres only on calibrated frames. Off-camera and
dead-ball time stay explicit gaps.

**A change is an improvement only if it raises claimed-correct seconds per compute dollar on the same decoded pixels
and passes `bench/gates/balanced_5.2.json` (and `bench/gates/coverage_floor.json`) against the CPU FP32 reference.**
Faster but wrong is a failed engine. Accurate but unaffordable is also a failure, so measure cost every time.

Do your own research (section 6) before choosing any dependency or architecture. Do not trust this prompt's claims
without checking them in the repo. Some are marked "unverified" on purpose.

## 1. Non-negotiables (already decided in this repo)

- **Licences.** Stay on in-repo YOLOX (Apache-2.0), ONNX Runtime, docTR PARSeq, EasyOCR and OpenCV unless a written
  licence check is committed first. No Ultralytics (AGPL). No SoccerNet `sn-gamestate` code (GPL-3.0). No
  torchreid Market/Duke weights, and no dataset or weights whose licence is research-only. Papers may inform design;
  their code and weights may not be vendored without that check.
- **Privacy (LEGAL-1).** No face recognition, no gait template, no cross-match or cross-user embedding gallery.
  Appearance is fitted per match from confirmed positives and hard negatives. `GALLERY_SELF_TRAINING` stays off.
  Owner footage, crops and frames never go into git, public storage or third-party APIs.
- **Evidence.** A conflicting full number vetoes. Lone digits are never evidence. Confirmation spreads at most ±4 s,
  never past a contrary read and never across a team-mate contact. Similarity scores are not probabilities.
- **Metrics.** Never interpolate a player who is absent, off-camera or in a replay into distance or speed. Never
  publish uncalibrated pinhole speeds as calibrated.
- **Flags and gates.** Do not enable `TRACKING_V3_ENABLED`, `CV_WORKER_APPROVED`, event validation, or any
  experimental `SCOUTX_*` flag in production. Do not edit `balanced_5.2.json` or `coverage_floor.json` to make
  something pass. Every new behaviour ships default-off, with its own env flag and tests.
- **Cloud and money.** Do not create cloud resources, link billing, deploy, or start GPU instances yourself. Write
  the runbook and stop; the owner approves each billed session and its exact scope (see
  `docs/release/cpu8-regate-runbook-2026-11-22.md` for the pattern, including deleting buckets with soft delete
  off).
- **Honesty in reports.** Every number names its source file, input, hardware and whether it was measured,
  replayed or extrapolated. Never describe a window result, an interval score or an extrapolation as a full-match
  result.
- **Existing work.** Do not overwrite uncommitted user work, revert commits, or re-implement something that
  exists behind a flag. Read it, measure it and extend it.

## 2. Phase 0: audit before any change (deliver as `docs/engine/engine6-audit.md`)

Establish the actual state: branch, HEAD, uncommitted changes, worktrees. Read at least:
`docs/video/flagship-overhaul-progress.md`, `flagship-architecture.md`, `pre-pilot-decision-2026-11-18.md`,
`speed-cost-2026-11-21.md`, `build-plan-2026-11-21.md`, `analysis-experiments-2026-11-14.md` (ledger),
`intelligence-5.3-gpu-benchmark-report.md`, `wrong-player-exchange-2026-11-02.md`,
`docs/release/cpu-production-plan-2026-11-21.md`, `cpu8-regate-runbook-2026-11-22.md`, and
`bench/results/cpu8-cloudrun-20261122/README.md`. Then the code in `scoutx_tracker/`, `bench/`, `eval/`,
`app/`, `functions/src/analysis/trackingOrchestrator.ts`, `trackingProgress.ts` and `trackingDeadlines.ts`.

For every capability, classify it as default-on / flagged-off / tried-and-rejected (with the ledger reason) /
missing. Confirm or correct these starting facts:

**Verified on `fed4ac7` (re-check them):**

| Fact | Source |
|---|---|
| The only passing configuration is the CPU FP32 reference: 2,035 s IMG_4809 proxy, claimed recall 0.621, IDF1 0.766, confirmed-correct 10.5 s, 0 wrong-identity s. The 8-vCPU Cloud Run job re-gate passed `balanced_5.2` with exit 0 in 6,628 s | `bench/results/cpu8-cloudrun-20261122/` |
| Where that 6,628 s went: discovery 1,035 s (OCR 499, detect 270, decode 72). Extraction 4,898 s for 7 × 300 s chunks (**detect 3,879 s = 79 %**, decode 547, scene/CMC 257, colour 139). Resolve 611 s (numbers/OCR 358, identity 190, tracklets 59) | same `full_match.json` |
| Extraction runs the 1,280 px detector on every frame by default (`SCOUTX_KEYFRAME_EVERY=1`). Keyframe stride 2 was tried and refused as accuracy-invalid | `extract.py`, ledger |
| Discovery (416 px detector + OCR) and extraction (1,280 px) **open and decode the file separately** | `discovery.py`, `extract.py` |
| The L4 FP16 batch-8 candidate failed the relative gate (claimed recall 0.494 vs 0.621, IDF1 0.661 vs 0.766). A same-image FP32-then-FP16 GPU pair has never been measured | 5.3 GPU report |
| Static INT8 detector (offline only): 2.3–2.6× faster detect on CPU, 2.5× faster stage 1, but not equivalent (97–99 % box agreement, −4 % OCR crops at night). Reported as `yolox_s@1280/onnx-int8`. Never gated | `speed-cost-2026-11-21.md` |
| Production planner: discovery in 600 s chunks; extraction in a 120 s first segment, then 300 s segments (growing to 900 s only above ~5 h). Every task has a 1,800 s function timeout and a 1,680 s worker client (`trackingDeadlines.ts`). Phases run in series. Dispatch concurrency is 6 (4 for resolve) | `trackingProgress.ts`, `trackingOrchestrator.ts` |
| The full-match replay used by F6, F17 and the other full-match identity tests is **gone**. 18 of its 19 hashed files are unrecoverable; only `original_timeline.npz` survives (in git) | `replay_recovery_manifest.json`, progress doc |
| Upload limit is 150 min. A 140-min file was never analysed. Its 7 h 36 min runtime and ~$7 cost are straight-line extrapolations, not measurements | `mode.ts`, owner notes |

**Unverified (prove or drop):**
- Candidate metrics "claimed recall 0.706, IDF1 0.825, precision 0.992, confirmed-correct 10.7 s, wrong 0.3 s".
  They are not in the committed progress doc, which says no full-match candidate has been run. Find their source
  run, or treat them as window-only.
- `identity-judgments.json` absent and "Phase 18 paused": confirm, and respect that pause.
- **What production actually decodes.** All benchmarks used a 10 fps H.264 proxy made offline on the owner PC.
  Check whether production feeds the worker the original upload (often 1080p/4K, 30–60 fps, 10-bit HLG HEVC). If
  so, every frame of it must be decoded even when only 10 fps are analysed, and the measured decode cost does not
  apply. This may be the largest unmeasured cost in the product.

## 3. Phase 1: rebuild a full-match evaluation baseline (blocks everything else)

Without a full-match replay, no identity change can be judged on a whole match.

1. Run a fresh stage-1 extraction of the IMG_4809 proxy (SHA-256 `b1077af3…`, in the owner's authorised folder)
   in the **pinned reference environment** (`Dockerfile.tracker-gpu` lock `7a7dfa96…`, CUDA unavailable, CPU EP,
   batch 1, cv2 decoder, 7 × 300 s chunks). Use the owner's machine or an owner-approved job.
2. Build a **new** replay with `bench/full_match_replay.py build`. Name it `fmr-v2-<date>` and commit only its
   provenance (no footage, no crops). Never call it the original 2026-11-03 replay.
3. Prove it reproduces the gate-passing CPU reference claims (`compare_runs.py` exit 0 vs
   `bench/results/cpu8-cloudrun-20261122/full_match.json`) before using it as a baseline.
4. Re-point the opt-in tests (`tests/test_full_match_identity.py`) to v2. Re-derive F6 and F17 on v2, keep
   their expected outcomes honest, and document every expectation that changed and why.
5. Label a second, independent match (LABEL-1) with `docs/video/full-match-validation.md` (sealed ground truth,
   5 s sampling). Until it exists, every "full-match" claim is about one recording.

## 4. Phase 2: speed and cost workstreams, in priority order

Change one variable per experiment. Record decoded-frame hashes (the `precision_diagnostics` pattern). Gate every
candidate with `compare_runs.py --gate bench/gates/balanced_5.2.json` against the CPU FP32 reference on the same
pixels. Report claimed-correct seconds per dollar.

**W1. Make the production input match the evaluated input.**
- Measure decode of a real upload (1080p/4K, 50–60 fps, HLG/HEVC) at the 10 fps analysis rate.
- If it dominates, make **one** server-side decode to the exact pinned 10 fps working format:
  - frame-accurate;
  - fixed colour pipeline (HLG → working BT.709, `colour.py`);
  - hashed;
  - reused by every stage.
- Validate that its pixels equal the reference decode's, or gate the difference. Do not mix decoders (the
  BT.601/BT.709/HLG paths changed OCR from "20" to "11" before).

**W2. Decode once, share it.** Discovery and extraction both open the file. Share decoded frames (or run the
1,280 px pass and derive the 416 px discovery input from it) without changing pixels. Measure the saving on the
device you will ship.

**W3. Skip what is not football.**
- A 140-min upload with a 90-min match has about 35 % non-match time. Use the existing period logic and owner
  period answers (`periods.py`) to skip detection and OCR on pre-match, half-time and post-match, after a cheap scan.
- Skipped time must be recorded as a gap, never as "target not seen".
- Prove that the skip loses no labelled target time.

**W4. GPU parity, then GPU speed.** In the same image and on the same decoded pixels, run in order:
cpu-onnx → gpu-fp32-b1 → gpu-fp32-b8 → gpu-fp16-b8 → ORT TensorRT EP FP16 with engine cache
(`trt_fp16_enable`, `trt_engine_cache_enable`).
- Each step must pass `balanced_5.2` against the previous passing step and the CPU reference.
- The first failing step is the boundary: stop and report there.
- Detect on CPU costs ~190 ms/frame. The recorded L4 run detected at ~13 ms/frame, so parity is the biggest
  single lever. Note that Cloud Run GPU jobs are offered in specific regions only. Check whether `europe-west6`
  (Zurich) has them. If it doesn't, data residency is an owner decision.

**W5. Spend detector FLOPs where identity evidence can appear (adaptive compute), behind a flag.**
- Keyframe detection plus the existing optical-flow propagation inside a shot.
- Forced detection on scene cut, low CMC quality (< 0.7), crossings or overlaps with a same-kit player, box height
  collapse, or the target lost.
- At least one full-frame detection per second, so a second same-kit shirt can never enter unseen.
- Study how DeepStream's `nvinfer` `interval` is paired with a tracker that predicts boxes on skipped frames.
  Reimplement the idea, do not import DeepStream.
- Stride 2 everywhere already failed. This must be a policy with its own A/B on v2 plus the held-out windows.

**W6. Read numbers only where they can be read.**
- Gate OCR with legibility (`legibility.py`, box ≥ ~120 px, torso visible).
- Stop re-reading a tracklet once its number is settled.
- Batch PARSeq and EasyOCR on GPU.
- OCR is about 860 s of the 6,628 s run (discovery plus resolve).
- The E9 synthetic fine-tune kit (`bench/e9/`) is ready for a GPU session. It is kept only by its predeclared
  rule: zero team-mate "20" reads.

**W7. Fit the production clocks.**
- Resolve on 34 min took 611 s. A straight-line 90-min estimate is ~1,620 s, inside the 1,680 s client by about a
  minute. 140 min (~42 min) does not fit any Cloud Tasks handler.
- Design resolve for long matches: a Cloud Run job (up to 168 h on CPU), incremental resolve, or a faster resolve.
- Reconcile the benchmark layout (7 × 300 s chunks in series) with the production planner (120 s first segment,
  parallel segments). A layout difference is a configuration difference: gate it.

**W8. CPU fallback cost.** INT8 static quantisation of the detector body stays offline. Gate it on v2 and keep the
`onnx-int8` label. Thread scaling: 2 → 8 vCPU gave only 1.54× (23,174 vs 60,224 vCPU-s), so smaller instances in
parallel may cost less. Measure, don't assume.

**W9. Telemetry and cost model.** Add per-stage seconds, decode and frame counts, and instance type to every run
report. Add `$ per analysed match-minute` from list prices (Cloud Run instance-based billing, region-specific;
quote the date). Keep the "estimate, not an invoice" label.

## 5. Targets (goals to validate, never promises)

| Stage | Target | Status today |
|---|---|---|
| V1 | 34-min proxy, end to end **≤ 30 min** on one L4 job, gate passing | 6,628 s on 8 vCPU CPU (only gate-passing run) |
| V2 | 140-min upload containing a 90-min match, **≤ 60 min** end to end, **≤ $1** compute, gate passing on v2 plus a 2nd labelled match | never run |
| Stretch | 10–20 min end to end, $0.25–0.50 | requires about 23–46× over today's extrapolation |

Arithmetic to check: an L4 Cloud Run instance with 8 vCPU / 32 GiB is about $0.0004/s at list price, so 15 min ≈
$0.36. The same work on 8 vCPU CPU at today's speed is about $1.20 per 34 min. Cost falls mostly by making the GPU
path pass the gate and by not processing non-football time. A recall target such as "≥ 95 %" is meaningless until
measured on full-match labels. Report claimed recall, confirmed-correct seconds, wrong-identity seconds, IDF1 and
state agreement, and never mix window and full-match numbers.

## 6. Research you must do yourself (cite each source in the audit)

Verify licence, maintenance and fit before using anything:
- **Association:** ByteTrack and OC-SORT (MIT); `roboflow/trackers` (Apache-2.0, clean-room SORT/ByteTrack/OC-SORT/
  BoT-SORT/C-BIoU, with published SoccerNet and SportsMOT HOTA); Deep-EIoU (expansion IoU is usable; its re-ID part
  is not, under LEGAL-1).
- **Detectors:** YOLOX (current); RF-DETR (Apache-2.0 for Nano–Large only; XL/2XL use a different licence); RT-DETR
  (Apache-2.0). Small far players are the gap; tiled SAHI was rejected because it inflates far same-kit players.
- **Jersey numbers:** Koshkina & Elder (legibility filter → pose-guided torso → PARSeq → tracklet vote);
  synthetic-data pretraining (Bhargavi et al., arXiv 2203.00734); SoccerNet jersey task (dataset licence:
  research-only).
- **Acceleration:** ONNX Runtime performance and TensorRT EP docs (FP16, engine cache, subgraph fallback); NVDEC/
  FFmpeg CUDA decode, with the colour path pinned; DeepStream `interval` and tracker semantics.
- **Game state and calibration (class B/C cameras only):** SoccerNet GSR, PnLCalib, TVCalib. The touchline-phone
  class (IMG_4809) stays "metrics unavailable" (0 % usable landmarks).
- **Products:**
  - Veo Player Spotlight: number-based individual clips, the player chooses what is public.
  - Trace PlayerFocus: parent subscriptions.
  - SkillCorner: single-camera tracking at 10 fps. Its off-screen extrapolation conflicts with our rules; don't
    copy it.
  - Hudl/Wyscout: analyse once, reuse.
- **Games:**
  - Football Manager: unscouted attributes shown as ranges that narrow with more scouting. Map this to stats that
    narrow with confirmed minutes.
  - EA FC: player cards may show only measured values.

## 7. Working method and stop conditions

- **Order:** audit → v2 baseline → W1 → W2/W3 → W4 → W5/W6 → W7 → W8/W9. Commit per workstream on its own branch,
  with tests. Keep the whole worker suite and `npm run typecheck/lint/test:unit` green.
- **Every PR states:** hypothesis, the single variable changed, input hashes, hardware, before/after per-stage
  seconds, the `compare_runs.py` exit code and gate table, and $ per match-minute.
- **Stop and report**
  - when a gate fails (do not tune the gate);
  - when a step needs footage you don't have, a cloud resource, billing, a licence decision or a second labelled
    match;
  - when a result can only be extrapolated.
- **First deliverable:** `docs/engine/engine6-audit.md` plus a plan with effort estimates. Then wait for the owner's
  go-ahead before Phase 1.
