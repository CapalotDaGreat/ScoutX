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
exceed 1.0).

| Run (valid sources) | Taps applied | Correct | Abstained | Unmatched | Wrong player (all labels) | CONFIRMED wrong | Confirmed / likely visible |
|---|---|---|---|---|---|---|---|
| **Release** `32ab43f`, 4 taps (`rel_t4v`; resolve file verified from `ana`) | 4 (nearest centre) | 250 | 234 | 3 | **17** (17) | **1.7 s** (1,151.2–1,153.5) | 17.7 / 160.8 s |
| Teleport split `0bae8d7`, 4 taps (`tp_t4`) | 4 | **421** | 82 | 1 | **0** (0) | **0** | 15.5 / 188.3 s |
| Teleport split, no taps (`tp_0`) | 0 | 266 | 236 | 1 | 1 (11, the known 1,301–1,305 s LIKELY exchange) | 0 | 4.2 / 40.9 s |

So the CONFIRMED wrong-player claims are a **release defect** a correct owner answer can trigger, not a regression of
these candidates. With the teleport split the same four taps give 421 correct and no wrong frames. Without taps the
split leaves every labelled outcome unchanged; across the whole match it changes 368 unlabelled frames between
UNKNOWN and AMBIGUOUS, removes 6 LIKELY frames (1,379–1,380 s) and adds 4 LIKELY frames (1,881.3–1,883.6 s, unlabelled,
need review). Tap results above are in-sample (every interval with target labels received a tap); leave-one-out runs
(taps in three intervals, score the fourth) follow.

**Leave-one-out, teleport split on (`tp_loo_*`, all 3 taps applied in every run), scored only on the interval that got
no tap:**

| Left-out interval (target frames) | Correct | Abstained | Unmatched | Wrong player on labelled frames | CONFIRMED wrong |
|---|---|---|---|---|---|
| 0 (68) | 60 | 7 | 1 | 0 | 0 |
| 3 (287) | 241 | 46 | 0 | 0 | 0 |
| 4 (94) | 51 | 43 | 0 | **3** (LIKELY, on team-mate boxes) | 0 |
| 8 (54) | 0 | 54 | 0 | 0 | 0 |
| **Sum** | **352** | 150 | 1 | 3 | 0 |
| Same intervals, no taps (release E0 and teleport split alike) | 266 | 235 | 1 | 1 | 0 |

Out of sample, three correct taps raise correct target frames on an unseen interval from 266 to 352 (+32 %) with no
CONFIRMED error, but one left-out interval gains 3 LIKELY wrong-player frames. Owner taps help; they are not a
guarantee, and LIKELY claims still need the appearance-only rule (candidate D) or review.

The planned run "combined reader + candidate D" (`e2b_comb_D_0`) was lost when the workspace restarted on 2026-11-15
(marked incomplete) and was rerun on 2026-11-15; results are in section 8.

## 4c. Candidates combined, with simulated taps (2026-11-15, controlled replays)

Same stage 1, same E0 cache snapshot; frozen tree `frz-tp` = `0bae8d7`. Flags: T = `SCOUTX_TELEPORT_SPLIT=1`,
D = `SCOUTX_APPEARANCE_ONLY_LIKELY=0`, C = `SCOUTX_OCR_VARIANT=combined` (with the separately built combined cache).
Counts are target-visible labelled frames correct/abstained/unmatched plus wrong-player frames (N labels).

| Run | Taps | All 504 frames | Untapped interval | Confirmed / likely s |
|---|---|---|---|---|
| release `rel_t4v` | 0,3,4,8 | 250/234/3, **17 wrong (1.7 s CONFIRMED)** | — | 17.7 / 160.8 |
| T `tp_t4` | 0,3,4,8 | 421/82/1, 0 wrong | — | 15.5 / 188.3 |
| T+D `tp_t4_D` | 0,3,4,8 | 421/82/1, 0 wrong | — | 15.5 / 71.5 |
| T+D+C `all_t4` | 0,3,4,8 | 407/96/1, 0 wrong | — | 42.0 / 62.7 |
| T+D+C `all_0` | none | 308/195/1, 0 wrong | — | 30.7 / 31.8 |
| T leave-one-out (0 / 3 / 4 / 8 left out) | other three | — | 60/7/1, 241/46/0, **51/43/0 + 3 wrong**, 0/54/0 | — |
| T+D leave-one-out | other three | — | 60/7/1, 241/46/0, 0/94/0, 0/54/0; **0 wrong** | — |
| T+D+C leave-one-out | other three | — | 58/9/1, 248/39/0, 0/94/0, 0/54/0; **0 wrong** | — |

Readings: D changes nothing in the tapped runs except removing LIKELY time outside the labels (188 → 72 s); in the
leave-one-out runs it removes exactly the 3 wrong-player frames of interval 4 (1,314.4–1,314.6 s, appearance-only
LIKELY) and, with them, the 51 correct frames of that interval. That is the expected trade: fewer claims, no wrong
ones. C adds confirmed time (15.5 → 42.0 s with taps) at a small labelled cost with all four taps (421 → 407).
**Verdicts (controlled replays, one recording, one annotator):** T supported for further validation (fixes a release
CONFIRMED wrong-player defect with taps); D supported for further validation (removes every observed wrong LIKELY
claim, at a recall cost); C supported for further validation only together with D. None is ready for promotion
before the fresh-cache full-match run (E6, below) and independent labels. Cache note: these replays share E0's OCR
cache snapshot by design (controlled pairs); E6 checks the same configuration with fresh caches.

### E6: all three candidates, fresh caches, full-match resolve (2026-11-15)

`exp1114/e6_all_fresh/run.sh`: `bench/full_match_benchmark.py` from frozen `0bae8d7` with T+D+C, the hard-linked
saved Linux CPU stage 1 and reused discovery like E0, **no OCR cache of any other run** (both caches built fresh).
Exit 0, invariants ok, OCR on CPU with no degraded reader, peak RSS 1,765 MiB (E0 1,761 MiB), wall 1,686 s on a
contended host (E0 1,633 s; not a timing measurement).

| IMG_4809, 504 target frames, corrected basis | E0 release | **E6 candidates** |
|---|---:|---:|
| Correct / abstained / unmatched / wrong-player | 266 / 236 / 1 / 1 | **308 / 195 / 1 / 0** |
| Wrong identity (any / CONFIRMED) | 1.1 s / 0 | **0 / 0** |
| Confirmed / likely visible | 4.2 s / 41.1 s | 30.7 s / 31.8 s |
| Moments (CONFIRMED / LIKELY) | 0 / 4 | 3 / 3 |

The timeline is bit-identical (`6ce27026…`) to the controlled replay `all_0`, so the shared cache snapshot did not bias
the replays. The CONFIRMED moments outside the labels (35.3–39.8 s, 1,674.1–1,678.3 s) were checked visually: the
boxed player is orange with a front/back number consistent with "20" where legible, no contradicting number.
**Combined verdict (T+D+C): supported for further validation; ready to write a separately reviewed promotion
proposal only after independent labels (LABEL-1) and the GPU parity run.**

## 11. Number audit (2026-11-15)

Recomputed from the saved timelines with `bench/results/5.3/exp-20261115/score_timeline.py` (uses the repository's
`pp_bench.accuracy` and `audit_claim_outcomes.audit`). Labels: `gt_img4809_intervals.json` (stored basis) and
`gt_time_basis_corrections.json` (+0.1 s from 1,150 s) are kept separately; no label was changed.

**Domains.**
- 2,652 labelled frames in 9 intervals at 10 fps; 504 of them show the target (T).
- Outcomes per labelled frame: correct, abstained, unmatched (no labelled box at IoU ≥ 0.5), wrong-player (best box
  is another player, N), overlap-ambiguous, indeterminate (`?` label).
- No endpoint exclusions: every label must have a prediction sample within 0.051 s, else the audit raises.
- `wrongIdentitySec` = wrong-player frames over **all 2,652** labelled frames ÷ 10 fps. It also counts frames where
  the target is not visible and the engine claims another player.

| Run (corrected basis) | 504 target-visible frames: correct / abstained / unmatched / wrong-player | Wrong-player frames, all 2,652 labels (= s) | CONFIRMED wrong s |
|---|---|---|---|
| E0 release, no taps (`fad444c1…`) | 266 / 236 / 1 / **1** = 504 | 11 (1.1 s) | 0 |
| Release + 4 taps (`rel_t4v`) | 250 / 234 / 3 / **17** = 504 | 17 (1.7 s) | 1.7 |
| Candidate tree, flags off + 4 taps (`c1_off_t4`) | 251 / 233 / 3 / 17 = 504 | 17 (1.7 s, 1,151.2–1,153.5 s) | 1.7 |
| T+D+C, no taps, fresh caches (E6, `6ce27026…`) | 308 / 195 / 1 / 0 = 504 | 0 | 0 |
| T+D+C + 4 taps (`all_t4`) | 407 / 96 / 1 / 0 = 504 | 0 | 0 |

**Reconciliation.** The short tables in the chat report of 2026-11-15 ("266 / 236 / 1", "250 / 234 / 17") left out the
unmatched column, so they summed to 503 or 487. The release's single target-visible wrong-player frame and its 1.1 s
are different domains: 1 frame where T was visible and the claim was on another player, plus 10 frames in which T was
not labelled visible but the engine claimed a labelled team-mate; 11 frames × 0.1 s = 1.1 s.

**Endpoint effect (the other "503").** On the corrected basis, one target frame (stored 1,180.0 s → 1,180.1 s) moves
just past the end of interval 3 (1,150–1,180 s). The frame-level audit still counts it (504), but anything that
groups by interval counts 503 (68 + 287 + 94 + 54): the per-interval tables and the leave-one-out "untapped" scores.
The labels are not changed; reports name the domain.

**Checked:**
- Fresh vs shared cache: E6 equals `all_0` bit for bit.
- Flags per run are in each `anchor_replay.json` (`env` in the status log).
- The `c1_off_t4` control reproduces the release tap failure, but not bit for bit: likely time 146.9 vs 160.8 s,
  because the candidate tree also carries the anchor-guard and OCR-device changes. It is a "candidate code, flags
  off" control, not the release.
- Lost coverage from D: interval 4 left out → 51 correct frames lost together with the 3 wrong ones (section 4c).
- Visual checks of new claims outside the labels are limited evidence, not ground truth.

## 12. Seed conflicts and correlated reads (2026-11-15, rejected hypothesis)

Hypothesis: a tracklet can become a number seed although it also holds a conflicting two-digit read, because
`identity.py` seeds when `nt >= 1 and tw > ow`. Experiment: a diagnostic copy (`frz-diag`, a single logging hook, not
a candidate) logged every seed's reads on the same stage 1 and cache snapshot.

| Configuration | Seeds | Seeds with a conflicting read | Seeds resting on one read |
|---|---:|---:|---:|
| Flags off (release behaviour) | 3 | 0 | 0 |
| T+D+C | 11 | 0 | 7 |

The cause is structural: `split_on_number_conflicts` cuts a tracklet wherever shirt numbers disagree (26 splits on this
match), before identity sees it. So conflicts are kept as separate pieces, not out-voted. Correlated reads (e.g.
frames 2,418 and 2,420) do not change any seed decision, because a single agreed read already qualifies; they only
make the `no >= 2` exclusion rule easier to trigger, which is the conservative direction. **Rejected: no code change.**
Open risk: 7 of 11 candidate seeds rest on one crop where both recognisers agreed. That is the production acceptance
rule, unchanged by C; it needs independent labels to quantify.

## 13. Coaching on the candidate report (2026-11-15)

`bench/coach_eval.ts` on E6 (`exp1114/e5_coach/coach_e6.json`): still **no strengths or improvements, three
limitations** (positioning: 31 s confirmed < 60 s minimum; identity; physical). 0 statements about another player.
The candidates triple confirmed coverage, but on this recording it stays below the evidence minimum. The coach
declines honestly; no gate was lowered. Coaching remains blocked by identity coverage, so a longer, better-filmed
recording (or owner taps: 42 s with four taps, still < 60 s) is the lever, not the coaching text.

## 14. Acquisition delay and fragmentation (2026-11-15)

`bench/results/5.3/exp-20261115/interval_metrics.py`. For each interval with target frames: the delay from the first
labelled target frame to the first correct claim, and the number of separate correct-claim runs (fragments).

| Run | i0 (68 f) | i3 (287 f) | i4 (94 f) | i8 (54 f) |
|---|---|---|---|---|
| E0 release, no taps | 4.0 s, 4 runs | 3.6 s, 10 runs | never | never |
| E6 T+D+C, no taps | 0.1 s, 6 runs | 3.6 s, 6 runs | never | never |
| Release + 4 taps | 0.1 s, 6 | 0.6 s, 7 | 0.0 s, 4 | 0.0 s, 3 (but 1.7 s CONFIRMED wrong in i3) |
| T+D+C + 4 taps | 0.0 s, 3–9 | 0.0 s, 9 | 0.0 s, 3 | 0.0 s, 3 |

Without taps, intervals 4 and 8 are never acquired by any configuration: no legible number there. That is the
practical limit of number-only identity on this recording; a tap per uncovered stretch is the safe way to get it.

## 15. E7: smaller players (Veo-like far view, simulated; diagnostic only)

Saved IMG_4809 crops were scaled down and back up (0.5×, 0.35×) and read by all three readers
(`frz-diag` evaluator option, not a candidate). 1,466 labelled crops (245 target, 1,221 same-kit team-mates):

| Scale | Combined: target "20" crops / pieces | Combined: team-mate other-number misreads | "20" on a team-mate |
|---|---|---|---|
| 1× (E2) | 10 / 5 of 19 | 111 | 0 |
| 0.5× | 6 / 3 of 19 | 149 | 0 |
| 0.35× | 3 / 2 of 19 | 146 | 0 |

Expected effect on far (Veo follow-cam) footage: far fewer number seeds, so more abstention and lower coverage, but
no observed increase in putting the target's number on a team-mate. More other-number reads on target crops could
exclude real target pieces ("shows #…"), which again costs coverage, not safety. Limits: resizing is not a real
elevated 180° panorama (no seam, no top-down foreshortening). Real consented Veo recordings are needed (research
notes, section 2).

## 16. Teleports across short gaps (2026-11-15, measured; no change)

`split_on_teleports` (candidate T) only checks consecutive frames of a track. Inside tracks there are 6,791 gaps of
2–6 frames. Composing the camera warps over each gap (all warps quality ≥ 0.5; 122 gaps skipped as unreliable) and
flagging jumps > 0.8 + 0.5·(gap − 1) box heights gives **19 gap-jumps in the match, 2 inside labelled intervals**
(1,155.1 s track 2933; 1,503.5 s track 3833). Neither involves a labelled player box (IoU with every label < 0.5),
so there is no observed identity failure to fix. Kept as a counterexample category for held-out footage
(`exp1114/gap_teleports.json`); T is not extended without a failing case.

## 17. Clip-specific coaching experiment CLIP-EXP-1 (2026-11-17)

**Current state checked.**
- `buildCoachInsights` keeps its match-level gates unchanged: positioning needs 60 s confirmed; involvement needs 120 s.
- It already has a narrow clip path: a sequence observation from one continuous CONFIRMED sequence of at least 6 s.
- The worker reported one such sequence on E6 (1,170.8–1,178.8 s, "tight"). The coach still showed none.

**Defect found (production parser, not changed).**
- `parseOffballSequences` checks sequences against `encodeStateStrip`, which stores the majority state per whole second.
- Second 1,170 is mostly LIKELY (1,170.0–1,170.7 s), so the strip cell reads [1,171, 1,179] and the clip starting at
  1,170.8 s is rejected, although every frame in it is CONFIRMED.
- The same rounding could also admit a clip whose second is mostly but not fully CONFIRMED.
- Proposed fix for separate review: check sequences against the frame-level timeline the server already receives.
  This is stricter where the strip was too lenient and exact where it was too strict.

**Experiment.**
- `src/features/match-review/services/clipReviewExperimental.ts` is imported by nothing in the app.
- Production defaults and the match-level gate are unchanged.

Contract for each item:
- every frame of the clip is present and CONFIRMED (gap ≤ 0.55 s, edges covered);
- the clip is at least 6 s long;
- the opponent distance is measured on ≥ 70 % of the clip, and the values support the stated pattern
  (free share ≥ 0.7 / tight share ≥ 0.6; shares ≤ 100 %);
- no overlapping contradictory sequence;
- no owner "not me" answer within 2 s;
- inside the recording.

What an item contains:
- a numeric observation, an uncertain interpretation, and a drill with a measurable success criterion for the next
  recording;
- for midfield and attack: free = strength, tight = improvement. For defence: observation only;
- scope "this clip only", plus limitations (image-plane distance, ball and team-mates not assessed, one clip);
- owner taps up to 10 s before or inside the clip mark it `owner_assisted`. A tap never rescues frames that are not
  confirmed.

Refusals and text:
- each refusal returns a reason and a recovery action;
- a text provider may only rephrase. Numbers, units or claims it adds are rejected (speed, metres, team-mates,
  intent, success), and the template is used instead; a provider failure also falls back to the template;
- a review is stale once the owner's answers change.

**Tests.** `tests/unit/clipReviewExperimental.test.ts`, 13 tests: positive, improvement, defensive observation,
ambiguous identity (one LIKELY frame), mid-second regression, gaps and missing boxes, < 6 s, owner "not me", owner
tap scoping, contradictory, invalid citations and values, provider failure and rejection, stale review. App unit
suite 825/825; `tsc` and eslint clean.

**Replay on saved reports** (`bench/clip_review_eval.ts`, results `bench/results/5.3/clip-exp-20261117/`):

| Report | Clip | Item | Labels in the clip |
|---|---|---|---|
| E6, no taps | 1,170.8–1,178.8 s tight | improve (attack/midfield) / observation (defence), automatic | 81 of 81 frames are the target |
| T+D+C + 4 taps | same | same | 81 / 81 target |
| T+D+C + 4 taps | 1,895.8–1,903.5 s free | strength, **owner-assisted** | 38 target, 39 unsure (`?`), 1 unmatched, 0 other |

**Verdict: needs revision before any product use, and supported for further validation.**
- The contract produced one fully label-verified clip item on E6 without lowering any gate.
- The owner-assisted clip is only half verifiable from the labels.
- The observable is limited to image-plane closeness to an opponent; it says nothing about the ball or decisions.
- Coaching quality has not been reviewed independently. A football coach needs to rate these items blind against the
  clips (the review protocol is the `labelSupport` + clip list in the result files). My checks are not independent.

## 18. Clip sequences dropped by the server (fix, 2026-11-17)

**Defect.** `parseOffballSequences` checked the worker's clip sequences against the 1-s majority state strip. It
dropped IMG_4809's 1,170.8–1,178.8 s sequence (every frame CONFIRMED, all 81 labelled frames the target), because
second 1,170 is mostly LIKELY. It could also admit a second that was only mostly confirmed.

**Fix** (`functions/src/analysis/trackingV3.ts`, `confirmedOnEveryFrame`): when the uploaded timeline is present,
every sample inside the sequence must be CONFIRMED_VISIBLE. Samples must reach both ends within one sampling step
and gaps may be at most max(0.55 s, 1.5 steps). The worker uploads about 2 samples/s (`app/tracking_v3.py`), so the
server checks at that rate; the worker itself builds sequences from every 10 fps frame. The strip remains the
fallback when no timeline is sent.

**First attempt corrected.** A 10 fps-only edge rule broke the committed 5.0 fixture (2 Hz timeline,
`sequence_free_1356`, first sample 0.4 s after the start). That sequence is fully confirmed in every uploaded sample,
so the rule was too strict for real uploads, not the fixture too lenient. The tolerance now follows the sampling.

**Results.**
- E6 with the 2 Hz timeline: the 1,170.8 s sequence is kept, and the coach adds one clip observation (8 s, tight
  82 %, median 0.75 body heights; tier 1; `coach_e6_fix.json`).
- Match-level gates are unchanged (positioning still needs 60 s; still a limitation).
- Tests: `tests/unit/videoReasoning50.test.ts`, new case covering the mid-second sequence, a single LIKELY sample
  refused, a 0.6 s gap refused, and the same at 2 Hz. App unit suite 826/826, `tsc` and eslint clean,
  `functions/lib` rebuilt.

**Verdict:** supported for review as a server correctness fix (stricter where the strip was lenient, exact where it
was too strict). Not deployed; tracking stays disabled for users.

## 19. TrackEval single-target evaluation (2026-11-17)

`workers/football-cv/bench/trackeval_export.py` writes MOTChallenge files for the **selected player only** (one
sequence per labelled interval). TrackEval (MIT, `12c8791`) runs isolated
(`/home/claude/work/rights/trackeval-env/run_trackeval.py`); rights in `docs/video/github-rights-inventory-2026-11-17.md`.

**Semantics.**
- Abstention = no prediction row.
- A claim on an annotator-unsure ("?") box is dropped from both sides and counted.
- A missing prediction sample raises an error.
- Frame indices keep their position.
- Tests: `tests/test_trackeval_export.py` (2).

Sparse selected-player labels cannot support multi-object HOTA claims; these are single-target numbers over 503
interval-scored target frames (the 504th is the endpoint frame, section 11).

| Run (corrected basis) | States | HOTA | DetA | AssA | IDF1 | IDP | IDR | TP | FN | FP | IDSW |
|---|---|---|---|---|---|---|---|---|---|---|---|
| E0 release, no taps | C+L | 0.607 | 0.491 | 0.752 | 0.679 | 0.950 | 0.529 | 266 | 237 | 14 | 0 |
| E0 | C only | 0.055 | 0.046 | 0.066 | 0.091 | 1.000 | 0.048 | 24 | 479 | 0 | 0 |
| E6 T+D+C, no taps | C+L | 0.683 | 0.575 | 0.811 | 0.755 | 0.990 | 0.610 | 307 | 196 | 3 | 0 |
| E6 | C only | 0.326 | 0.259 | 0.409 | 0.423 | 1.000 | 0.268 | 135 | 368 | 0 | 0 |
| Release + 4 taps | C+L | 0.489 | 0.434 | 0.553 | 0.632 | 0.868 | 0.497 | 250 | 253 | 38 | 0 |
| Release + 4 taps | C only | 0.248 | 0.167 | 0.370 | 0.299 | 0.782 | 0.185 | 93 | 410 | 26 | 0 |
| T+D+C + 4 taps | C+L | 0.759 | 0.731 | 0.787 | 0.874 | 0.953 | 0.807 | 406 | 97 | 20 | 0 |
| T+D+C + 4 taps | C only | 0.409 | 0.384 | 0.436 | 0.573 | 0.976 | 0.406 | 204 | 299 | 5 | 0 |

**Reading the false positives.**
- TrackEval counts every claim that does not overlap a labelled target at IoU ≥ 0.5, including claims while the
  target is unlabelled.
- Release + 4 taps: 26 CONFIRMED FPs, including the known 1,151.1–1,153.5 s wrong-player transfer (claims on N
  boxes at IoU 0.7–0.96 while T is visible elsewhere).
- T+D+C + 4 taps: its 5 CONFIRMED FPs inside scored frames are 4 frames at 1,301.5–1,302.6 s plus 1 at 1,896.5 s.
  - The 1,301.5–1,302.6 s frames were reviewed visually (private, local): the selected player is almost fully hidden
    behind opponent #16 and the annotator left her unlabelled. The claim box sits where she is in the neighbouring
    labelled frames. This is a **label gap**, not a demonstrated wrong-player claim; it cannot be verified either.
  - The other CONFIRMED claims at 1,895.8–1,899.7 s sit on "?" boxes (annotator unsure) and are dropped from scoring.

**Use.** The table adds the standard detection and association split to the PitchProof audit; it does not replace
it. Wrong-player attribution, abstention and owner-assisted runs stay reported separately (sections 11, 4c).

## 20. Changed-frame reports (2026-11-17)

`workers/football-cv/bench/compare_frames.py BASE.npz CAND.npz OUT.json` gives every labelled interval frame one
outcome per run:
- `correct`: on the target box.
- `wrong`: on an N box, a demonstrated wrong-player claim.
- `nolabel`: no box labelled, target not annotated.
- `offtarget`: no match while the target is labelled elsewhere.
- `unsure`: on a "?" box.
- `abstain`.

It lists every changed frame plus `newConfirmedWrong`. Tests are in `tests/test_trackeval_export.py`. Reports are in
`bench/results/5.3/compare-20261117/`.

| Base → candidate | Correct | Demonstrated wrong-player | New CONFIRMED wrong | Main transitions |
|---|---|---|---|---|
| E0 → E6 (T+D+C) | 266 → 307 | 11 → **0** | 0 | 43 abstain→correct, 11 wrong→abstain, 2 correct→abstain |
| E0 → release + 4 taps | 266 → 250 | 11 → 17 | **17** (1,151.2–1,153.5 s) | 159 correct→abstain, 143 abstain→correct |
| E6 → T+D+C + 4 taps | 307 → 406 | 0 → **0** | 0 | 100 abstain→correct, 17 abstain→nolabel, 128 abstain→unsure |

The 17 `nolabel` frames added by the taps include 1,301.5–1,302.6 s, where the player is hidden behind #16 (section 19).

## 21. E8b test-time augmentation for the "20" score: rejected (2026-11-17)

Four variants of each crop were scored by docTR PARSeq for "20": CLAHE, gamma 0.7, gamma 1.4 and 1.5× scale.

| Threshold | Target crops hit (any variant) | Target pieces | Other-player crops hit | Other-player pieces |
|---|---|---|---|---|
| 0.5 | 42 / 245 | 12 / 19 | **132 / 1,221** | **47 / 118** |
| 0.7 | 31 / 245 | 9 / 19 | 101 / 1,221 | — |

On un-augmented colour ROIs the same score never fired on another player (0 / 1,221, section 15). Augmentation
manufactures "20" reads on 40 % of other players' pieces, so it would directly create wrong-player evidence.
**Rejected.** No code change; the 5.0 rule (weak-only sightings are never identity evidence) stands.

## 22. Runtime, memory and candidate classification (2026-11-17)

**Runtime and memory.** IMG_4809: 33.9 min, 20,350 frames at 10 fps, measured on 2 CPU cores with no GPU.
- Discovery/detection stage (shared, cached): 2,532 s at 2.0 effective detect fps.
- Resolve: E0 1,582 s; E6 T+D+C 1,628 s (+2.9 %).
- Peak RSS: 1,761 vs 1,765 MiB.
- T+D+C costs about 3 % more CPU time and no extra memory.
- No optimisation was made. Detection dominates and needs GPU-3 parity numbers before any change is worth measuring.

**Classification** (brief 1bb14b73 scale). Nothing is promoted; analysis stays disabled for users.

| Candidate | Evidence | Class |
|---|---|---|
| T teleport split + D no appearance-only LIKELY + C combined OCR (E6) | Demonstrated wrong-player frames 11 → 0; correct 266 → 307; CONFIRMED correct 24 → 135; one match, one camera | **Supported for further validation.** Needs a second labelled match and GPU parity (GPU-3) before a promotion proposal |
| T+D+C with owner taps | 406 correct, 0 demonstrated wrong-player frames; 17 unverifiable `nolabel` frames | Supported for further validation (owner-assisted, reported separately) |
| Release + owner taps (current product path) | 17 CONFIRMED wrong-player frames at 1,151 s | **Needs revision.** The teleport split (T) is the fix; it is not in the release |
| Server sequence check on every frame (9ba85c3) | Unit-tested; removes clips that only pass the 1-s majority | Ready for a separately reviewed promotion proposal (server-only, behind the disabled analysis flag) |
| CLIP-EXP-1 clip coaching | 1 grounded observation on E6; 81/81 frames the target | Supported for further validation |
| Weak "20" colour-ROI score (E8) | 15/245 target crops, 0/1,221 others | Needs revision. One match only; violates the 5.0 weak-evidence rule unless redesigned |
| Test-time augmentation (E8b) | Creates "20" reads on 47/118 other-player pieces | **Rejected** |
| Seed-conflict hypothesis | Not reproduced | Rejected |
| TrackEval single-target export + changed-frame report | Tested; matches PitchProof counts | Adopted (evaluation tooling only) |
| Schema / report proposal | Document only | Needs review |
| E9 synthetic-digit fine-tune of PARSeq | Not run: CPU-only training is impractical on 2 cores, and disk is low | Open; better run on the GPU-3 VM if a session is granted |

## 23. First held-out match: IMG_4529 (2026-11-18)

Briefs c490c61b / 7b64a65e. Details in `docs/video/footage-library/`.

**Footage.**
- IMG_4529: camera date 2024-03-27 (+01:00, high confidence). The file date says 2026-11-01, which is an iCloud
  sync date.
- 1080p30 H.264 SDR, 47.0 min, night, low sideline with spectators in front.
- Proxy: 945 MB product-equivalent 10 fps, 28,217 frames. Joining was verified by decoded-frame MD5s; video stream
  SHA-256 `88e4fe5c…e13a`.
- Group `m-2024-03-27-night` is frozen as **held-out** by the hash rule before any prediction existed.

**Identity.**
- Team (orange) is visually verified.
- A #20 is legible on the orange team at several close moments (e.g. 972.8 s, 1,147.3 s, 1,308.3 s), so the date
  hypothesis "#20" is consistent.
- That this #20 is the owner's player is **not owner-confirmed**.
- Random far frames are unreadable even at source resolution (the source is 1080p), so no frame-level target labels
  exist for this match.

**Runs.**
- Automatic, no anchors, identical proxy bytes, fresh OCR caches.
- The candidate reused the release run's stage-1 detections (hard links) and discovery: T/D/C act only in resolve.
- The workspace restarted twice. The checkpoint folders resumed both runs.

| Run | Claimed | CONFIRMED | Wall time (2 CPU) | Peak RSS |
|---|---|---|---|---|
| Release 32ab43f | **0 s** (all AMBIGUOUS/UNKNOWN: 0/6 discovery sightings attached, 0 seeds) | 0 s | 11,002 s (0.26× real time) | 2,312 MiB |
| T+D+C 0bae8d7 | 133.2 s in 56 segments (12 seeds) | 65.0 s in 15 runs | resolve 337 s | 2,149 MiB |

**Claim audit** (`claim-audit-IMG_4529-tdc.json`).
- Agent-authored and prediction-exposed: one frame per segment, number read by eye.
- **CONFIRMED runs:** 5 of 15 show a legible "20", 10 are illegible, **0 show another number**.
- **LIKELY:**
  - 3 single-sample segments (0.4 s in total) show a legibly different number: #12 at 2,040.3–2,041.4 s and #17
    at 2,523.6 s.
  - 1 segment is probably #29 (1,864.9 s).
  - These are wrong-player LIKELY claims, short flickers that the 1-s strip majority would mostly hide. They still
    count as wrong attribution.

**Unknowns.**
- Recall and acquisition delay are unknown without target labels.
- Owner confirmation of the #20 identity is pending.

**Reading.**
- Release: safe by abstaining completely on this footage. It produces no usable output.
- The candidate gains confirmed coverage with no visible CONFIRMED wrong-player claim, but it makes brief LIKELY
  wrong-player claims. This is the same pattern the D change was meant to remove on IMG_4809, which it does not
  fully remove here.
- One held-out match is not generalization evidence.

## 24. Second held-out match, candidate I and audit (2026-11-18)

Full packet: `pre-pilot-decision-2026-11-18.md`. Numbers: `footage-library/results-heldout-2026-11-18.json`.

**IMG_5105** (camera date 2024-08-31, day, low sideline behind a railing, 46.1 min; proxy 1.34 GB, 27,640 frames,
video stream SHA-256 `5c02d0bb…27e3`).
- Pre-prediction sampling (46 frames, every 60 s) found no legible #20. #5, #7, #10 and others were readable.
- Release: 0 seeds. 6.4 s appearance-only LIKELY in 19 segments, all numbers unreadable, at least 2 visibly
  different players.
- T+D+C: 1 seed.
  - 5.9 s CONFIRMED at 2,178.5–2,184.6 s; the zoom shows a probable "20".
  - 0.9 s LIKELY, all of it interpolated fills bordered by AMBIGUOUS.

**Candidate I** (`f699669`, `SCOUTX_INTERP_NO_UPGRADE=1`).
- Defect (found on held-out IMG_4529, so that match is now design-exposed): with D, interpolated 1–2-sample gap
  fills between AMBIGUOUS samples kept LIKELY. All four legibly wrong LIKELY samples (#12, #17) and the probable
  #29 were such fills.
- Repair: a claimed interpolated run needs claims on both sides. 7 unit tests, including legitimate counterexamples.

| Match | T+D+C → T+D+C+I | Labelled / audited effect |
|---|---|---|
| IMG_4809 (dev) | 3 samples LIKELY → AMBIGUOUS | All 2,647 scored frames identical (307 correct, 0 wrong) |
| IMG_4529 | 35 samples (3.5 s) LIKELY → AMBIGUOUS | All 5 legibly or probably wrong samples removed; 0 legible-#20 samples removed |
| IMG_5105 | 9 samples (0.9 s) LIKELY → AMBIGUOUS; LIKELY 0 s | Removed samples unreadable. The rule was committed before this output was viewed |

**Determinism.** In all three pairs, boxes and evidence are identical and the combined OCR caches are byte-identical
across independent cold/resumed runs (`b7f7ac50…`, `7f7532e1…`, `403eca73…`).

**Confound noted.** Release-vs-candidate comparisons also include the 0bae8d7 tap fixes and the stage-1 refactor;
see packet §3.

**Verdicts.**
- T, C, I: supported for further validation.
- D: needs revision; evaluate only as D+I.
- Server every-frame sequence check: ready for a merge-only proposal after the suites are re-run.
- **Pilot: NOT READY.**

## 25. Confounders removed, GPU and coaching reconciled, suites re-run (2026-11-18/19)

### Controlled matrix

All cells use one frozen tree `f699669` (`/home/claude/work/frz-i`), automatic mode with no anchors, the same proxy
bytes, stage 1 hard-linked, discovery reused and **fresh empty caches**. Recipe: `/home/claude/work/matrix/run_one.sh`.
Reports are in `bench/results/5.3/compare-20261118/`.

IMG_4809 (development, 2,647 scored frames, 503 target):

| Cell | Correct | Wrong-player | Claims on "?" boxes | CONFIRMED / LIKELY samples (whole recording) |
|---|---|---|---|---|
| all flags off | 266 | 11 | 3 | 42 / 411 |
| T | 266 | 11 | 3 | 42 / 409 |
| D | 266 | **0** (11 wrong → abstain) | 3 | 42 / 356 |
| C | 308 (+44, −2) | **0** | **231** (+228) | 307 / **1,089** |
| D+I | 266 | 0 | 3 | identical to D (0 samples differ) |
| T+D+C (E6, 0bae8d7) | 307 | 0 | 3 | 307 / 318 |
| T+D+C+I (E6+I) | 307 | 0 | 3 | 307 / 315 |

**Confounder result.**
- *All flags off* on the candidate tree equals the historical release run (32ab43f) **exactly**: every state, every
  evidence label and every box over all samples of IMG_4809 (20,350), IMG_4529 and IMG_5105.
- So, in automatic mode, the extra tree differences (tap fixes, stage-1 refactor, OCR reporting) change nothing.
  Release-vs-candidate automatic comparisons are therefore valid as flag effects.
- Owner-assisted mode is **still** confounded by the tap fixes. No predeclared-anchor run exists.

**Stage-1 "speed-only" change (e092fc3).** The release and candidate trees extracted IMG_4809 600–630 s (300
frames) and were compared:
- These arrays are identical element for element: `dets`, `sigs`, `embs`, `emb_idx`, `balls`, `ball_warm`,
  `warps`, `cuts`, `times`, `grass`, `propagated`.
- All 539 crop files are byte-identical. Only the timings in `meta.json` differ.
- Limitation: that segment has no scene cut, so the cut path is equivalent by code inspection only. The same pixels
  feed both tests.

**Interactions.**
- T has no effect on labelled automatic frames. Its target, the tap transfer at 1,151 s, is owner-assisted.
- D removes all 11 wrong frames by itself.
- C adds 42 net correct frames but also 678 more LIKELY samples, 228 of them on annotator-unsure boxes. With D they
  shrink to 3.
- The pattern that I caps (bordered interpolated fills) appears with C: 2 samples with C alone and 3 with T+D+C,
  none with D alone. So **I is only active together with C**.
- No labelled coverage was lost in any I cell.

### GPU-3

The original approval (`gpu-session-request-gpu3-2026-11-15.md`) said **max 2** billable sessions.
- Amendment GPU-3a ("Approve GPU-3a", owner in chat on 2026-11-16) raised that to 3.
- The owner's 2026-11-18 instruction is not to infer a third session, so the effective position is: **GPU-3 is
  exhausted and expired**.
- Usage: 2 VMs (s1 failed, USD 0.24; s1b complete, est. USD 1.95), 110 attempts, about USD 2.19 of USD 16.
- The deadline (2026-11-18 21:49 UTC) has passed. The STOP flag is set and no scheduled resumptions exist.
- At last check: 0 instances, 0 disks and no `runs/` objects.
- Candidate I was never in GPU-3 scope. A GPU run of it needs a new written approval.

### Coaching thresholds

These are separate, legitimate contracts, not a defect:
- **Off-ball positioning** (match-level, worker `offball.MIN_CONFIRMED_SEC = 60`, since 02f768d on 2026-10-27):
  - counts CONFIRMED_VISIBLE samples anywhere in the match, with no continuity or diversity requirement;
  - also needs ≥ 30 s with an opponent measurable;
  - LIKELY never counts;
  - owner anchors count because they make samples CONFIRMED.
- **Involvement improvement** (app `coach.ts` `MIN_CONFIRMED_FOR_COACHING_SEC = 120`, since 7a17b9c): applies only
  to the "seen a lot, rarely on the ball" insight.
- **Clip observation**: ≥ 6 s of continuous every-frame CONFIRMED (worker `MIN_SEQUENCE_SEC`, server 9ba85c3).

The decision packet had wrongly called 120 s "the" gate. On IMG_4529 T+D+C(+I), off-ball is *measured*
(65.0 s confirmed, 61.2 s measured), so a match-level positioning observation would be shown. It rests on
10 of 15 confirmed runs having no legible number, so it needs human coaching review. Gates unchanged;
`tests/test_offball_gate.py` pins 60 s.

### Suites

Isolated Linux checkout on the owner PC VM, source `f5878036` (`git archive`, tar SHA-256 `9319d7e2…`):

| Suite | Result |
|---|---|
| unit | 826 / 826 |
| tsc (app, tests, functions) | exit 0 |
| rules / emulators | 259 / 263 |

The 4 rules failures are storage v0 raw-upload allow cases. They are a harness/emulator incompatibility: the same
token and rules give 200 via v1. Neither the rules nor the test have changed since 2026-10-26.

Worker suite: 725 passed, 11 skipped, 6 xfailed, plus the new tests (13 for I and the off-ball gate).

## 26. Audit of section 25: corrections, equivalence scope, tap replays, storage tests (2026-11-19)

**Naming.** In section 25, "C" meant `SCOUTX_OCR_VARIANT=combined`. In the early-November release documents "C" meant
`SCOUTX_OCR_CONSULTED_ONLY=1`, which is default-on and was on in every run here. Authoritative mapping:
`docs/video/flag-and-candidate-names.md`. From here on, full flag names are used.

### Matrix re-audited from artifacts (`bench/matrix_audit.py`, `compare-20261118/matrix_audit.json`)

Every cell:
- tree `f699669`, rc=0, effective flags exactly as named;
- runtime env identical; stage 1 hard-linked (shared inodes);
- fresh caches, with only that cell's own cache files.

The `no-appearance-only-likely` + `interp-no-upgrade` cell resumed once after a workspace restart, from its own cache.

IMG_4809 corrected basis, 2,647 scored frames, of which **503 have a target box**:

| Cell | Target frames: correct / abstain / other player / off-target | Non-target frames: wrong / unsure "?" / no label / abstain |
|---|---|---|---|
| all off | 266 / 235 / **1** / 1 | **10** / 3 / 2 / 2,129 |
| `teleport-split` | 266 / 235 / 1 / 1 | 10 / 3 / 2 / 2,129 |
| `no-appearance-only-likely` | 266 / 236 / 0 / 1 | 0 / 3 / 2 / 2,139 |
| `combined-number-reader` | 308 / 194 / 0 / 1 | 0 / **231** / 7 / 1,906 |
| `no-appearance-only-likely` + `interp-no-upgrade` | identical to `no-appearance-only-likely` | |

**Correction.** The "11 wrong-player" frames of section 25 are 1 frame claimed on another player while the target
was visible, plus 10 claims on non-target frames.

**The combined reader's extra claims are unverified, not shown correct.**
- All 231 claims on annotator-unsure boxes are LIKELY. None is CONFIRMED.
- They fall in 16 runs: 408.5–418.5, 600.0–604.4, 621.0–621.9, 1,168.2–1,168.4, 1,295.1–1,299.5, 1,529.0–1,529.3,
  1,819.0–1,830.0 s.
- In a 14-frame sample (private), all were front-facing or unreadable players. Faces and builds vary between runs,
  so several different players are probably involved.
- Of the +678 LIKELY samples over the whole recording, the remainder fall outside the labelled intervals.

**Interactions established only on IMG_4809 automatic.** These are not general:
- `teleport-split` changed no labelled automatic frame.
- `interp-no-upgrade` had nothing to act on without the combined reader.

### Detection ("speed-only" e092fc3) equivalence, extended

| Segment | Frames | Scene cuts | Frames with no detection | Arrays (dets, sigs, embs, emb_idx, balls, ball_warm, warps, cuts, times, grass, propagated) | Crops |
|---|---|---|---|---|---|
| IMG_4809 600–630 s, day | 300 | 0 | — | identical | 539 identical |
| IMG_4809 1,440–1,475 s, day, cuts | 350 | 5 | 162 | identical | 134 identical |
| IMG_4529 1,510–1,520 s, night, cut cluster | 100 | 11 | 61 | identical | 17 identical |
| IMG_5105 568–588 s, day, many cuts | 200 | 12 | 141 | identical | 96 identical |

- Tolerance used: **exact** equality (NaN-equal for floats). Only `seconds` and `stageSeconds` in `meta.json` differ.
- Not exercised: variable or missing timestamps (all proxies are constant 10 fps), decode failure/recovery, and
  checkpoint resume.
- The diff touches only the 160×90 thumbnail used for the grass share and the scene-cut test. Chunking, checkpoint
  and resume code are byte-identical between the trees (`bench/full_match_benchmark.py` differs only by OCR-device
  reporting).
- Scope: output-preserving on these 950 frames under these conditions, not proven globally.

### Faithful tap/teleport replays (post-hoc **diagnostic**, not owner-assisted evaluation)

Setup:
- `bench/anchor_replay.py` on `f699669`, fresh caches.
- 4 taps placed from developer labels in intervals 0, 3, 4 and 8 (237.6, 1,151.0, 1,299.7, 1,899.8 s), all "applied".

| Flags | Correct (503 target frames, corrected basis) | CONFIRMED wrong | Script's own stored-basis score |
|---|---|---|---|
| all off | 251 | **17 (1,151.2–1,153.5 s)** | 0.9 s wrong, IDF1 0.585 |
| `teleport-split` | 421 | **0** | 0.0 s wrong, IDF1 0.852 |
| T + D + combined + interp | 406 | 0 | 0.0 s wrong, IDF1 0.836 |

The known tap-transfer failure reproduces with flags off and `teleport-split` alone removes it. These taps are
perfect, label-chosen answers, so this does not measure owner-assisted performance.

### Storage rules tests fixed

All 4 failures were in the *test helper*, not in the rules. A raw v0 upload never populates
`request.resource.contentType` in the storage emulator (firebase-tools 13.35.1 and 14.27.0, storage rules runtime
1.1.3, project `demo-scoutx`, bucket `demo-scoutx.appspot.com`).

Probe with identical token and bytes:

| Rule | raw v0 | multipart v0 | v1 media |
|---|---|---|---|
| open | 200 | — | 200 |
| `request.auth != null` | 200 | — | 200 |
| size | 200 | — | 200 |
| uid | 200 | — | 200 |
| `contentType.matches('image/.*')` | **403** | **200** (html: 403) | 200 |

- The app uploads with `uploadBytes` / `uploadBytesResumable` and contentType metadata.
- Fix `72aa6dd`: the helper sends SDK-style multipart metadata. Rules and assertions are unchanged; deny cases still
  deny.
- Full rules suite in the isolated checkout, 3 batches: **263 / 263** (121 + 79 + 63), exit 0. Command: `firebase
  emulators:exec --only firestore,storage --project demo-scoutx "node --import ./tests/unit/support/register.mjs
  --test --test-concurrency=1 <files>"`, with `JAVA_TOOL_OPTIONS` unset and ffmpeg-static linked to /usr/bin/ffmpeg.

### GPU-3 closure (read-only checks, 2026-11-18 23:59 UTC)

| Check | Result |
|---|---|
| Controller log | 108 stockouts and 2 `created` events (n 25 at 2026-11-16 04:46, n 110 at 2026-11-17 18:22), 110 attempts |
| Cloud audit log | Consistent: last insert 18:22:21 UTC on 2026-11-17, europe-west6-b |
| Resources | 0 instances, 0 disks, no `runs/` objects |
| Controls | STOP flag present; no enabled scheduled tasks |
| Spend | Estimate stays USD 2.19 (billing export not read) |

**Exhausted and expired. Nothing to revive.**

### Coaching semantics audit (wording in `src/i18n/locales/en/matchAnalysis.json`)

- **Positioning observation.** The text is scoped: "On the {measuredMin} min where you are confirmed on video…".
  It gives a caveat that the video cannot show passing lines, and attaches a drill only when a position is set (corrected in section 27).
  - Gaps: no representativeness requirement (61.2 s from 15 stretches on IMG_4529, 10 unverified), and no
    field-of-view check on team-mates.
  - The drill is generic, but it reads as advice drawn from a possibly unrepresentative sample.
- **Involvement improvement (120 s).** Requires a confirmed-identity ball contact, so a ball-tracking failure cannot
  trigger it. It does not account for how much of the confirmed time the ball was visible.
- **Clip observations (6 s).** Each says "This says nothing about the rest of your match". There is no tactical
  judgement beyond the measured distance.
- No gate was changed. Any representativeness threshold would be invented without human coaching review, so none
  was added. Review need recorded in `docs/video/coaching-human-review-request-2026-11-19.md`.

## 27. Pilot controls, rollback rehearsal and coach review packet (2026-11-19)

Scope: local and emulator work only. No production change, deployment, merge, participant contact, footage
transfer or GPU session. User-facing analysis stays disabled (`TRACKING_V3_ENABLED` unset, `APPROVED_CV_WORKER = null`).

### Pilot gate (commits `ff9615b`, `28607fa`; harness fix `72aa6dd`)

Server-only document `opsConfig/trackingPilot` `{enabled, allowlist[], workerVersion, holdReports}`
(`functions/src/analysis/pilotGate.ts`). Missing, malformed or disabled config fails closed. `holdReports` defaults to true.

| Control | Allowed case | Denied case (tested) |
|---|---|---|
| Owner + consent | owner with `videoProcessingConsents/{jobId}` v`2026-10-video-v1` | non-owner; missing consent (start refused even when allowlisted) |
| Default off | `enabled: true` | doc missing → `missing_config`; `enabled: false` → `pilot_off` |
| Participant allowlist | uid listed | uid absent → `not_allowlisted` (start, extract, discover and resolve all refuse) |
| Exact worker version | `workerVersion` equals the approved worker version | any other string → `version_mismatch`; existing `isApprovedWorkerOutput` still rejects wrong version/models in results |
| Report withholding | resolve writes `pilotHeld/current` (owner cannot read), no notification; `releaseHeldReport` publishes with version+1, `releasedBy` | `holdReports:false` publishes directly; held doc never readable by the owner (rules test) |

Entry points covered: `startAnalysis` (direct request), `processExtractTask` / `processDiscoverTask` /
`processResolveTask` (queue handlers), follow-up resolves (retries/corrections), `settleOrchestratedResolve`.
The gate is re-read **inside** the publishing transaction, so a kill switch flipped while a worker call is in
flight discards the late result (`'stopped'`, nothing published or held).
Test seam `TRACKING_PILOT_GATE=off` is honoured only when the emulator env vars are set (test 1 proves it is ignored otherwise).

Legacy routes: the older AI clip pipelines are not behind this gate. They are gated separately by
`AI_FOOTAGE_PROCESSING_APPROVED` (unset), so they stay off independently. A pilot would need that flag to stay unset.

### Rollback rehearsal (unit test 7, `tests/unit/trackingPilotGate.test.ts`)

Three jobs: `job_q` queued, `job_r` with the worker call in flight, `job_p` with a published report.
1. Kill switch (`enabled:false`) → `job_r` late result discarded; `job_q` extraction refused with no worker call;
   new `startAnalysis` refused (`worker_unavailable`, `pilot: pilot_off`).
2. `withholdPublishedReport(job_p)` → `tracking/current` becomes `{report:null, stale:true, pendingReason:'withheld_for_review'}`;
   the previous report moves to `pilotHeld/current` with `withheldAt/withheldReason`.
3. Re-enable with a wrong `workerVersion` → still closed.
4. Re-enable correctly → reprocessing returns `'held'`; release publishes version+1. Owner feedback
   (`feedbackRevision 1`, feedback content) is unchanged; `engineVersion '3.0.0'` and
   `producedBy.workerVersion 'football-cv/0.7.0'` + models recorded.

Defect found and repaired: after containment, reprocessing returned `'stale'` because the withheld doc counted
as the previous report. Fix: only a pending (not withheld) held doc counts (`pendingHeld`, `28607fa`).
Mutation checks: removing the in-transaction stop fails test 5; removing the hold fails tests 4 and 6.

### Suites (isolated VM checkout, files md5-identical to `28607fa`)

| Command | Exit | Result |
|---|---|---|
| `npm run test:unit` | 0 | 833/833 (826 before + 7 new) |
| `npm run typecheck` | 0 | app + tests |
| `npx tsc -p functions` | 0 | lib rebuilt and committed |
| `npm run test:rules` (firebase-tools 14.27.0, Firestore emulator 1.19.8; run in 3 batches for the 180 s call limit) | 0 ×3 | 265/265 (123 + 79 + 63): 263 before + 2 new pilot cases |

Upload helper (`tests/rules/emulator.mjs`) still sends `contentType` (multipart metadata); forbidden-upload
cases stay rejected within the 265.

Not exercised: real HTTP callables and Cloud Tasks delivery through the Functions emulator (handlers were called
directly with fakes); temporary-media cleanup beyond the existing `analysisPipeline` rules cases; cache
compatibility beyond the provenance fields (no worker run).

### Recovery instructions (valid for `28607fa` only)

- Stop everything: set `opsConfig/trackingPilot.enabled=false` (Admin SDK/console; clients cannot write it). Takes
  effect for queued, in-flight and new jobs without a deploy.
- Contain a published report: call `withholdPublishedReport(db, 'matchAnalysisJobs', 'tracking', jobId, reason, now)`.
- Reprocess after fixing: re-enable with the exact `workerVersion`, rerun resolve; result lands held; review; then `releaseHeldReport`.
- Hard stop: unset `TRACKING_V3_ENABLED` (needs a redeploy; not rehearsed).
Any later commit touching `pilotGate.ts`, `trackingCallables.ts` or `trackingOrchestrator.ts` invalidates these
instructions until test 7 is rerun.

### Correction to section 26

Section 26 said the positioning observation "attaches a drill". The product path attaches one only when the
player's position is set: midfielder/winger/forward → `show_for_ball`, defender/goalkeeper → `build_up_angles`,
no position → none. The IMG_4529 render (no position) shows `drill: null`.

### Coach review packet

Local only: `C:\ZLI\M335\ScoutX\.local\footage-lib\coach-review-2026-11-19\` (not sent; text copy without clips in
`docs/video/coach-review-packet-2026-11-19/`).
- 8 clips, 3.7 min total, from IMG_4529 (SHA-256 `cd1f362d…`, matches inventory): all 15 confirmed runs of the
  T+D+C+I report ±8 s, plus the 6-s example window 1170.8–1178.8 (earlier development report, labelled as such).
  No overlays, no audio, no metadata.
- Part A (blind, footage only) → Part B (sealed coaching text, Supported / Overstated / Insufficient evidence + timestamp)
  → reviewer record (independence, prior exposure, compensation).
- Text rendered via the product path at `28607fa`: positioning observation, ball-visibility limit, identity limit;
  involvement note shown as wording only (not triggered: 65 s < 120 s, 0 confirmed contacts); six-second templates
  with the one worked example.
- Gates verified in source and unchanged: `offball.py:26` 60 s, `coach.ts:117` 120 s, `offball.py:29` and
  `trackingV3.ts:147` 6 s.
- Prerequisite: owner answer to Q1 (is orange #20 the player in IMG_4529) is still missing. No reviewer response exists.

### Shadow evaluation: blocked

- No owner answers to Q1–Q4 in `owner-review-2026-11-18/README.txt`.
- `batch-01.txt` (10 files): 0 local; hydration not run.
- So no match can be frozen, no identity confirmed, and no predictions were produced. The protocol in
  `internal-shadow-evaluation-plan-2026-11-18.md` stands unchanged (frozen tree `f699669`, five configurations,
  automatic first, abstentions in denominators, private withheld coaching only, stop conditions).
- The server every-frame sequence check remains its own merge-only proposal
  (`docs/release/proposal-server-sequence-check-2026-11-18.md`); the pilot gate is not part of it.

## 28. Rollback rehearsal through the Functions emulator and Cloud Tasks delivery; cleanup; coach packet; shadow kit (2026-11-19 evening)

Scope: local only. Demo project `demo-pilot-reh`, synthetic users/jobs/media, no credentials (CLOUDSDK_CONFIG emptied,
proxies unset: no route out of the sandbox), no production resource, no participant contact, no GPU.
User-facing analysis stays disabled. Starting point verified: checkout `480d8c2` = remote `exp/analysis-dev-2026-11-14`;
GPU baseline `51d41c9f…` present and untouched.

### Delivery path exercised
`scripts/pilot-rehearsal/run.sh` → `firebase emulators:exec` (firebase-tools 15.35.0; auth, firestore 1.22.0, storage, functions,
**tasks**) with the real compiled `functions/lib` (entry wrapper only sets the emulator-only CV approval seam).
- Callables over emulator HTTP with Auth-emulator ID tokens: startPlayerAnalysis, answerTrackingQuestion, undoTrackingAnswer,
  cancelMatchAnalysis, requestDataExport, explainTrackingMoment, analyzeMatchFootage, askThisMatch, generateAiInsight.
- Task functions reached only through real `taskQueue().enqueue()` (server's own and the operator script's) and Cloud Tasks
  emulator delivery: extractTrackingSegmentTask, discoverTrackingTask, resolveTrackingTask, buildDataExport. Firestore triggers
  (media lifecycle, job deletion) ran in the emulator.
- Owner visibility read through Firestore/Storage REST with the owner's token (rules enforced).
- Worker: `fakeWorker.mjs` (127.0.0.1, deterministic barriers: hold/release, fail once, wrong models). AI traffic would land in
  `providerSink.mjs` (`OPENROUTER_BASE_URL`), which received **0** requests.
- Exercised queue behaviour: enqueue, delivery, handler retry by throwing, emulator redelivery after `minBackoffSeconds`
  (measured 60.06 s for 60 s configured), delayed delivery (`scheduleDelaySeconds`), duplicate payload delivery.
- **Not verified (emulator limits):** OIDC authentication of task dispatch (the emulator sends none), production retry
  jitter/max-doublings, task-name de-duplication across real Cloud Tasks, dispatch deadlines under load, the hourly
  `mediaLifecycleSweep` schedule (its body was called directly at the deadline), real Secret Manager.

### Defects found, preserved and fixed (`bfa63c7`; harness commits `cba96f2`, `621c905`, `a343caf`)
Reproductions: `docs/release/pilot-rehearsal-2026-11-19/1-baseline-480d8c2.json` (24 pass, 4 fail) and
`2-repro-after-storage-fix.json` (28 pass, 7 fail; 3 of those were harness errors: an invalid answer value and the
10-starts/day rate limit hit by one test user, plus `reprocess` needing the new function).

| # | Defect (product) | Evidence at 480d8c2 | Fix |
|---|---|---|---|
| 1 | **No report could ever be stored**: Firestore rejects arrays inside arrays (`stateStrip`, moment `indicator`); resolve failed with `INVALID_ARGUMENT … invalid nested entity`. Unit tests used an in-memory fake and never saw it. | run 1 | Stored form wraps inner arrays as `{_tuple: [...]}` (`toStoredForm`/`fromStoredForm`); server readers (corrections, reasoning, discovery merge) and the app subscriptions decode |
| 2 | A delivery queued before the stop ran as new work after re-enabling (old resolve reached the worker) | run 2 `reenable.old_delivery_not_authorized` | `enabledAt` required while enabled (authorisation epoch); `pilotAuthorizedAt` stamped at start; every task refuses runs authorised before the current enable (`stale_authorization`); `authorizeRun()` for operator reprocessing |
| 3 | Discovery sightings bypassed the hold (owner-readable, "first moments" notification) and the in-transaction stop | run 2 `hold.discovery…` | `pilotHeld/discovery` while held; gate read inside the merge transaction; release/withhold move it |
| 4 | A withheld report could be released as is | run 2 (release restored it without reprocessing) | release returns `withheld_requires_reprocess`; reprocessing keeps `previousWithheld` |
| 5 | An owner correction on a withheld report cleared `withheld_for_review` | run 2 `withhold.state_survives…` | pending reason kept |
| 6 | App showed "being prepared" for a withheld report | code read | new `tracking.withheld` text (7 locales) |

Caveat on fix 2: `enabledAt` is written from the operator's clock and compared with the server's start time; an operator
clock running ahead refuses (never authorises) work started in that gap, which then needs a restart.

### Final rehearsal at `a343caf` (product code = `bfa63c7`): 56/56 checks
Evidence `3-final-a343caf.json` (every HTTP outcome, task, transition and visibility read).
- **Fail closed** (start → `blocked`, no worker call): missing config, malformed config, wrong worker version,
  non-allowlisted owner; non-owner 403; anonymous 401; missing consent `consent_required`; wrong model set → rejected, nothing held.
- **Hold**: report only in `pilotHeld/current` (owner 403), no completion notice; release → owner reads it with `producedBy`.
- **Barriers at the stop**: queued (first attempt failed, redelivered after 60 s → `blocked/pilot_off`, no second worker call);
  running extract (released after stop → resolve refused, nothing held); about-to-publish resolve (released after stop →
  `stopped`, nothing held); delayed delivery queued before the stop and a duplicate delivery after it → no worker call;
  released report unchanged until withheld; new request after stop blocked.
- **Commit race** (real `processResolveTask`, paused inside its transaction after the gate read, stop written concurrently,
  3 repeats): the operator's write waits for the transaction (Firestore lock); the held report commits 0.5–1.3 ms before the
  stop (nanosecond `updateTime`). An earlier "publish_after_stop" reading was a millisecond tie, superseded.
- **Containment** (`ops withhold`): owner sees `report:null`, `withheld_for_review`; held copy 403; answer refused;
  explain → `report_not_current`; owner correction keeps the state; data export (real `buildDataExport` task) contains no report.
- **Re-enable**: old resolve and old extract deliveries refused (no worker call); a new start runs and lands under hold.
- **Reprocessing**: `ops release` of the withheld copy refused; `ops reprocess` (authorise + real enqueue) → held → release;
  owner reads again (version up), corrections identical byte-for-byte, `producedBy` worker + models, `releasedBy`,
  containment record kept.
- **Cache compatibility**: server side, only approved worker+model output is accepted (wrong models rejected above). Stage-1
  cache compatibility lives in the worker: `pytest tests/test_full_match_benchmark.py tests/test_52.py` 40/40 (checkpoint never
  mixes configurations, corrupt/interrupted chunks redone, cross-host provenance refused, extract never mixes attempts).
- **Legacy AI routes** (own controls; emulator forces `AI_FOOTAGE_PROCESSING_APPROVED` true by design, so the closure seen here
  comes from the missing provider key and the reasoning gates; the deployed flag is covered by `aiPrivacyGate`/
  `analysisFailClosed` unit tests): analyzeMatchFootage 400 `model_unavailable`; explainTrackingMoment `report_not_current` /
  `disabled`; askThisMatch deterministic "insufficient"; generateAiInsight stopped at input validation. Provider sink 0 requests;
  no media URL outside 127.0.0.1. The segment AI pipeline tasks were not delivered.

### Temporary-media cleanup (storage state, same run)
Synthetic objects per job: `video.mp4`, `frames/frame_0|1.jpg`, `tracking/q_1_r0.jpg`, `owner-note.txt`.
- Completion (trigger): source and uncited frame deleted, cited frame kept. Keep-video: source kept. Cancellation (callable →
  trigger): source deleted, `done`. Failed: kept for the 24 h retry window; sweep 1 min before the deadline 0, at the deadline
  cleaned, repeated sweep 0 (idempotent). Interrupted cleanup (`pending` left behind) finished by the sweep.
- Isolation: another owner's job and a job whose `videoStoragePath` points into another job's folder lost nothing; job deletion
  purged only its own prefix.
- **Retained, with reason**: `tracking/*.jpg` and unknown names (`owner-note.txt`) are never deleted by cleanup (only
  `video.mp4|frames/frame_N.jpg|clips/clip_N.mp4` are cleanup-owned); they go only with job deletion.
- **Findings, not fixed (need a decision):**
  - R1 A tracking-only run never sets a terminal job status, so a completed (or stopped) tracking job keeps its source video and
    all review images until the job is deleted.
  - R2 Review images of held, stopped or late-discarded reports are written before the gate transaction under the owner-readable
    `tracking/` path (predictable names), and stay there. The report text is withheld; these crops are not.
  - R3 The data export contains no tracking report at all (only `corrections`, `identityCoordination`) — safe for withholding,
    but the owner's access copy is incomplete.

### Coaching gates (tested source)
60 s whole-match positioning: worker only (`offball.py:26`); the server accepts the worker's `measured` status without
re-checking it (finding R4; a server re-check would be a separate merge-only proposal like the sequence check). 120 s
low-involvement: app `coach.ts:117/164` plus ≥ 1 confirmed-identity contact. 6 s clip: worker `offball.py:29` and server
`trackingV3.ts:181`, every frame CONFIRMED, ≥ 5.95 s accepted. None changed.

### Coach packet
`C:\ZLI\M335\ScoutX\.local\footage-lib\coach-review-2026-11-19\` re-verified: source SHA-256 unchanged; 8 clip hashes match; each
clip frame at 2.0 s matches the source at start + 2.0 s (MAD 0.5–2.2) and not +1 s (6.4–24.5). Sheets now ask per item for
verdict, timestamp, visible action / ball / camera coverage / context sufficiency and certainty; `05_HANDOFF_NOTE.md` added;
superseded versions moved to `_owner_only/superseded/`. **Not shareable yet: Q1 (orange #20 in IMG_4529) unanswered.**

### Two-match shadow evaluation: not started
- Owner answers Q1–Q4: none (file unchanged since 2026-11-18 11:48 UTC). batch-01: 0 of 10 local (33.2 GB to download).
- Readability and proxy mapping cannot be checked until files are local.
- Prepared and smoke-tested on synthetic data: `workers/football-cv/bench/shadow/` (`sample_plan.py` deterministic seeded plan,
  `freeze.py` refuses without an owner "yes" and freezes every hash/flag/rule, `run_shadow.sh` five configurations with fresh caches,
  `score.py` with abstentions and missing output in recall denominators, label/difficult-stretch/identity forms, storage budget).
- Workspace has ~1.6 GB free; one match needs ~2.1 GB peak, so ~1 GB of superseded scratch must be removed first.

### Recovery commands (valid for `bfa63c7`/`a343caf` only; emulator unless separately authorised)
`node scripts/tracking-pilot-ops.mjs stop | enable --allow <uids> --worker-version <approved> [--hold true] |
withhold <job> --reason <r> | release <job> --reviewer <name> | reprocess <job>` (refuses without an emulator unless
`--project <id> --production-authorized`). Rehearsal: `FIREBASE_BIN=<firebase-tools ≥13> scripts/pilot-rehearsal/run.sh out.json`.

### Regression suites (owner PC VM, files md5-identical to `bfa63c7`)
Unit 836/836 (833 + 3), typecheck exit 0, functions `tsc` exit 0 (lib identical to the committed lib), eslint on changed
files exit 0, rules 265/265 (73 + 106 + 86; held-discovery cases added to `trackingPilot`).

### Participant pilot readiness
Not ready. Integration evidence now exists for the emulator path, but R1–R4 are open, queue authentication/retry semantics
need verification on real Cloud Tasks, the coach review has no response, and no shadow result exists.

## 29. R1–R4 fixed, export contract checked, full rehearsal on candidate `f9b7e2d`; pilot decision (2026-11-19 night)

Candidate: commit `f9b7e2d2ef541cecd05d3944beacd15b836a8321`, tree `4e4fdf9ede851f51fc1bd8453bf9a4318ad09102`, on
`exp/analysis-dev-2026-11-14` (parent `a41692a`, working tree clean). GPU baseline `51d41c9f…` present, untouched.
Effective rehearsal configuration: demo project `demo-pilot-reh`; `TRACKING_V3_ENABLED=true`, `CV_WORKER_APPROVED=true`,
`CV_WORKER_URL=http://127.0.0.1:8790` (fake worker `football-cv/0.7.0-reh`, models `{detector: yolox-reh, ocr: parseq-reh}`,
emulator approval seam), `OPENROUTER_BASE_URL` → local sink, no provider key, pilot doc written by `tracking-pilot-ops.mjs`.
User-facing analysis stays disabled outside the emulator (`APPROVED_CV_WORKER = null`, `TRACKING_V3_ENABLED` unset).

### Dispositions
| Item | Disposition | Where |
|---|---|---|
| R1 tracking-only completion | **Fixed.** Job field `trackingState` (`running` at start, `complete` when a full report is stored or held, `failed` when a run is interrupted, never reopened once complete). The media lifecycle acts on `effectiveLifecycleStatus`: cancelled wins; running keeps the media even if the legacy pipeline failed (the pilot case: AI footage processing not approved); complete settles as a completed analysis once the legacy pipeline is not active; failed gets the existing 24 h / 7 d retry window. Retention rules themselves unchanged. | `mediaLifecycle.ts`, `trackingOrchestrator.ts`, `trackingCallables.ts` |
| R2 review/discovery images | **Fixed.** Images are written only to the server-only twin `…/pilotHeld/<name>.jpg`; reports keep the owner path `…/tracking/<name>.jpg`, filled only on direct publication or reviewer release, emptied before a withhold commits. Moves re-write bytes without download tokens. Discarded attempts delete their images; the lifecycle discards unreferenced images; pre-R2 layouts are contained by `prune-images`. `getMediaPlaybackUrl` and export links refuse `/pilotHeld/`. Authorised review path: `ops held-images` with server credentials (no client role can read held media). | `trackingImages.ts`, `pilotGate.ts`, `mediaAccess.ts`, `dataExport.ts` |
| R3 export | **Verified, policy decision pending** (below). No change to account-export behaviour. | — |
| R4 60 s positioning gate | **Fixed.** Server recomputes confirmed duration from the uploaded timeline (`eligibleConfirmedSec`): each timestamp once, conflicting duplicates invalid, only `CONFIRMED_VISIBLE`, out-of-range/non-finite excluded, gaps count nothing, step = median sample spacing clamped to 50 ms–1 s (worker semantics: confirmed frames ÷ fps). `measured` kept only at ≥ 60 s (`minConfirmedSec` raised to 60 if lower); stored `confirmedSec`/`measuredSec` capped at the verified value; `serverEligibleSec` recorded. The app shows the observation, its drill, the Ask "space" suggestion and positioning follow-ups only with a validated `serverEligibleSec ≥ 60`; reports stored before R4 get none. 120 s involvement (app) and 6 s clip (server every-frame) gates unchanged. Opponent-measured share and distances remain worker claims. | `trackingV3.ts`, `coach.ts`, `ask.ts`, `development.ts` |

### R3 export contract (traced)
- **Ordinary report downloads:** none exist for tracking reports. Share cards, football CV, career replay and reel export
  read no tracking data (code search); the report is only viewable in the app through `tracking/current` under rules.
- **Account data export** (`requestDataExport` → Cloud Task `buildDataExport` → `exports/{uid}/{id}/scoutx-data-export.json`):
  includes `matchAnalysisJobs` documents (now with `trackingState`, `mediaLifecycle`), `corrections`, `identityCoordination`;
  **no** tracking report in any state, **no** review/discovery image paths or links. Rehearsal: exports with released,
  held, withheld, reprocessed and cancelled jobs contained none (`withhold.export_excludes_report`,
  `r3.export_has_no_tracking_images_or_links`, `r3.account_export_current_contract`; 0 usable links in the emulator).
- **Policy:** `legal/documents/privacy-policy.md` ("You can access, correct, export and delete your data") and
  `data-subject-rights.md` ("Portability does not cover every internal record") do not say whether a released tracking
  report and its images belong in the export, nor how held/withheld/superseded copies are treated.
- **Decision needed (owner or counsel):** should the account export include (a) the current released tracking report and
  (b) its review images, and must held, withheld and superseded copies be excluded? Current behaviour (none of them) is
  preserved. For a pilot, access requests for tracking reports would have to be answered manually within 30 days.

### Full rehearsal on the candidate: 78/78 (`docs/release/pilot-rehearsal-2026-11-19/4-final-f9b7e2d.json`)
Command: `FIREBASE_BIN=…/firebase-tools 15.35.0 scripts/pilot-rehearsal/run.sh out.json` (exit 0, 3 min 04 s). Phases: gate,
rollback, race, r4, r1, r2legacy, legacy, cleanup, r3. The 56 historical checks all pass; 22 new:
- **R1:** tracking-only completion deletes source and uncited frames (`mediaLifecycle.source=deleted`); keep-video retains
  the source; duplicate full resolves and a duplicate extract after completion change nothing in state, storage or cleanup
  attempts (the pending held copy is re-resolved, still held); cancellation while the worker runs deletes the source at once
  and the late result publishes nothing; stopped jobs keep their source in `retry_window` (due = failure + 24 h, checked to
  5 s); sweep 1 min before the deadline keeps it, 1 s after deletes it, a repeat does nothing; an owner resume inside the
  window runs and completes, then cleans; other jobs' objects unchanged.
- **R2:** while held only `pilotHeld/` twins exist; owner, other and anonymous get 403 on twins and 404 on owner paths;
  `getMediaPlaybackUrl` on a twin → `PERMISSION_DENIED`; reviewer listing works. Release → owner 200, other/anon 403.
  Discovery thumbnail follows release. Results discarded by the stop leave no image (480d8c2–a343caf left them).
  **Issued URLs:** token URLs obtained by the owner while released returned 200, then non-200 right after `ops withhold`
  (369 ms command; images are moved before the report transaction, so no image outlives report visibility), the same
  token on the twin path fails, and after reprocessing + release the new images read 200 while the old URLs stay dead.
  Prune twice: second run 0 changes. Pre-R2 held image at the owner path: readable before, contained by prune, released
  image untouched.
- **R4 through queue + worker + store:** 59.5 s → insufficient; 60.0 → measured; 60.5 → measured; 35 s uploaded twice →
  insufficient (35); 25 + 25 s with a gap → insufficient (50); confirmed/likely conflicts → insufficient (30); worker claim
  300 s in every case. Owner reads `measured` only for the 60 s case. Reprocessed report: still insufficient (10 s).
- **Codec:** stored `stateStrip[0]` and moment `indicator[0]` are `{_tuple: …}` and decode to the worker tuple.
- **Stop guarantees (race, 3 repeats):** the operator's stop write waits for an in-flight publishing transaction; the
  held copy committed 0.5–4.4 ms before the stop. The stop takes effect when its write commits: a save that already read
  the gate completes first (with hold on it lands held, not owner-visible); any save whose gate read comes later is refused.
- Legacy AI routes: provider sink 0 requests; analyzeMatchFootage refused (no key; the emulator forces the footage flag on).

### Delivery path and what stays unverified
Real `taskQueue().enqueue()` → Cloud Tasks emulator → task functions; redelivery after `minBackoffSeconds` measured 60.05 s.
Not verified (needs real Cloud Tasks): OIDC authentication of dispatch, production backoff/max-doublings/jitter,
de-duplication by task name, dispatch deadlines under load, the hourly sweep schedule, Secret Manager, signed-URL
issuance (the emulator cannot sign; `getMediaPlaybackUrl` returns `internal` there, the held-path refusal happens before).

### Regression suites (owner PC VM; files md5-identical to the candidate, compiled lib identical)
| Command | Exit | Result |
|---|---|---|
| `npm run test:unit` | 0 | 844/844 (836 + 8) |
| `npm run typecheck` | 0 | app + tests |
| `npx tsc -p functions` | 0 | |
| `npx eslint <14 changed files>` | 0 | |
| `npm run test:rules` (3 batches, firebase-tools 14.27.0) | 0 ×3 | 266/266 (73 + 106 + 87; held images server-only added) |
| `pytest` identity safeguards (conflicting numbers, contact entry, unrelated handoff, simultaneous anchors, ambiguity, interp-no-upgrade, appearance-only) | 0 | 159/159 |

### Recovery procedure (valid for `f9b7e2d` only)
`scripts/tracking-pilot-ops.mjs` (emulator unless `--project <id> --production-authorized [--bucket <b>]`):
`stop` → every task refuses, in-flight saves finish held or are discarded; `withhold <job> --reason r` → images closed,
then report hidden; `reprocess <job>` → re-authorise + full resolve (held); `held-images <job>` → reviewer listing;
`release <job> --reviewer n` → report then images published; `prune-images <job>` → reconcile images;
`enable --allow … --worker-version … [--hold true]` → new epoch (older deliveries refused).

### Pilot decision: **not proposed; pending**
Engineering safeguards for the proposed scope pass on the candidate in the emulator. Missing prerequisites:
1. Owner identity answers Q1–Q4 (`owner-review-2026-11-18\README.txt` unchanged since 2026-11-18 11:48 UTC). Smallest action:
   write the answers into that file.
2. Independent coach response: none returned (packet still private, Q1 needed first). Smallest action: answer Q1, then
   send Part A per `_OWNER_ONLY_README.md`.
3. Two-match shadow results: none; 0 of 10 batch-01 files downloaded. Smallest action: `hydrate.ps1 -Action Pin -Batch batch-01.txt`
   plus target confirmation per match; then freeze and run `bench/shadow`.
4. R3 export policy decision (above).
5. Production-only queue behaviour (authentication, retry timing, de-duplication) unverified; needs an authorised staging
   check before any live pilot.
Automatic vs owner-assisted evidence: no owner-assisted run exists; all results above are automatic or synthetic.

## 30. Staging verification prepared; not executed (no staging project, no recorded approval); R3 question (2026-11-19 late)

Scope today: local preparation and read-only checks. Three briefs arrived together (prepare, audit, execute). The
execute brief presupposes an approved plan; none is recorded and no staging project exists (`.firebaserc` has only
`scoutx-230b0`; `approval-requests-2026-11-12.md`: "There is no staging project"). **All staging actions are paused**;
nothing was created, deployed or dispatched. Pilot: pending. User-facing analysis: disabled.

### Candidate
- §29 candidate `f9b7e2d` (tree `4e4fdf9e…`) would fail two staging pass criteria, both demonstrated locally: a repeated
  full resolve re-called the worker and re-versioned the held report (§29 evidence, held version 1→3), and constant image
  names (`reference.jpg`) allowed an old signed URL to address a re-released image.
- **Proposed staging candidate `65d9868dab5bf8b3c2fd31fabff79ad2ac33ea08`** (tree `bd26af2282108f38aabe70d1878dd99726d93d75`);
  tooling pin `ff149fd6f04753779e3ba2e1d0dfecc78ee7b1cb` (tree `ff6de9f1…`, overlay-script fix only). Changes vs `f9b7e2d`:
  resolve idempotency (same feedback revision + run authorisation → no worker call, nothing stored; corrections, OCR
  refresh and `authorizeRun` still resolve), attempt-aware extract lease, per-attempt image names, `getMediaPlaybackUrl`
  refuses tracking image paths. Residual: two duplicate resolves arriving concurrently may both call the worker; only
  one stores a report (in-transaction check).
- Staging deploy artifact = `ff149fd` + staging CV approval for the fake worker `football-cv/0.7.0-staging` (2 generated
  files; tree **`7d858509f510feff37b67485630c80bc1c571c4b`**, built by `scripts/pilot-staging/make-staging-overlay.sh`,
  never merged).

### Local results on the candidate
| Check | Result |
|---|---|
| Full emulator rehearsal at `65d9868` | 79/79 (78 + `r2.no_signed_urls_for_tracking_images`); D3-type duplicate now leaves worker calls, held version, notices unchanged |
| `npm run test:unit` | exit 0, 846/846 (+2: resolve idempotency, extract lease) |
| `npm run typecheck`, `npx tsc -p functions`, eslint (6 files) | exit 0 |
| `npm run test:rules` (3 batches) | exit 0, 266/266 |
| Staging drivers against the emulators (runtime files equal to `65d9868`) | `image-revocation.mjs` 8/8; `probe-tasks.mjs` 6 passed (R1 gap 60.1 s, R2 gaps 60.1/120.1 s, D1 `task-already-exists` also after execution, D2 1 worker call, D3 no side effects, S1 0 calls), 5 unexecuted (A1–A4 need real OIDC; R3 needs the probe queue) |
| Overlay builder | tree `7d858509…` reproduced; temp worktree removed, nothing pushed |

### Read-only facts used by the plan (production `scoutx-230b0`, no changes)
Task functions are 2nd gen on Cloud Run (`europe-west6`, 900 s, default compute SA with editor + run.invoker); the SDK
handler does not verify tokens ("guarded by IAM"), so authentication must be proven at the platform layer; queue attempt
logging is off (staging enables sampling 1.0); queue retry settings match the code; logs readable by the operator; two
open billing accounts visible; org `clusiola4-org`. Production tracking functions were last deployed 2026-11-13 and do
not have `TRACKING_V3_ENABLED`.

### Prepared (for approval)
- `docs/release/staging-verification-plan-2026-11-19.md`: actions STG-01…STG-10 (new project + USD 10 budget, Firebase,
  overlay deploy of 15 functions, probe queues and `stg-no-invoker`, private fake worker, read-only preflight, probes,
  image revocation, rollback boundary, redacted evidence, project deletion), exact commands, permissions, pass criteria,
  rejection-layer evidence, ≤ 60 tasks / ≤ 150 attempts, expected spend < USD 2, stop conditions, cleanup verification.
- `scripts/pilot-staging/`: `probe-tasks.mjs`, `image-revocation.mjs`, `collect-logs.mjs`, `lib.mjs` (redaction,
  refuses production), `fake-worker/Dockerfile`, `make-staging-overlay.sh`, `staging.config.example.json`.

### R3
`docs/release/r3-export-decision-request-2026-11-19.md`: current behaviour verified (no ordinary tracking report download;
the archive contains no tracking report or image in any state). The policy drafts are not approved
(`LEGAL_REVIEW_REQUIRED`) and do not cover tracking material; four questions for owner and counsel (archive content;
held/withheld/superseded/discarded material; images showing other people; manual process owner, verification, delivery and
the 30-day/one-month deadline to be confirmed by counsel). No decision is recorded. It blocks the participant pilot, not
staging.

### Blockers (smallest action each)
1. Staging approval: approve STG-01…STG-10 as written (including the overlay and the fake worker) and name the billing account.
2. R3: answers to the four questions in the decision request.
3. Owner identity answers Q1–Q4 (file unchanged since 2026-11-18 11:48 UTC); coach review not started (Q1 first).
4. Shadow matches: 0/10 downloaded; `hydrate.ps1 -Action Pin -Batch batch-01.txt`, then target confirmation per match.

## 31. Simultaneous delivery fixed, link revocation and spend controls verified locally; successor candidate `5265405`; staging still paused (2026-11-19 night)

Scope: local repairs and read-only checks. No staging approval is recorded and no staging project exists, so nothing was
created, deployed or dispatched. Pilot: pending. User-facing analysis: disabled. Identity safeguards unchanged.

### Simultaneous delivery (reproduced, fixed)
- Reproduced through the emulators with a deterministic barrier (each delivery paused at its first transactional read of
  `tracking/progress` until both arrived) and with two unnamed tasks through the Functions + Cloud Tasks emulators.
  `f9b7e2d`: duplicate extracts and resolves each called the worker twice and stored two report versions. `65d9868`:
  simultaneous resolves still made 2 worker calls (one version); a resolve duplicate during execution published and cleared
  `resolving`; an extract claimant returning after stop + re-enable recorded `done` and enqueued a resolve.
- Fix `aa3d7a8`: extract claim token per attempt (lease 31 min, above the 1800 s timeout; was 16 min), outcome and failure
  recorded only by the current claimant; resolve claim `progress.resolveClaim {key revision|scope|runAuthorizedAt, attempt,
  token}`: a duplicate during execution or after a stored report is `busy` (no worker call, no settle, no queue retry), a
  later attempt or an expired lease takes over, publication fenced by the token, failures free the key; per-attempt image
  names carry a random suffix so a fenced claimant cannot delete the winner's images.
- Counted separately at `5265405`: worker calls 1, report versions 1, notifications 0 from fenced claimants, enqueues only
  by the current claimant; image objects only the winner's. Evidence `pilot-rehearsal-2026-11-19/8-…`, `9-…`, `10-…`, phase
  `claim` 7/7 in `12-final-5265405.json`.
- Remaining exposure: the worker has no idempotency key; a lost worker response means one re-execution (extract cached by
  the stage-1 checkpoint, resolve deterministic, one stored version). Discovery chunks have no claim (single publication,
  possible duplicate worker call). Cloud Tasks name de-duplication covers named creates only; the application claim covers
  redelivery and unnamed duplicates.

### Download-link revocation (token flow, emulator; staging version in the plan)
`image-revocation.mjs` now covers review **and discovery** images; link issuance (token metadata read and the playback
callable) for owner, unrelated account and anonymous caller while held, withheld and discarded; a successful pre-withhold
fetch of every URL (required); a concurrent mint-and-fetch loop across the withhold; the identical URLs from fresh
connections with caching disabled; reprocessing + re-release (old links dead, new links owner-only); legacy paths; cleanup.
At `5265405`: 13/13. Exact URLs failed 10–22 ms after the withhold acknowledgment; the race loop (1431 iterations) had its
last successful fetch end 683 ms **before** the acknowledgment and no issuance or fetch after it. Server access ends;
bytes already downloaded by a device are outside server control.

### Spending controls
- Read-only recheck: `pitchproof-stg-pilot` not accessible (does not exist or no permission); Cloud Tasks, Cloud Run,
  Cloud Functions and Firestore all list `europe-west6`; two open billing accounts visible (details not recorded).
- Prices refreshed from the official pages (Cloud Run/functions, Cloud Tasks, Cloud Build, Artifact Registry, Logging,
  Storage); Tier 2 bound = 1.5 × Tier 1, no free tier assumed.
- `scripts/pilot-staging/limits.mjs`: per-case worst-case reservation; full matrix 28 tasks / 75 attempts against 60 / 150;
  90-minute driver runtime watchdog; one state file shared by both drivers; stop procedure (pilot stop → max-attempts 1 →
  pause → purge, fake-worker release-all, min-instances 0). Worst permitted combination ≈ USD 8.8 (runtime-bound; an
  attempt-only bound would be ≈ USD 10.7, which is why runtime is the binding limit); expected well under USD 1. Budget
  USD 10 with 50 % alert kept as monitoring. Guard tested locally (6 tests).
- New probe D4 (resolve duplicate during execution). S1 made deterministic in the emulator (the tasks emulator once
  dispatched a delayed task immediately); staging keeps the delayed variant.

### R3
Re-verified at `5265405`: no ordinary tracking report download; archives in the released, held, cancelled and withheld
states contain no tracking report or image; no owner or counsel decision found. Request unchanged and open
(`docs/release/r3-export-decision-request-2026-11-19.md`).

### Candidate and checks (exact tree)
Candidate **`52654050db07545053bdb808b1f10dc903c129d3`** (tree `4f45bd542868087f8274348c338d8461b2f0a7fc`); staging overlay
tree **`b4537970126e42e8d4a29f0926654ea7fd1e5d4a`** (built twice, identical; never pushed).

| Check | Result |
|---|---|
| Full emulator rollback rehearsal | 86/86 (`12-final-5265405.json`) |
| Staging drivers against the emulators | probe 7 passed / 5 unexecuted (A1–A4, R3 need real OIDC or probe queues); images 13/13 |
| Unit (VM, tree verified by sha256 manifest of 1824 files) | 860/860 |
| `npm run typecheck`, `npx tsc -p functions`, eslint (9 files) | exit 0 |
| Rules (4 batches) | 266/266 |

### Awaiting approval
Packet `docs/release/staging-verification-plan-2026-11-19.md` (revised): stable actions STG-01…STG-10c with commands,
limits, stop conditions, evidence and cleanup, including a project identity check before deletion. **First action awaiting
approval: STG-01**, which also needs the owner's choice of billing account. Other blockers unchanged: R3 answers, Q1–Q4,
coach review, shadow footage.

## 10. Primary workspace update (2026-11-15)

`C:\ZLI\M335\ScoutX` was on `main` at `c7349d5`, tracked tree clean, one pre-existing stash kept. Its remote uses an
SSH alias the linked VM cannot reach, so the update came as a verified git bundle (`main-32ab43f.bundle`, SHA-256
`8958fffb…`, same on both ends) placed in the ignored `.local/update-20261115/`. Before updating: none of the 988 paths
the update adds existed locally (no untracked or ignored file overwritten); `core.autocrlf=false` and LF working files,
so the Linux git in the VM writes the same bytes Windows git would. `git fetch <bundle>` then `git merge --ff-only
FETCH_HEAD`: HEAD = `32ab43f1f5c6274c5d7672b25fa4ac37163bbb7c` on `main`, no lock files left, `git status` clean for
tracked files. `.env`, `.env.local`, `GoogleService-Info.plist`, `.firebaserc` unchanged (same sizes and dates);
`.local` (444 entries) untouched; expected files present (rollback plan, EAS preflight, Node 22 engines, index,
Lusiola Software). The local remote-tracking ref still shows `ahead 162` until the owner runs `git fetch` once on
Windows. No reset, clean or stash was used.

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

**E2b, end to end (automatic, no taps).** `bench/ocr_cache_variant.py` (`8af205b`; the first build found no crops
because of a path bug and changed nothing, rebuilt) derived the combined reader's cache from E0's OCR cache snapshot:
of 5,728 crops the production resolve read, 85 gained a read (twenty-four 29, "20" 14, "7" 14, "17" 13, …), 12
production reads (lone digits "1"/"4"/"9") became abstentions on a conflict, 475 kept; 5,980 CPU-s. Resolve with
`SCOUTX_OCR_VARIANT=combined` on the same stage 1 (`e2b_comb_0`, resolve file verified from `frz-e2c`):

| Measure | Release (E0) | Combined reader |
|---|---|---|
| Target frames correct / abstained / unmatched / wrong (of 504) | 266 / 236 / 1 / 1 | **309 / 194 / 1 / 0** |
| Wrong identity, all labelled frames | 1.1 s (LIKELY) | **0** |
| Confirmed-correct labelled time | 2.4 s | 13.5 s |
| Confirmed / likely visible, whole match | 4.2 s / 41.1 s | **30.7 s / 108.9 s** |
| Accepted number sightings | 7 | 11 |

**Changed-claim review outside the labels (visual, crops of this local recording):** all 9 inspected new "20" reads
(35.8, 1,392.0–1,392.2, 1,667–1,674, 1,957 s) show a legible white "20" on the target's back, missed by the binarised
reader. But the resolve also made 1,000 new claim frames in 72 segments; the 24 longest were inspected: segments at
**1,384.2 s (56 frames) and 1,388.2 s (19 frames) are LIKELY claims on the team-mate wearing #17** (number clearly
visible), and several others (1,607 s; 1,821–1,876 s) cannot be confirmed from the crop. Cause: the extra confirmed
sightings switch identity from the template to the per-match appearance classifier (positives 3 → 11), which extends
LIKELY to a look-alike. These wrong claims are LIKELY, not CONFIRMED, and fall outside every labelled interval, so the
labelled score cannot see them. **Verdict: needs revision.** The reads are better; the appearance-only LIKELY rule
(candidate D, pending independent review) is the obvious companion, measured next (`e2b_comb_D_0`).

**E2c: combined reader + candidate D (`SCOUTX_OCR_VARIANT=combined SCOUTX_APPEARANCE_ONLY_LIKELY=0`, frozen `frz-e2c`,
same stage 1, same E0 cache snapshot plus the separately built combined cache, rerun 2026-11-15, rc 0):**

| IMG_4809, 504 target frames | E2b combined | **E2c combined + D** |
|---|---:|---:|
| Correct / abstained / unmatched / wrong | 309 / 194 / 1 / 0 | **307 / 195 / 1 / 0** |
| Confirmed / likely visible, whole match | 30.7 s / 108.9 s | **30.7 s / 31.9 s** |
| CONFIRMED frames | 307 | 307 (identical set) |
| LIKELY frames | 1,089 | 319 (a strict subset: D adds none) |

D removes all LIKELY frames of the reviewed #17 segments (1,381.5–1,389.7 s) and the unverifiable 1,607 s and
1,819–1,877 s segments; it costs 2 correct labelled frames. Remaining unlabelled LIKELY spans (1,299.6, 1,664.5–1,665.1,
1,831.4, 1,956.7, 1,960.0–1,962.9 s) were reviewed visually: a small distant orange player each time, no contradicting
number visible, identity not verifiable at that size. Timeline `8d9e7190…`. **Verdict: supported for further
validation** (combined reader together with D, never the reader alone); not a promotion: one recording, one annotator,
and D itself still needs its independent review.

## 9. Blocked work and exact requests

| Work | Blocker | What is needed (request) |
|---|---|---|
| GPU correctness and speed (CUDA FP32 baseline, batch, FP16, ONNX CUDA, decoder/NVDEC, discovery/stage-1 shared decode) | The 2026-11-09 envelope ran out (11/11 stockouts). **GPU-2 approved 2026-11-15 with Part C**; capacity search in progress, see `docs/release/gpu-durable-ledger-2026-11-09.md` | **GPU-1**: one L4 session, `g2-standard-8`, zones europe-west4-b/c/a then europe-west1-b/c, max lifetime 300 min, max 1 VM, cost ceiling USD 8 before tax (estimate, not a billing cap), IMG_4809 proxy only, exact commits: Part A `51d41c9…` (immutable FP32 matrix), Part B the candidate tip named in the handoff. Output: numeric exports only; cleanup verified |
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
