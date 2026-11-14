# Analysis experiments ledger (started 2026-11-14)

Durable record of the experiments that followed the 2026-11-13 analysis audits ("PitchProof match analysis: audit and
plan" and `.local/analysis-audit-2026-11-13.md`). Every experiment: hypothesis, frozen inputs, exact command, result,
verdict. Nothing here changes a production default, live configuration or deployment. Tracking and AI footage analysis
stay disabled for users.

## 0. Frozen inputs

| Item | Value |
|---|---|
| Baseline source | `main` = `32ab43f1f5c6274c5d7672b25fa4ac37163bbb7c` (worker and analysis code identical to release `01f9459`); run from the untouched worktree `ana` |
| Development source | branch `exp/analysis-dev-2026-11-14` (worktree `anadev`); every run uses a frozen detached worktree of an exact commit |
| Immutable GPU baseline | `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac`, untouched |
| Video | IMG_4809 10 fps proxy, file SHA-256 `b1077af3…fb679c`, video-stream SHA-256 `c0a48508…a3f66b`, 2,035.0 s, 20,350 frames, H.264 High 10, HLG/BT.2020 |
| Stage 1 | saved Linux CPU cold run (`fm/work_x0/stage1`, 7 chunks of 300 s, YOLOX-s 1280 ONNX FP32 batch 1, decoder `cv2`, keyframe every 1, discovery 416 px), hard-linked read-only into each experiment; chunk metadata copied, never shared |
| Runtime | Python 3.13.17, torch 2.14.1 (CPU), onnxruntime 1.29.0, OpenCV 4.14.0 / headless 5.0.0, docTR 1.1.0, EasyOCR 1.7.2, NumPy 2.5.3; 2 vCPU, 7 GiB, no GPU |
| Effective flags | `SCOUTX_MODE=balanced SCOUTX_DETECTOR=yolox_s SCOUTX_DECODER=cv2 SCOUTX_KEYFRAME_EVERY=1 SCOUTX_DISCOVERY_DET=416 SCOUTX_BACKEND=onnx SCOUTX_BATCH=1 SCOUTX_OCR_ENHANCE=0 PYTHONHASHSEED=0 CUDA_VISIBLE_DEVICES=` |
| Labels | `bench/results/5.1/gt_img4809_intervals.json` (developer, single annotator; 9 × 30 s intervals; T = #20, N = other orange player, ? excluded); scored on the stored basis and on the corrected basis `bench/references/gt_time_basis_corrections.json` (+0.1 s from 1,150 s) |
| Caches | every experiment starts from a fresh OCR cache unless it says it uses a named cache snapshot |

## 1. Audit claims checked

(filled below as each check completes)

| Claim (audit or brief) | Checked against | Result |
|---|---|---|
| Live configuration permits no automatic footage analysis | `docs/release/live-config-snapshot-2026-11-13.json`; `functions/src/analysis/cvApproval.generated.ts` | **Confirmed.** No deployed function has `CV_WORKER_URL`, `CV_WORKER_APPROVED`, `AI_FOOTAGE_PROCESSING_APPROVED` or `VIDEO_REASONING_ENABLED`; `APPROVED_CV_WORKER = null` is compiled in; `OPENROUTER_API_KEY` is bound but footage analysis refuses without the approval flag. Snapshot is from 2026-11-13 12:36 UTC, before the 2026-11-13 merges; nothing was deployed after it except the earlier recorded backend deploys |
| Recording, frames | E0 input record | **Confirmed.** 2,035.0 s, 20,350 frames, 10 fps, HLG |
| "28 of 31 with one owner tap" | `bench/results/5.3/fresh_png_claim_outcomes_5.3b_20261030.json`, 5.3 report | **Corrected.** 28/31 is an archived-feature replay. The fresh end-to-end rerun of the same window with the same recorded tap: **4 correct, 27 abstained, 0 wrong** of 31 (JPEG and PNG crops alike). Not a product expectation |
| Stage timings, overlap | L4 and CPU full-match JSONs; `extract.py` | **Confirmed with nuance.** Per chunk the stage timers add up to the measured wall time (L4 1,051 s measured vs 1,043 s summed), so they do not overlap in the accounting; on a GPU host decoding runs in a 4-frame prefetch thread, and its timer measures the wait |
| Repeated video passes | `discovery.py`, benchmark | **Confirmed.** Discovery decodes the whole recording separately (sparse 2 fps samples at 416/640 px) before stage 1 decodes every frame; resolve re-reads saved crops |
| Silent OCR fallback | `ocr.py` | **Confirmed and fixed** (E1) |
| Owner-anchor mapping | `identity.locate` | **Two defects found and fixed** (E3a): nearest-centre choice between overlapping players, and anchor/evidence-time misalignment |
| OCR input | `ocr.py` | **Confirmed.** The production reader feeds PARSeq/EasyOCR inverted binary masks; colour torso regions are used only for a weak verification score. A colour open-set reader was already measured and rejected in 5.2 (3 of 15 daylight reads wrong) |
| Model lifecycle (`google/gemini-2.5-flash`) | Gemini API deprecations page and pricing (ai.google.dev, 2026-11-14), Vertex AI model versions page | **Corrected.** Retired on Vertex AI on 2026-10-20, but **not deprecated on the Gemini API** ("will continue to be served until further notice"); the configured route is OpenRouter → Google AI Studio. No forced migration |
| EU residency | Vertex AI data-residency page; OpenRouter in-region routing page | Vertex AI regional endpoints keep data at rest and ML processing in the jurisdiction; global endpoints give no guarantee; the page does not cover logging, abuse monitoring or caching. OpenRouter EU routing (`eu.openrouter.ai`, Business plan) processes prompts in the EU/EEA/UK/CH but keeps account, billing, security and abuse metadata possibly in the US, and does not offer `gemini-2.5-flash`. The current route (`openrouter.ai`, ZDR + `data_collection: deny`) has no EU processing commitment |

## 2. E0: release baseline on the full match (automatic identity)

Hypothesis: the saved stage 1 plus release resolve reproduces the recorded Linux CPU result. Command:
`exp1114/e0_base/run.sh` = `bench/full_match_benchmark.py` from the untouched `ana` worktree (`32ab43f`) with the effective
flags above, `--work-dir` = hard-linked stage 1, reused discovery, **fresh OCR cache**. Exit 0. Timing is not a full
measurement (checkpoints reused; 1,633 s wall on a contended 2 vCPU host, of which identity 1,163 s).

| Measure (504 target-labelled frames) | Stored label basis | Corrected basis (+0.1 s from 1,150 s) |
|---|---|---|
| Correct claims | 253 | 266 |
| Abstained | 235 | 236 |
| Unmatched claims (no labelled box at IoU ≥ 0.5) | 14 | 1 |
| Wrong-player claims (LIKELY) | 2 | 1 |
| Wrong identity, all labelled frames | 1.1 s (1,301.6–1,305.7 s, LIKELY, no CONFIRMED) | — |
| Claimed recall / IDF1 | 0.502 / 0.659 | — |

Full recording: confirmed visible **4.2 s**, likely visible 41.1 s, ambiguous **1,553.9 s**; 4 moments, all LIKELY; no
labelled frame of any moment shows another player. The result equals the recorded `fm/x0` run exactly (same accuracy
fields). The 1,301–1,305 s wrong-player LIKELY claims are the known appearance-only exchange (`wrong-player-exchange-2026-11-02.md`,
candidate D), not new. Reproducibility: the same stage 1 with a copy of E0's final OCR cache gives the identical
timeline (SHA-256 `fad444c1…`) from the release and from the candidate source (E3 rel0/cand0).

## 3. E1: OCR device placement (candidate `0b09903`)

Hypothesis: a CUDA host can run OCR on the CPU without anyone knowing. Confirmed in code (`self.parseq.cuda()` inside a bare
`except: pass`). Change: `NumberReader.device_report` records the device of PARSeq and EasyOCR and each fallback reason,
logs it, and `SCOUTX_REQUIRE_GPU_OCR=1` refuses; the full-match benchmark writes `ocrDevices` and `--require-gpu` refuses
a degraded OCR. Reads and identity unchanged (CPU host: report `cpu/cpu`, no degradation). Tests: `test_ocr_device_report.py`
(6). **Verdict: keep; ready for a separately reviewed promotion proposal** (observability only). Not verified on a real
CUDA host (no GPU in this workspace).

## 4. E3a: owner-answer resolution (candidates `3f305f2`, `81614af`, `adb3111`, app/server `cd02e15`)

Defects found in `identity.locate` (release):
1. When several players' boxes contained an answered point, the nearest box centre won silently: a tap in a duel could
   anchor a team-mate.
2. Evidence times were paired with anchors by `zip(anchors, locate(...))` over a list that drops unresolved anchors, so
   one unresolved answer moved every later answer's time onto another tracklet.

Changes, in order, each with tests (`tests/test_anchor_resolution.py`, 7):
- `3f305f2`: per-point resolution; a point inside two players' boxes is ambiguous and not applied; evidence times paired
  per point and never added for an excluded tracklet; `anchorResolution` in the report.
- `81614af`: a point clearly at one player's centre (≤ half the distance of the next) still resolves, so a review
  answer (which points at the centre of the asked box) is not dropped in a duel.
- `adb3111`: boxes in the answered frame decide before boxes up to 0.35 s away. **Found by E3:** a perfect, label-placed
  tap at 237.6 s was refused as "2 players" because the previous tracklet's last box (237.3 s, tid 613) and the answered
  frame's box (237.6 s, tid 620) both contained it.
- `cd02e15`: the worker returns target-only outcomes (`applied | ambiguous | no_player | excluded`, no tracklet ids) in
  the tracking response, the server parses them as `unresolvedAnswers` (bounded, sorted), and the review deck asks the
  owner to answer another moment. Strings in 7 languages need native review. Unit test `trackingUnresolvedAnswers.test.ts`.

Without anchors every candidate gives the release timeline bit for bit (E3 rel0 = cand0, SHA-256 `fad444c1…`).

## 4b. E3: simulated owner taps on the full match (in progress)

Design (`bench/anchor_replay.py`): resolve the same stage 1 with a private copy of the same OCR cache snapshot (E0's
final cache, SHA-256 `3c94daf5…`), adding "this is me" taps placed on the labelled target box (centre x, 35 % of the
height) in the first labelled target frame of an interval whose target box overlaps no other labelled box and is at
least 80 px tall. Only intervals 0, 3, 4 and 8 have target frames (68 / 288 / 94 / 54 of the 504), and each has one
such frame (237.6, 1,151.0, 1,299.7, 1,899.8 s). Simulated taps are perfect answers by construction.

**Tooling error found and fixed:** the first "release" tap runs (`rel0`, `rel_t4`, `rel_t1`) actually ran the candidate
resolve, because `audit_claim_outcomes` puts its own tree first on `sys.path`. They are invalid as release controls.
`0b1f4ac` imports the resolve from `--source` first and refuses otherwise. The no-tap equivalence still stands: the genuine
release run E0 (`full_match_benchmark.py` from `ana`) and the candidate `cand0` give the same timeline `fad444c1…`.

| Run (corrected basis, 504 target frames) | Taps applied | Correct | Abstained | Unmatched | Wrong player | CONFIRMED wrong | Confirmed / likely visible (whole match) |
|---|---|---|---|---|---|---|---|
| No taps (E0 = cand0) | 0 | 266 | 236 | 1 | 1 (11 frames over all labels) | 0 | 4.2 s / 41.1 s |
| 1 tap, strict guard (`3f305f2`) | 0 of 1 ("2 players") | 266 | 236 | 1 | 1 | 0 | 4.2 s / 41.1 s |
| 4 taps, strict guard | 1 of 4 | 404 | 99 | 1 | 0 (3 frames over all labels) | 0 | 12.0 s / 161.0 s |
| 1 tap, frame-first (`adb3111`) | 1 of 1 | 314 | 189 | 1 | 0 (0 over all labels) | 0 | 4.3 s / 88.5 s |
| 4 taps, frame-first | 4 of 4 | 251 | 233 | 3 | **17** | **1.7 s** | 17.7 s / 146.9 s |

Untapped intervals (only measurable with one tap): 241 → 248 correct, 193 → 187 abstained, 1 → 0 wrong.

**Safety finding (pre-existing behaviour, release confirmation pending):** with all four perfect taps applied, the tap
at 1,151.0 s resolved to the right detection (tracker track 2947, box IoU 0.94 with the labelled target), but that
track jumps at 1,151.1 s by 0.92 box heights after camera compensation (warp quality 0.99) onto a team-mate. Anchor
evidence covers the whole tracklet piece, so 1,151.1–1,153.5 s became **CONFIRMED_VISIBLE on another player** (17
labelled frames, IoU 0.72–0.96 with N boxes). A correct owner answer must not do that. The strict guard hid the
problem only by refusing the tap. Candidate `0bae8d7` (`SCOUTX_TELEPORT_SPLIT=1`, off by default) cuts a track at a
camera-compensated jump of more than 0.8 box heights (357 of 262,512 adjacent-frame steps exceed 0.7 heights, 71
exceed 1.0). Runs queued: release with 4 taps (`rel_t4v`), the teleport split with 4 taps and with none.

## 5. E4: stage-1 CPU work (candidate `e092fc3`; rejected variant)

Profile (`bench/camera_state_profile.py`, 600 frames at 900–960 s, 2 vCPU, nothing else running): decode 55.0 ms/frame
(HLG 10-bit via OpenCV), thumbnail + grass 4.22 ms, scene cut 0.09 ms, camera motion 8.63 ms per frame.

| Change | Result | Verdict |
|---|---|---|
| Resize each frame to the 160×90 thumbnail once for grass and scene cut (`e092fc3`) | 4.22 → 2.08 ms/frame; grass, cuts, warps bit-identical on 600 frames; a 30 s stage-1 extraction (900–930 s) from release and candidate gives identical `detections.npz` arrays and identical crops (scene_cmc timer 5.38 → 4.78 s) | **Keep** (exact; about 2 ms × 20,350 frames ≈ 43 CPU-s per match on this host) |
| Camera motion at 480 or 320 px instead of 640 | 9.5 → 7.2 / 5.3 ms/frame; corner deviation vs 640: median 0.27–0.41 px but p95 2.9–3.5 px, max 15–27 px, 5–9 % of frames over 2 px (900 s and 1,300 s windows) | **Rejected for now**: not equivalent; panorama chains accumulate these errors and feed motion continuity. Would need a full identity replay on a re-extracted stage 1 |
| Shared decode between discovery and stage 1; hardware decoding | Not implemented: discovery samples 2 fps at 416/640 px for an early result; sharing needs a pipeline reorder, and NVDEC changes decoded pixels (the 2026-11-01 audit already traced CPU result divergence to decoding) | **Needs a GPU session**; not measurable here |

On this CPU host decoding (55 ms/frame) and detection (~300 ms/frame) dominate; the camera-state block is ~13 ms/frame.
The L4 profile differs (detection 13 ms/frame, camera motion 17 ms/frame) and only a GPU session can measure GPU-side changes.

## 6. E5: coaching on the real full-match report

`bench/coach_eval.ts` runs the real server parser and the app's deterministic coach on the E0 report. Result: **no
strengths or improvements, three limitations** (positioning, identity, physical): confirmed footage is 4.2 s, below the
120 s minimum, and no ball contact has confirmed identity. The four LIKELY moments cover 157 labelled frames: 153 on the
target, 3 unsure, 1 unmatched, 0 on another player. The coach therefore fails honestly here; useful coaching on this recording is blocked by
identity coverage, not by the coaching text. The model-based clip explanation (`trackingReasoning.ts`) requires
`VIDEO_REASONING_ENABLED`, the footage approval, AI consent and video consent, all off; it was not exercised.

## 8. E2: jersey reading on colour regions (candidates `97a3463`, `3251e78`; off by default)

Hypothesis: reading the colour torso/shorts regions with the production two-recogniser acceptance rule finds target
numbers the binarised reader misses, without reading the target's number on team-mates. Offline, on every saved crop
whose detection matches a labelled box (IoU ≥ 0.5, corrected label times): 1,466 crops = 245 target crops in 19 target
pieces and 1,221 crops of other orange players in 118 pieces (`bench/ocr_crop_eval.py`, frozen worktree `97a3463`,
output `exp1114/e2_ocr/ocr_eval_full.json`; recognition on correctly associated crops only).

| Reader | Target crops read "20" | Target crops read another number | Team-mate crops read "20" | Team-mate crops read another number | Target pieces with a "20" | CPU s (1,466 crops, contended) |
|---|---|---|---|---|---|---|
| Production (binarised masks) | 5 | 28 (all lone digits: "1" 16, "7" 5, "4" 5, "2" 1, "5" 1) | **0** | 97 ("17" 46, "1" 26, …) | 3 of 19 | 3,643 |
| Colour regions, same acceptance rule | 8 | **0** | **0** | 21 ("17" 12, "7" 4, …) | 4 of 19 | 5,405 |
| Combined (production first, colour if it abstains, abstain on conflict) | **10** | 27 (lone digits, from production) | **0** | 111 | **5 of 19** | both |

Reading the result honestly: the identity resolver already ignores lone digits (`incompatible_with_target` and
`number_votes` count only reads with as many digits as the target), so the production reader's 28 lone-digit reads on
the target do not exclude it. The relevant gain is two-digit evidence: target crops with a "20" go from 5 to 10 and
target pieces from 3 to 5 of 19, with no "20" on any of 1,221 team-mate crops. Only two crops were read "20" by both
readers; the colour reader's reads come from `torso1` (7) and `torso0` (1). Small sample, one recording, developer
labels: this supports an end-to-end test, not promotion. Rejected earlier variant for context: the 5.2 open-set
colour reader (no two-recogniser agreement) read 3 of 15 daylight crops wrongly.

Cost: the colour reader roughly doubles OCR CPU time per crop it runs on; in the pipeline it would run only on crops
the resolve already selects.

End-to-end test (E2b): `bench/ocr_cache_variant.py` derives the combined reader's cache from the same OCR cache
snapshot as E3, then the resolve runs with `SCOUTX_OCR_VARIANT=combined` (separate cache file).

## 9. Blocked work and exact requests

| Work | Blocker | What is needed (request) |
|---|---|---|
| GPU correctness and speed (CUDA FP32 baseline, batch, FP16, ONNX CUDA, decoder/NVDEC, discovery/stage-1 shared decode) | No GPU here; no current approval (the 2026-11-09 envelope was for commits `84fefc5`/`51d41c9`, one session, USD 8, and was never run; later approvals exclude GPU VMs) | **GPU-1**: one L4 session, `g2-standard-8`, zones europe-west4-b/c/a then europe-west1-b/c, max lifetime 300 min, max 1 VM, cost ceiling USD 8 before tax (estimate, not a billing cap), IMG_4809 proxy only, exact commits: Part A `51d41c9…` (immutable FP32 matrix), Part B the candidate tip named in the handoff. Output: numeric exports only; cleanup verified |
| Local vision-language second reader | Hugging Face API and weights blocked by the network allowlist (proxy); no GPU; 3 GB free disk; 7 GiB RAM | **VLM-1**: allowlist `huggingface.co` read-only for the official model card and weights of the chosen checkpoint (license check first), or run the experiment on the GPU session with the weights staged by the owner. Not started |
| Coaching model benchmark (groundedness, criticism, drills, schema, latency, cost) | OpenRouter key is a production secret this workspace must not read; any call is billed; footage must not be sent | **COACH-1**: a separate test key with a USD 2 cap, text-only evidence packets built from validated reports (no frames), candidates `google/gemini-2.5-flash` (current), `google/gemini-3.1-flash-lite`, `google/gemini-3.5-flash-lite`; or the owner runs `bench/` packets locally |
| Independent validation | Only one labelled recording (developer, single annotator); IMG_4529 / IMG_5105 replays exist but are unlabelled | **LABEL-1**: a second annotator labels the existing 9 IMG_4809 intervals blind, and target frames in at least two consented recordings that no experiment has used |
| Learned body re-identification | Policy: identity uses jersey number, kit colour and owner confirmation only; the release gate checks it | **LEGAL-1**: counsel decision before any body re-ID experiment on real footage |
| EU processing of coaching requests | Current route `openrouter.ai` has no EU processing commitment; OpenRouter EU routing does not offer `gemini-2.5-flash`; Vertex AI regional endpoints commit ML processing to the jurisdiction but not logging/abuse monitoring | **PRIV-1**: privacy review deciding route (Vertex AI `europe-west*` regional endpoint vs OpenRouter EU) before `AI_FOOTAGE_PROCESSING_APPROVED` |

## 7. Cost model (candidate `07b3997`; estimates, not billing)

`bench/cost_model.py` + `bench/gcp/cost_model_prices_20261114.json`. It refuses runs whose timing reused checkpoints (so
none of today's CPU replays can be costed), keeps measured duration, sourced list prices (Cloud Run page and GPU page
re-read 2026-11-14; Compute Engine SKU snapshot 2026-10-29; Gemini API paid pricing 2026-11-14) and scenario
assumptions apart. The only complete GPU measurement is the 2026-10-29 L4 run (1,853.86 s, 34-min recording, release
commit `3b8f3bb` image, FP16 batch 8, OCR device not recorded). Default assumptions (not measured): 60 s container start,
15 s model load, 5 s shutdown, 120 s VM boot, 5 % failed attempts, 8 vCPU / 32 GiB, 6,000 + 2,000 LLM tokens, 7 days of
storage, cross-region transfer price unknown and excluded.

| Scenario | Cloud Run L4 per valid analysis | Queued VM per valid analysis |
|---|---|---|
| Non-zonal, scale to zero | **$0.82** (1,934 billed instance-s) | $0.57 (excludes idle VM time between jobs) |
| Zonal redundancy (Cloud Run default) | $1.03 | — |
| One warm minimum instance, 200 jobs/month | $5.13 (idle share dominates) | — |

LLM text for one report: under $0.01. Per claimed visible minute on that L4 run (150.0 s claimed, of which 23.3 s
confirmed): about $0.33 per claimed minute and $2.11 per confirmed minute (Cloud Run non-zonal). "Correctly attributed"
minutes are not measurable on the full recording: only 50.4 s of target time is labelled. A warm instance only pays
off at sustained volume; at the current zero traffic, scale-to-zero is the cheaper and the only defensible choice. All
figures move with the unmeasured start/load times; a GPU-1 session should measure them.
