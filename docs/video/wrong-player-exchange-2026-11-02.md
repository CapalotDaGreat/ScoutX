# Wrong-player confirmation at 244.4 s: verification, regression replay, candidate repair (2026-11-02)

Branch `codex/gpu-benchmark-5-3`. Starting point `461c4402bee3ba2f43314ae7bd0b022572d3b196` (clean, equal to the remote). The pinned GPU inference commit `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac` is unchanged.

- No cloud resources were created. `productionApproval=false`.
- The default decoder is unchanged. The HDR reference stays experimental.
- Evidence: [wrong-player-20261102/](../../workers/football-cv/bench/results/5.3/wrong-player-20261102/). Numbers and text only; review frames stayed local.

## 1. What happened (verified)

**Indexing.** Interval i0225 covers 225–255 s; its stored label time basis is verified (+0 s). Source frame = 2250 + window frame; time = source frame / 10.

- The offending read is at source frame **2444** (window frame 194, 244.4 s):
  - crop `chunk/000194_3597.jpg`, detection 3597, box (1219, 520, 1290, 678);
  - OCR result "20", 0.95, `shirt:contrast`.

**Visual review.** Frames 2438–2449 were rendered locally through both the default and the reference path, with labels and detections overlaid. Player crops were checked at 2441–2450. Findings:

- **The players.**
  - **#20** is the ball carrier, back to the camera. "20" is visible on the back at 2441, 2444, 2445, 2447 and 2450.
  - **Player A** is an orange team-mate facing the camera, so no number is visible.
- **The event.** The two cross at 2442–2444: #20 moving left, A moving right. The boxes overlap partially; no frame reaches the 50% contact cover.
- **The read is correct.** The OCR crop at 2444 is #20 (T label IoU 0.91, "20" visible).

**Association, in both decoders** (raw tracker rows):

| | Reference rendering | Default decoder |
|---|---|---|
| Player A's track | track 98 has no row at 2443, then resumes at 2444 on #20's detection | track 84 jumps at 2443 onto #20's detection |
| #20's track | track 67 **continues** at 2444 onto a fragment of A, then follows A | track 61 **pauses** 2442–2443, then resumes at 2444 on A and follows A |
| Contact rule (cover ≥ 0.5) | not triggered | not triggered |
| Steal rule (victim's track paused) | **not triggered**: the victim did not pause | **triggered** at 2443 (track 84): cut, with an appearance-decided link |
| Result | final tracklet 205 = A (2426–2442) + #20 (2444–2512) | #20's later track follows A, but A's part never gets number evidence |

**Chain (reference rendering):**

1. Decoded frame 2444.
2. Detection 3597 = #20.
3. OCR "20" (correct).
4. Raw track 98 holds A before 2443 and #20 from 2444. The **exchange is not cut**.
5. Tracklet 205 becomes a number tracklet.
6. Conflict-free frames within the 4 s hard-evidence radius are claimed **CONFIRMED / number on both people**, including A at 242.6–244.2 s.

**Counts** (`visual_review.json`): **1 read** and **2 independent identity events** (E1, E3) explain the reference run's **26 wrong-player frames** under the original labels:

| Group | Frames | State | What it is |
|---|---|---|---|
| E1: exchange + number evidence carried back onto player A | 13 labelled N + 2 labelled "?" | confirmed | **real wrong-player claims** |
| E2: frames 195–197, 208, 211 | 5 labelled N | confirmed | **annotation issue**: the claimed box is #20 (visible "20"), labelled N. **Corrected 2026-11-03 (§8): true for 195–197 and 208 only. Frame 211 is a real wrong-player claim (E4).** |
| E3: 238.6–239.9 s | 8 labelled N | likely | **separate mechanism**: appearance-only choice of a distant, blurred orange player while #20 was unclaimed; not related to the exchange |

**Independently justified annotation issue** (labels **not** changed):

- At window frames 195–197 the **T label is on player A**, and #20 is labelled N (also N at 208 and 211). **Superseded by §8:** at 211 the N box is another player, so that label is correct.
- The label file is piece-based (field `piece`) and follows the same tracker exchange.
- Consequence for the default run: at frames 195–197 it claims player A (likely, after its own exchange). Those frames are counted **correct** under the original labels but are **visually wrong-player**. Frame 194 is an unmatched claim.
- So "the default produced no wrong-player claims" is true only under the original labels.

**Uncertainty:**

- Player A is identified only as "not #20" (front view, no number).
- The E3 claimed player is distant and blurred. Its N label is plausible, not independently verified by a visible number.

## 2. Regression replay (`bench/regression_replay.py`)

**Inputs** (numeric/text only):

- stage-1 `detections.npz` and `meta.json`;
- OCR crop **names**;
- the OCR results the run actually obtained;
- the retained discovery sightings.

Each input is hashed in `provenance.json`, together with the source run, the effective `SCOUTX_*` settings, the model hashes and the video hash.

**How it replays:**

- The real stage 2 (`analyze.analyze`) runs in a fresh directory with an **empty** OCR cache, exactly as the original run started.
- Crop files are zero-byte placeholders. Each crop read the pipeline requests is answered with the original run's result.
- Image I/O and the OCR model are the only replaced components. Tracking, contacts, steals, identity and timeline code run unchanged.

**Reproduction.** With the candidate flag off, all 18 baseline interval runs (9 intervals × default/reference) reproduce **300/300 states, evidence and boxes**. Every requested crop was read in the original run.

**Committed failure replay:** `replays/reference_i0225` (with `replays/default_i0225` as a counterexample).

**Limitation.** When behaviour changes, the pipeline may request crops the original run never read. The replay answers those with no text (counted). Full-pipeline runs with real OCR (§4) settle those cases.

## 3. Failed contract and candidate (`93258f739a1d8a3334c76f43ae4cc08b66b06bac`)

- **Failed contract.** "A tracklet is one person." A **mutual exchange** of two same-kit players at a partial-overlap crossing was not cut. The contact rule needs 50% cover. The steal rule needs the victim's track to pause; here the victim continued (onto the other player).
- **Not the cause:** the OCR read (correct), the number-to-detection link (correct), and confirmation thresholds. Evidence propagation within one tracklet works as designed once the tracklet is wrong.
- **Candidate.** `crossings.exchange_rows`, behind `SCOUTX_EXCHANGE_SPLIT=1` and **off by default**.
  - **Trigger:** track A's row jumps onto team-mate B's motion-extrapolated box. This uses the steal rule's own geometry and thresholds: `STEAL_IOU` 0.4 and `STEAL_LEAD` 0.15 over A's previous box.
  - **Added condition:** B's own row at that frame continues B worse than A's row does, by the same `STEAL_LEAD`.
  - **Action:** both tracks are cut at that frame. The pieces are linked with the existing steal links, so identity crosses only when appearance decides it (unclear → no identity).
- **Unchanged:** thresholds, contact rule, conflicting-number rule and identity solver. Rows already handled as steals keep the steal decision.
- **Why this scope.** It repairs association provenance, which is where the evidence crossed people. It does not require two reads, gate motion globally, or delay single-read acquisition.

## 4. Validation on the nine labelled IMG_4809 intervals

**Setup.**

- The candidate was frozen at `93258f7` before any evaluation. `crossings.py` SHA-256 `2f95e3cc…4329168`. It was not changed afterwards, so no result needs rerunning.
- Baseline = the same commit with `SCOUTX_EXCHANGE_SPLIT=0`. It reproduces `461c440` exactly (18/18 interval replays, 300/300 states, evidence and boxes).
- Both decoders were run: the unchanged default (`cv2`) and the frozen HLG reference `hlg-bc709-g2.2-v1` (`22a58b9`).
- Inputs: identical video (`b1077af3…`), models and labels, and the same `cpu-onnx` settings (`dval/env.txt`). Each run started with its own fresh output and OCR cache.
- Scoring: `bench/interval_scores.py`, automatic mode only. There are no owner anchors in these intervals, so no owner-assisted results exist to report.
- Time basis:
  - the stored basis is the original labels;
  - the "verified" basis adds +0.1 s for intervals ≥ 1150 s, as recorded in `gt_time_basis_corrections.json` and checked per interval.
  - Both are in the score files. The numbers below use the verified basis; at 225 s the two bases are identical.

**Default decoder: candidate = baseline on all 9 intervals.**

- Claims, states on claim frames and all metrics are identical.
- The only differences are evidence/presence values on non-claim frames at 600 s (AMBIGUOUS/UNKNOWN).
- Wrong 0, unmatched 4, "?" 3, correct 301/502, under the original labels.

**HDR reference (diagnostic condition only)**, baseline → candidate:

Automatic mode only. Wrong-player, unmatched and "?" claims are counted over all labelled frames and are never counted as correct. Recall = correct / target-labelled frames.

| Interval | Run | Correct / target (recall) | Confirmed + likely correct | Abstained | Wrong player (confirmed) | Unmatched | "?" claims |
|---|---|---|---|---|---|---|---|
| 225 (dev) | baseline | 9 / 68 (13 %) | 9 + 0 | 25 | 26 (18) | 16 | 25 |
| | **candidate** | **27 / 68 (40 %)** | 9 + 18 | 22 | **13 (5)** | 15 | 23 |
| 1150 (dev) | both | 244 / 286 | 90 + 154 | 41 | 0 | 4 | 0 |
| 1295 (held out) | both | 33 / 94 | 33 + 0 | 61 | 0 | 6 | 41 |
| 1890 (held out) | both | 0 / 54 | — | 54 | 0 | 0 | 0 |
| 400, 600, 1500, 1680, 1800 (held out, no target labels) | both | — | — | — | 0 | 0 | 0 |
| **All 9** | baseline | 286 / 502 (57 %) | 132 + 154 | 181 | 26 (18) | 26 | 66 |
| | **candidate** | **304 / 502 (61 %)** | 132 + 172 | 178 | **13 (5)** | 25 | 64 |
| | default decoder (either arm) | 301 / 502 (60 %) | 24 + 277 | 200 | 0 | 4 | 3 |

- On the stored (original-time) basis the totals are: baseline 254, candidate 272 and default 287 correct; wrong 26 / 13 / 0; unmatched 83 / 82 / 18; "?" 40 / 38 / 2. The direction is the same.
- Outside 225 s, the candidate changes **no claim and no claim state** on any interval.
- The remaining differences are box/evidence values on AMBIGUOUS or UNKNOWN frames: 400 s (17 frames), 1150 s (14 evidence values; 8 UNKNOWN → AMBIGUOUS), 1500 s (6) and 1800 s (46).
- Score files: `validation/scores_reference.json` and `validation/scores_default.json`.

**All previously reported wrong-player frames are accounted for** (reference, 225 s; 26 frames before the repair):

| Group | Before | After | Status |
|---|---|---|---|
| E1: the exchange at 244.4 s carried the "20" read onto player A (13 N-labelled frames) | 13 confirmed wrong | **0**: all 13 frames now claim #20 instead (likely, correct under the labels) | **repaired** |
| E2: frames 195–197, 208, 211 (visibly #20, labelled N) | 5 confirmed | 5 confirmed | annotation issue for 195–197 and 208. **211 is a real wrong-player frame (E4, §8).** |
| E3: 238.6–239.9 s, appearance-only choice of a distant orange player | 8 likely | 8 likely | **not repaired**; separate mechanism |

**Changed claims**, reference 225 s (every changed labelled frame was inspected from the score files):

| Change | Frames |
|---|---|
| wrong player → correct | 13 (E1: the claim moves from A to #20) |
| abstained → correct | 3 |
| unmatched → correct | 2 |
| unmatched → abstained | 1 |
| "?" claim → unmatched | 2 (the E1 frames labelled "?") |

- Correct target frames gained: window frames 174–193 (18). None lost.
- Over all 300 frames, claims go from 76 to 78 and **confirmed claims from 54 to 39**: confirmation no longer crosses the exchange.
- All 18 gained frames are LIKELY. Confirmed-correct frames stay at 9.

**Acquisition delay and lost identities** (first correct claim after the first target-labelled frame; verified basis): identical in every interval and arm:

- 225 s: 4.0 s (reference) / 0.1 s (default);
- 1150 s: 3.6 s;
- 1295 s: 0.0 s (reference) / never (default);
- 1890 s: never.

**No correct target frame is lost** by the candidate in any interval or decoder (`validation/delay.json`).

## 5. Generalisation beyond the diagnosed samples

**Protocol.** `generalisation_protocol.json` was committed in `e6e062a` **before** any clip run.

**Inventory:**

- **Development:** IMG_4809 225 s and 1150 s.
- **Held out, same match:** the other 7 IMG_4809 intervals. These are **not independent**: same match, camera and annotator.
- **Independent videos:** IMG_4529 (night, SDR) and IMG_5105 (day, SDR).
  - Neither has usable full labels. The 5.1 claim audit labels only boxes that older engines claimed, and stores no boxes.
  - No new labels were made.
- **Other HDR footage:** none accessible.

**Unlabelled independent clips** (default decoder; claims only; any #20 claim on IMG_5105 would be false):

| Clip (30 s, 10 fps cut, SHA-256 prefix) | Content | OCR reads (base / cand) | Claims (base / cand) | States |
|---|---|---|---|---|
| IMG_4529 16:00–16:30 (`5f97a94a…`) | night; #20 readable to a person at 16:13 | 174 / 173 crops; no "20" | 0 / 0 | AMBIGUOUS / UNKNOWN |
| IMG_4529 24:15–24:45 (`ee003c3c…`) | night; documented #12/#20 confusion (24:21–24:27) | 82 / 67 crops; no "20" | 0 / 0 | AMBIGUOUS / UNKNOWN |
| IMG_5105 0:00–0:30 (`e340826c…`) | day; #20 absent | 211 / 210 crops; no "20" | 0 / 0 | AMBIGUOUS / UNKNOWN |
| IMG_5105 3:00–3:30 (`0e5baed9…`) | day; #20 absent | 263 / 263 crops; no "20" | 0 / 0 | AMBIGUOUS |

- The candidate did change tracking on the IMG_4529 clips: the crop counts differ.
- It added **no claim** in any clip.
- No "20" was read in any clip, so neither arm had number evidence. These clips therefore show only that the candidate adds no claims. They give **no evidence about correct attribution**.
- The 24:21–24:27 #12 confusion, a wrong-player claim by older engines, is not reproduced by either arm.

**Limitations of the clip check:**

- The harness hard-codes the IMG_4809 target (#20, orange vs white). IMG_4529's opponents wear red, not white.
- With zero claims in both arms, these clips show only that the candidate **adds no claims** in these windows. They give no evidence about correct attribution.

## 6. Tests

- New: `tests/test_exchange_split.py`, 6 tests:
  - the failure replay;
  - exchange detected where the steal rule is blind;
  - no exchange for continuation, occlusion, small players, other kit or contact rows;
  - flag off = baseline;
  - an unrelated player inherits nothing;
  - appearance-decided identity follows the person;
  - the valid single read still confirms #20 at frame 194.
- Conflicting-number abstention, contact rules and the unrelated-tracklet guard are covered by the existing suite. That suite was run with the flag both off and on: **614 passed** with `SCOUTX_EXCHANGE_SPLIT=0` and **614 passed** with `=1`.

- Command: `python3 -m pytest -q -p no:cacheprovider` in `workers/football-cv`.
- Environment: Linux container, Python 3.13.17, CPU, `SCOUTX_WEIGHTS_DIR` set to the local detector weights.
- The count is 608 from the HDR report plus the 6 new tests.

## 7. Trade-offs and verdict

**Verdict: candidate supported for further validation**, narrowly, as a default-off experimental flag. It is **not** a production change.

**Evidence for:**

- It removes the verified failure: all 13 E1 wrong-player frames, which were confirmed, now go to #20 (correct, likely). This holds under the full pipeline with real OCR, not only in the replay.
- No correct target frame is lost and acquisition delay is unchanged in every interval and decoder.
- Unmatched claims (−1) and "?" claims (−2) do not rise.
- Outside 225 s, it changes no claim on the other 8 labelled intervals in either decoder, and adds no claim on 4 unlabelled SDR clips from 2 other matches.
- All thresholds, the contact rule, conflicting-number abstention and the unrelated-tracklet guard are unchanged. The full suite passes with the flag on.

**Limitations and trade-offs:**

- **The default decoder is unaffected.** The candidate does not change the default's visually wrong likely claims at 225 s frames 195–197. In the default decode this is not a mutual exchange:

- the steal rule already cut A's track at 2443;
- #20's track then **paused** for two frames and resumed on A's free detection.

The candidate leaves this pattern unchanged: default-decoder claims are identical in both arms. Repairing it would need a different rule: a re-acquisition after a pause, judged on motion and appearance. This is explained, not repaired, and the original labels hide it.
- **E3** (8 likely wrong-player frames, reference only) is a separate appearance-only mechanism and is not addressed.
- **E2** (5 frames) stays counted as confirmed wrong because labels were not changed. Visually, 4 of these frames are correct; frame 211 is a real error (E4, §8).
- **Thin evidence:**
  - one development event;
  - the held-out intervals are from the same match, camera and annotator;
  - the independent clips are unlabelled and had no "20" reads, so they test only "adds no claims";
  - there is no independent HDR footage.
- **Risk of the rule itself:** a real crossing in which one track also flickers could be cut. The cut is safe by construction, since identity crosses only on an appearance decision. The cost would be lost continuity, which none of the labelled intervals showed.

**Is a longer run justified?** Yes, under the protocol's expansion rule: no new wrong or unverifiable confirmed claim appeared. The smallest proportionate step is a **full-match IMG_4809 trigger audit on the default decoder**:

- list every frame where `exchange_rows` fires over the whole match;
- run baseline vs candidate locally;
- review each changed claim.

That is many CPU hours here (about 10–15 min of wall time per 30 s window on this 2-CPU container). It needs no cloud resources.

## 8. Follow-up, 2026-11-03: label corrections, unrepaired failures, full-match audit

`SCOUTX_EXCHANGE_SPLIT` stays **off by default**. Nothing in this section changes engine behaviour.

### 8.1 Label corrections: proposed, kept separate

**File:** [label_corrections_i0225.json](../../workers/football-cv/bench/results/5.3/wrong-player-20261102/label_corrections_i0225.json).

- The original label file (`gt_img4809_intervals.json`, SHA-256 `36b16fba…`) is unchanged.
- Each correction names the exact original label (frame, index, label, box), and the scorer refuses any correction that does not match it.
- Scoring uses the original labels by default. Corrections are applied only with `interval_scores.py --label-corrections`.

**Review method:**

- Label-only overlays (no predictions drawn) and enlarged crops of source frames 2441–2464, decoded by the default path.
- Each person was followed frame by frame by ball possession, direction, front/back view, hair and shorts.
- The file's own definition was applied: T = #20 with a visible number or direct continuity with one.
- The number itself is not legible in this rendering. Identity at 2444 rests on the original T label and the OCR read there.

**Independence:** the corrections are **proposed, not independently verified**. The reviewer had seen the predictions the day before. A second reviewer who has not seen the predictions must confirm them.

| Ids | Source frames (window) | Change | Confidence |
|---|---|---|---|
| C1, C3, C5 | 2445–2447 (195–197) | T → N on player A (face to the camera, no ball) | high |
| C2, C4, C6 | 2445–2447 (195–197) | N → T on #20 (the ball carrier, in direct continuity with T at 2444) | high |
| C7, C8 | 2458–2459 (208–209) | N → ? on #20. This is the same person the annotator marked "?" at 2448–2457, so "?" keeps the annotator's uncertainty. | medium-high |

**Reviewed and left unchanged:**

- **2461 (211), N.** This label is correct. At 2460 #20 crosses a second orange player, and the N box is that other player. This **reverses the 2026-11-02 review**: the reference run's confirmed claim at 211 is a **real wrong-player frame**, now called **E4**.
- **#20's "?" labels at 2448–2457 and 2461–2464** stay "?".
- **No box was added for player A at 2444.** Any box drawn now would follow the run's claim on him, which was unmatched.

### 8.2 Rescoring: all runs, original vs proposed-corrected labels

All 9 intervals, automatic mode, verified time basis. Every run was rescored; nothing was rerun. Wrong-player, unmatched and "?" claims are counted over all labelled frames.

| Run | Labels | Correct / 502 | Wrong-player (confirmed) | Unmatched | "?" claims | Abstained |
|---|---|---|---|---|---|---|
| Default decoder: baseline = candidate | original | 301 | 0 (0) | 4 | 3 | 200 |
| | **corrected** | **298** | **3 (0)** | 4 | 3 | 200 |
| HDR reference, baseline | original | 286 | 26 (18) | 26 | 66 | 181 |
| | corrected | 289 | 22 (14) | 26 | 67 | 181 |
| HDR reference, candidate | original | 304 | 13 (5) | 25 | 64 | 178 |
| | corrected | 307 | **9 (1)** | 25 | 65 | 178 |

- Only interval 225 s changes between the two label versions.
- On the stored (original-time) basis the direction is the same: default 287 → 284 correct, 0 → 3 wrong.
- Files: `validation/rescore_20261103/rescore_{def,ref}_{orig,corr}.json`.

**Every wrong-player frame is now explained under the corrected labels:**

| Event | Decoder | Frames | State | Status |
|---|---|---|---|---|
| E1: mutual exchange at 244.4 s | reference | 13 | confirmed | repaired by the candidate |
| **P: pause-and-resume transfer** | **default** | 3 (195–197) | likely | **unrepaired** (§8.3) |
| E3: appearance-only choice of a distant player | reference | 8 | likely | **unrepaired** (§8.3) |
| E4: second crossing at 2460 | reference | 1 (211) | **confirmed** | **unrepaired** (§8.3) |

- Baseline reference: 13 + 8 + 1 = 22. Candidate: 8 + 1 = 9.

**The default decoder's apparent zero was a labelling artefact.** With the corrections, it makes 3 likely wrong-player claims at 225 s. That is the only error found, but the review covered one 24-frame span of one interval. The default's safety baseline should therefore be treated as **unknown beyond what was re-reviewed**, not as zero.

### 8.3 Regression replays for the unrepaired failures

**File:** `tests/test_known_identity_failures.py`, run with the flag both off and on. It uses the committed replays `replays/default_i0225` and `replays/reference_i0225`.

**How the tests are built:**

- A **characterisation** test passes while the faulty behaviour reproduces. This proves the replay exercises the failing logic.
- A **strict xfail** test states the desired behaviour. A future repair makes it XPASS, which pytest reports as a failure, so the repair must update the test on purpose.
- Result: **6 passed, 6 xfailed**.

**P: pause-and-resume transfer (default decoder).** Traced with `review_20261103/trace_tl.py`.

- Tracklet 201 is #20 at w185–191 and has **no rows at w192–193**.
- At w193 player A's raw track takes #20's box. The steal rule cuts it there, with an **unclear** link (margin −0.039), so no identity crosses.
- At w194 #20's own track **resumes on player A's box** and stays with A to w197. Nothing cuts it.
- Tracklet 201 keeps its "anchored" identity: clean hand-offs within 30 s join it to the tracklet where "20" was read (link 199→201 "same", margin 0.50). So A is claimed (likely, "anchored") at w194–197.
- **Why the candidate misses it:** this is a mutual exchange split across frames. `exchange_rows` requires both jumps on the same frame.
- **Plausible narrow repair (not implemented):** when the steal rule fires on track X taking Y's box at frame f, also check Y's first row after its pause, within the steal look-ahead of 3 frames. If that row continues X's motion-extrapolated path better than Y's own, cut it with the same steal-link machinery. This is a hypothesis to test against these replays and the full-match audit. It is not a validated fix.

**E3: appearance-only choice (reference).** Traced with `review_20261103/e3_scores.py`, which dumps the identity solver's terms during the replay.

- In classifier mode (3 positives, 13 negatives), tracklet 78 (a distant orange player) gets a rank-normalised appearance score of **2.36**.
- #20's own overlapping tracklet 188 gets **−0.06**.
- The chain takes 78, giving LIKELY / appearance claims on N-labelled boxes at w136–139 and w145–149.
- With the candidate the positives are clean (#20 only), and 78 still wins (0.85 raw). So E3 is **not** caused by the E1 contamination.
- **The cause is the appearance model on a small, blurred player.** A repair would touch identity scoring. It is out of scope for a narrow fix and needs its own evidence.

**E4: second crossing (reference).**

- At source 2460 #20 crosses another orange player.
- At w211 the **confirmed / number** claim box lies on that player (IoU 0.79 with the N box). At w212 it is back on #20.
- **Traced** (`trace_tl.py`, stage-1 detections):
  - Number tracklet 205 (raw track 98, one "20" read at w194) follows #20 through w205–208. It has no row at w209.
  - At w210 it takes a **merged** box covering both players (1097–1178 px, confidence 0.76).
  - At w211 the detector gives no clean box for #20, only fragments (confidence 0.64, 0.34). The track takes **the other player's box** (det 3927, 1141–1180 px, confidence 0.61).
  - At w212 it returns to #20 (1076–1122 px).
  - Neither the contact rule nor the steal/exchange rules cut this one-frame detour, so the tracklet's number evidence confirms the other player at w211.
- This is a third association pattern, a **one-frame detour through a detector merge**. Neither the exchange split nor the pause-and-resume idea above would cover it.

### 8.4 Test-log evidence

**Location:** [validation/tests/](../../workers/football-cv/bench/results/5.3/wrong-player-20261102/validation/tests/).

- The two original runs behind "614 passed": exact commands (only the flag-off run used `-x`), `rc=0` lines and the environment.
- A verbose rerun of each, with JUnit XML and a provenance JSON per flag (command, commit, exit code, packages).
- `*.log` is git-ignored, so the logs were force-added.
- **After adding the known-failure tests** (`c1a0e56`): **620 passed, 6 xfailed, exit code 0** with the flag off, and the same with it on (`validation/tests/rerun_with_known_failures/`).

### 8.5 Full-match exchange-trigger audit (IMG_4809, default decoder)

**Evidence:** [full-match-exchange-audit-20261103/](../../workers/football-cv/bench/results/5.3/full-match-exchange-audit-20261103/).

**Run:**

- The production full-match path, `bench/full_match_benchmark.py`: discovery, 7 stage-1 chunks of 300 s, then resolve. Default `cv2` decoder, automatic mode.
- Run at `49ec8f0` through `bench/full_match_exchange_audit.py`. Engine code is identical to the candidate `93258f7`.
- The wrapper records every steal row and every row where `exchange_rows` fires: in **shadow mode** for the baseline (computed, never applied) and **applied** for the candidate.

**Baseline vs candidate:**

- The candidate reused the baseline's discovery and stage-1 chunks, which the checkpoint store verified. It also reused the baseline's OCR cache: reads are deterministic per crop, and new crops are read fresh.
- Only resolve differs.

**Timing (not a performance measurement):**

- Baseline stages on this 2-vCPU container: discovery 2,532 s, stage 1 about 8,280 s, resolve 775 s.
- The run was interrupted once at a background time limit and resumed from checkpoints, so `timingComplete=false`.
- The candidate resolve took 149 s because it reused the OCR cache.

**Where the rule fires:**

- **35 mutual-exchange events (70 rows) in 34 minutes.** 69 rows are new (not already steals).
- They are spread over the match, with no cluster.
- The two splitter calls during resolve list the same 35 events in both runs.

**Does the target's identity path pass through any exchange?** **No.**

- In both runs, no claim between 1 s before and 3 s after any event lies on either involved player's rows (IoU < 0.3 for all claims).
- 4 events (8 rows) have target claims within ±5 s: 1151.1, 1152.6, 1187.9 and 1374.1 s. Those claims are identical in both runs.

**Correction (§9.2): the comparison below was confounded.** The candidate run started from the baseline's finished OCR cache, and that warm cache alone produces all 36 differences. The real cold-cache candidate keeps the 8 confirmed frames. The original text is kept for the record.

**But the candidate still changes claims elsewhere, non-locally.** 36 claim frames differ, and **all of them are more than 5 s from every exchange event**. Traced with `scripts/trace_full.py`: the tracklets carrying these claims are **identical** in both runs. What changes is the identity solver's global choice. Its appearance classifier and chain are fitted over the whole match, so 69 extra cuts elsewhere shift its training set and scores.

- **706.4–716.4 s, 28 LIKELY / appearance frames, removed by the candidate.**
  - Visually reviewed: the claimed player wears **#6** ("6" legible). OCR read "6" twice at confidence 1.00 on that tracklet.
  - So the baseline makes **28 wrong-player claims** here, and the candidate removes them by accident, not by design.
  - Lone digits are ignored by `identity.incompatible_with_target`, a deliberate rule, because the OCR misreads lone digits on "20". So conflicting-number abstention cannot protect against a one-digit shirt.
- **1161.1–1162.8 s, 8 CONFIRMED frames on #20 (labelled interval 1150 s), weakened by the candidate.**
  - 2 claims are dropped and 6 are downgraded to LIKELY/anchored.
  - Correct frames go 241 → 239, confirmed-correct 18 → 10.
  - **This is a legitimate identity lost** (confirmation) through the same global effect. The candidate's interval-level "no loss" result **does not hold at full-match scale**.

**Full-match claims, baseline** (default decoder, flag off): 453 claim frames in 14 segments; review in `claim_segment_review.json`.

- Wrong attribution is counted only when another player's number is legible. Correct attribution is counted only with a legible "20" or a T label. Everything else is unverified.
- **Verified wrong-player: 42 LIKELY frames, 0 confirmed:**
  - 28 on #6 at 706–716 s (unlabelled; new);
  - **11 on #17 at 1301.6–1305.7 s** (labelled N; "17" legible; new — the interval-only run abstained here);
  - 3 from P at 244.5–244.7 s (under the proposed label corrections).
- Verified correct: the labelled frames at 225 s and 1150 s, and "20" legible at 1955.5 s.
- **Unverified:** 141 claim frames at 1180–1190 s, 1378–1387 s, 1584–1585 s, 1943.9 s and 1955–1963 s, mostly front views without a legible number.

**Labelled intervals scored from the full-match run** (verified basis; `scores_full_{orig,corr}.json`):

| Run | Labels | Correct / 502 | Confirmed + likely | Wrong (confirmed) | Unmatched | "?" | Abstained |
|---|---|---|---|---|---|---|---|
| Interval runs (reference point) | corrected | 298 | 24 + 274 | 3 (0) | 4 | 3 | 200 |
| Full match, baseline | corrected | 263 | 24 + 239 | 14 (0) | 3 | 3 | 234 |
| Full match, candidate | corrected | 261 | 16 + 245 | 14 (0) | 3 | 3 | 236 |

- At 225 s the full-match run abstains much more than the interval run: 22 vs 57 correct (corrected labels).
- At 1295 s the full-match run claims #17 (11 wrong) where the interval run abstained.
- Interval runs therefore **do not predict full-match behaviour** of the default decoder, in either direction.

**Conclusions for the candidate:**

- It is **not on the target's path at any of the 35 full-match exchanges**. The mechanism it repairs (E1) did not occur on the default decoder in this match.
- At full-match scale its net effect comes **entirely** from global identity-solver side effects: −28 wrong-player LIKELY frames (on #6) and −8 CONFIRMED-correct frames.
- Neither effect is explained by the rule's design. Neither is a reliable property of the candidate: both would move with any other perturbation of the tracklet set.
- **Keep `SCOUTX_EXCHANGE_SPLIT` off by default.** The candidate stays a narrowly validated fix for a reference-rendering failure, nothing more.

**What the audit shows about the default decoder:**

- Its full-match wrong-player claims are **all LIKELY / appearance** (or anchored after P). The known cases are a one-digit shirt (#6), a legible-but-unread "17", and the P transfer.
- **No verified confirmed wrong-player claim** was found on the default decoder in the full match. The 0 confirmed is a count over reviewed frames, not a proof.


## 9. Full-match identity: replays, the confounded comparison, candidate B (2026-11-03 evening)

**Evidence:** [full-match-identity-20261103/](../../workers/football-cv/bench/results/5.3/full-match-identity-20261103/).

**Failure inventory:** `failure_inventory.json` links E1, P, E3, E4, F6 (#6), F17 (#17) and the 1161 s change to:

- provenance and source frames;
- counts of reads, events, frames and states;
- traces and replays;
- status and uncertainty.

**Review packet:** `identity-review-packet-20261103/` holds a tool and an item list for a genuinely independent reviewer. There are no images in git, and no predictions or reasons are shown to the reviewer. **Nobody independent has reviewed it yet.**

### 9.1 Whole-match replay (`bench/full_match_replay.py`)

**What it keeps:** all 7 stage-1 chunks (numbers only, about 60 MB, kept locally; hashes in `full_match_replay_provenance.json`), crop names, every OCR read, and the discovery sightings.

**What it runs:** the real `analyze` over the whole match, exactly as `full_match_benchmark.py` calls it. Whole-match appearance training, normalisation, candidates and the solver all run unchanged.

**Reproduction:**

- The baseline full match is reproduced **bit for bit** (timeline `fad444c1…`).
- A repeat run is bit-identical, including every identity-solver term dumped per pass. **There is no nondeterminism.**
- The warm-cache candidate run is also reproduced bit for bit (`27503d1a…`).

**Boundary:**

- OCR inference is not exercised. Crops the original never read are answered with no text (counted).
- Real-OCR runs settle such cases. For the cold-cache exchange candidate, the real run (`x1c`) **equals the replay bit for bit**: 23 new crops, no effect.

### 9.2 Nonlocal changes: the 2026-11-03 comparison was confounded

| Comparison (default decoder, full match) | Claim frames | Confirmed | Differing claim frames |
|---|---|---|---|
| Baseline, cold cache | 453 | 42 | — |
| Baseline, **warm** cache (flags off) | 423 | 34 | **36** (identical to the reported candidate difference) |
| Exchange candidate A, warm cache vs baseline warm | 423 | 34 | **0** |
| Exchange candidate A, **cold** cache (real OCR, `x1c`) | 429 | **42** | 32 |

**The warm cache, not the candidate, caused the reported changes.** That includes the −8 confirmed-correct frames at 1161–1163 s.

**Mechanism:**

- Tracklets are split where shirt numbers conflict, using the reads present when tracklets are built.
- A warm cache also contains the earlier run's refinement-pass reads.
- The tracklet carrying the "20" read is then split differently (positive 1161.3–1162.2 s instead of 1161.1–1162.8 s).
- **This cache-state sensitivity is real pipeline behaviour.** Re-analysing a match with a populated cache gives different identity results. It has a characterisation test and a strict xfail (`tests/test_full_match_identity.py`).

**What candidate A really changes (cold cache, real OCR):**

- **−28 LIKELY frames on #6** (verified wrong).
- **+4 LIKELY frames at 1881.3–1883.6 s** (side views; unverified).
- Confirmed frames unchanged (42); labelled-interval scores identical to the baseline.

**Mechanism of the #6 change** (`comp_dump.py`, `tl_dump.py`):

- The #6 claim is marginal: chain tracklet 8453, confidence **0.753 against the 0.75 LIKELY threshold**. It is LIKELY only on frames where no competitor scoring ≥ 0.35 is in view.
- In the baseline, the nearby player #17 (tracklet 6750, 705.5–719.3 s) carries a "17" read (0.98, at 716.6 s). It is therefore **excluded** ("shows #17") and is not a competitor.
- In candidate A the same tracklet has **no reads**, so it becomes a competitor (score 0.521), and every #6 frame becomes AMBIGUOUS.
- **Inference, not directly traced:** the tracklet is identical in both runs, so the initial dense crop selection should be identical too. The "17" read must therefore come from the refinement pass, whose focus is driven by global solver state.
- Appearance training is **identical** in both runs: template mode, the same 3 positive spans (241.3–242.4, 1161.1–1162.8, 1954.9–1956.6 s), 63 vs 62 negatives, 2,693 vs 2,745 candidates.
- **Verdict:** legitimate global sensitivity, not nondeterminism, leakage or an implementation defect. But it means the #6 removal is **not a property** of either candidate.

### 9.3 Full-match failures F6 (#6) and F17 (#17): first unsupported transition

**F17 (1301.6–1305.7 s):**

- "17" is legible to a person on 5 of 6 sampled crops.
- **OCR read nothing on all 34 crops** of that tracklet. Re-running the reader from scratch gives the same result.
- `_digit_box` never isolates a two-digit region on this shirt (PARSeq/EasyOCR candidates "I", "a", ","; "1", "4"). The scene-text fallback also returns nothing.
- With no read, there is no exclusion, and appearance alone gives LIKELY (score 0.533).
- **The first failure is OCR region proposal / recall, not identity logic.** No narrow identity fix is justified. An OCR change would need its own labelled number-crop evaluation and would invalidate every saved OCR cache.

**F6 (706.4–716.4 s):**

- Appearance-only LIKELY at confidence 0.753, on a tracklet with lone-digit reads "6" ×2 (1.00), "5" and "1" ×3.
- **A lone-digit exclusion rule is rejected on evidence.** Over the whole match, 46 tracklets carry ≥ 2 agreeing high-confidence lone digits that are not in "20". These include #20's own tracklets: "4" ×2 at 1151.9–1153.2 s, "1" ×3 at 1154.5–1160.8 s, "7" ×2 at 1168.2–1190.3 s, and "4" ×3 just before a confirmed "20".
- Tuning the 0.75 LIKELY threshold is out of scope.
- **F6 stays unrepaired**, with a characterisation test and a strict xfail.

### 9.4 Candidate B: pause-and-resume split (`d061d8c`, `SCOUTX_RESUME_SPLIT`, off by default)

**Contract:**

- After a steal (thief track X takes victim Y's box while Y is paused), Y's first row after its pause, within the steal look-ahead (3 frames), is cut and linked like a steal **if**:
  - it fits X's motion-extrapolated path better than Y's own by `STEAL_LEAD`, **or**
  - it does not continue Y's own extrapolated path (IoU < `STEAL_IOU`).
- No new thresholds. Identity crosses only when appearance decides it.
- At P neither extrapolation fits the resumed box (IoU 0.09 and 0.15: the boxes are distorted by the overlap), which is why the second condition exists.

**Real-OCR results:**

| Run (default decoder) | Change vs baseline |
|---|---|
| Interval 225 s (fresh caches; stage 1 bit-identical) | **only frames w194–197 change**: LIKELY on player A → AMBIGUOUS. No new claim, no lost correct frame. Original labels: correct 60 → 57 (the 3 "correct" frames were the swapped labels). Corrected labels: wrong 3 → **0**, correct 57 → 57, abstained 7 → 11. |
| Interval 1800 s | claims unchanged (0) |
| Other 7 default intervals and all 9 HLG-reference intervals (replay screen; no new crops) | no change at all |
| Full match (cold, real OCR, `x2c`) | **32 resume cuts** (about 1 per minute); 2 on the target's path |

**Full-match changes in detail:**

- **244.4–244.7 s:** 4 LIKELY frames on player A removed. **P fixed.**
- **706.4–716.4 s:** the 28 #6 frames removed again. This is the same marginal-claim sensitivity as for A, not traced separately.
- **1188.6–1191.5 s, a crowded corner/set piece:** the target's path changes **from one orange player to another**. Base and B LIKELY/anchored boxes differ by about 40 px; 16 frames change box and 14 are newly claimed (30 total). Both paths are **unverifiable** (small players, no legible number). They are review items J1/J2.
- Confirmed frames unchanged (42). Labelled intervals under corrected labels: wrong 14 → 11, correct unchanged, abstained +4.

**Unlabelled independent clips** (pre-registered protocol `candidate_B_validation_protocol.json`, written before the runs; default decoder, real OCR):

- IMG_4529 (two clips) and IMG_5105 3:00–3:30: 0 claims, the same as the baseline.
- **IMG_5105 0:00–0:30: B adds 2 LIKELY / appearance claims (27.2–27.3 s)** on a distant orange player, about 45 px tall, in contact with an opponent.
  - The baseline was rerun at the current code: 0 claims, identical to the earlier baseline.
  - Under the protocol (#20 is absent from IMG_5105 near the camera) these count as **false attributions**.
  - The only resume cut in that clip is at 15.4 s, elsewhere in the frame. So this is another **non-local** solver effect, not the cut itself.
  - This clip is now **development data** for B.

**The replay screen overstated B:**

- With 23 never-read crops answered as empty, the replay showed B following #20 through 193–224, with 25 "?" claims.
- Real OCR on those crops (for example "24" on another player) leaves B **abstaining** instead.
- Replays without OCR are screens. Only real-OCR runs are reported as results.

### 9.5 Tests

**Suite results:**

- **626 passed, 9 skipped, 6 xfailed, exit code 0** with flags default, A only, B only and A+B (`full-match-identity-20261103/tests/suite_{default,A,B,AB}.log` + provenance). A first A-only run failed one B unit test: the synthetic scene is also an exchange, so A cut it. The test now pins A off; the failed log is kept.
- New tests:
  - `tests/test_resume_split.py`: synthetic transfer, own-path continuation, no steal, flag off, unclear link, and the P replay with B (it asserts 23 never-read crops as the replay boundary).
  - `tests/test_full_match_identity.py`, **opt-in** with `SCOUTX_FULL_MATCH_REPLAY`: exact reproduction and repeatability, the legitimate confirmed #20 at 1161 s, F6, F17 and cache-state characterisation, plus 3 strict xfails. **6 passed, 3 xfailed** (`tests/optin_full_match.log`; the first attempt failed on a wrong time span in the F17 test and is kept as `optin_full_match_first_attempt.log`).
- The known-failure replays pin both flags to their defaults.

### 9.6 Verdicts

**Candidate A (exchange split, `93258f7`): experimental.**

- It repairs E1 on the HLG reference only.
- On the default decoder it never touches the target path in the full match. Its full-match side effects (−28 wrong #6 frames, +4 unverified LIKELY frames) are not caused by its rule.
- It stays off.

**Candidate B (resume split, `d061d8c`): experimental — needs revision before further validation.**

- It repairs P in real runs and loses no labelled correct frame or confirmed frame.
- But it:
  - **changes one unverifiable crowded identity path** (30 LIKELY frames);
  - **adds 2 false LIKELY claims on independent footage** (IMG_5105), through a non-local effect.
- No confirmed claim changed anywhere, so the protocol's confirmed-claim rule is not triggered. It is still not a demonstrated improvement.
- It stays off.

**What the evidence points to.** Both candidates mainly reveal one fragility: marginal **appearance-only LIKELY claims** (#6 at confidence 0.753 against 0.75, the IMG_5105 claims, the crowded path) flip whenever any tracklet changes anywhere in the match. Narrow tracklet fixes cannot be judged until that fragility is understood. Thresholds must not be tuned to hide it.

**Still unrepaired:** E3, E4, F6, F17, and cache-state sensitivity.

## 10. Cache equivalence and appearance-only acceptance (2026-11-03, late)

**Evidence:** `full-match-identity-20261103/night/`.

**Flags:** all candidate flags stay **off** by default (`SCOUTX_EXCHANGE_SPLIT`, `SCOUTX_RESUME_SPLIT`, and C and D below). The default decoder, thresholds and safeguards are unchanged.

### 10.1 Why warm and cold caches differ (traced)

**Where the cache enters:**

- `run_ocr` returns the **whole** `ocr_cache.json`.
- `analyze` then used **every** entry as first-pass evidence: for the number-conflict tracklet splits (`det_reads`) and for the identity reads.

**What a warm cache leaks in:**

- The entries include reads that the **previous run's refinement passes** stored: crops this run's first pass never selected.
- A cold run only sees those reads later (refinement adds them to identity reads), and **never** in the tracklet splits.

**What does not differ:**

- Scheduling, ordering and crop selection are the same. Crop selection depends only on tracklets.
- Early-stop consults crops in the same order with the same values.
- With no budget (full-match path), every selected crop is read either way.
- Only **evidence attachment** differs.
- With an OCR budget or `max_new` (deferred OCR), a warm run can still consult more of its selected crops. That is intended progressive behaviour and is documented, not changed.

### 10.2 Candidate C: `SCOUTX_OCR_CONSULTED_ONLY=1` (`86ec1db`, off)

**Contract:** the first pass uses only the crops it selected **and consulted** (`run_ocr(..., consulted=set)`). Refinement passes already use only their own crops. **A cache saves time and never adds evidence.**

**Results:**

| Check | Result |
|---|---|
| Full match, cold, C | **bit-identical** to the baseline (`fad444c1…`) |
| Full match, warm with the baseline's final cache, C | **bit-identical** to the cold baseline (no crop needed reading) |
| Full match, warm with the union of all runs' caches, C | **bit-identical** to the cold baseline |
| 18 interval replays (9 × 2 decoders), cold, C | identical to the originals |
| `default_i0225` with two foreign "17" reads injected into the cache | C: identical to cold. Flag off: the outcome changes (characterisation test). |

**Scope:**

- Cold runs are unaffected by construction, so all earlier cold comparisons stand.
- Replays are exact for C because cached crops need no OCR.

**Verdict: supported for further validation.** It is the precondition for interpreting any full-match change. Making it the default is a separate decision that needs your approval, because it changes reruns that start with a warm cache.

### 10.3 Appearance-only acceptance: why the system positively assigned #20

**The acceptance path for a chain member without hard evidence** (evidence "appearance": not number, anchored or interpolated):

1. **Appearance score.** In full-match template mode the template is the duration-weighted mean signature and embedding of the **positives**. A member's appearance is `app = 1.2·z − 0.3`, where `z` is its similarity to that template, **z-scored against all ~2,700 orange candidates**. It is a **relative** score: "more template-like than the average team-mate", not "is #20".
2. **Chain choice.** The solver picks one chain through the match from the same appearance terms.
3. **Chain bonus.** For a chain member, `confidence = sigmoid(app·rel)`, which is **+1 logit** over its standalone score `sigmoid(app·rel − 1)`. Chain membership counts as evidence, yet it was chosen from the same appearance score.
4. **LIKELY** when confidence ≥ 0.75 and no non-chain competitor scoring ≥ 0.35 is in view.

**The three cases:**

| Case | Positives behind the template | Standalone score | Chain confidence | Why LIKELY |
|---|---|---|---|---|
| #6, 706–716 s | 3 number tracklets (about 5 s in total) | 0.528 | 0.753 | the chain bonus lifts a coin-flip score past 0.75, and no competitor is in view (#17 excluded by its "17" read) |
| #17, 1301–1306 s | the same 3 | 0.533 | 0.757 | the same; OCR missed "17", so there is no exclusion |
| IMG_5105, 27.2–27.3 s (with candidate B) | **none**: no "20" read or sighting in the clip, so the template falls back to **the 5 most orange, longest tracklets** (`identity.py:299`) | — | 0.856 | **there is no target evidence at all.** Without B, a competitor (0.39) kept it AMBIGUOUS; B's cut elsewhere removed the competitor. |

**Measured on every labelled IMG_4809 frame** (`evidence_outcomes.json`; default full match, default and HLG-reference interval runs; original and corrected labels):

- Appearance-only LIKELY claims: **0 correct, 19 wrong-player, 12 unmatched.**
- Every correct claim came from number (CONFIRMED), anchored or interpolated evidence.
- Appearance does carry some signal: AUC 0.80 for labelled #20 vs not-#20 tracklets (16 vs 112). But at the LIKELY operating point, 3 #20 and 2 non-#20 tracklets would pass. That is too few, and too mixed, to support a positive identity claim.

**The first unsupported transition** in #6, #17 and IMG_5105 is therefore step 3: LIKELY granted to a chain member **whose only support is relative appearance**, including the case with **zero** positives. OCR's miss on "17" only removed a safeguard.

### 10.4 Candidate D: `SCOUTX_APPEARANCE_ONLY_LIKELY=0` (`86ec1db`, off)

**Contract:**

- Frames whose evidence is "appearance" are at most AMBIGUOUS.
- Number, anchored and interpolated claims are unchanged, and so are thresholds and identity resolution.
- It acts in `frame_states` only, so the effect is **local**: no tracklet, OCR or solver change, and therefore no non-local side effects.

**Results:**

| Run | Effect |
|---|---|
| Full match, default (cold) | 55 frames LIKELY → AMBIGUOUS, all with "appearance" evidence: **39 verified wrong** (#6 ×28, #17 ×11), **16 unverified** (1378–1387 s, 1584–1585 s, 1943.9 s), **0 verified correct**. Confirmed frames 42 = 42. Presence and evidence are identical. |
| 9 default intervals | no change (they contain no appearance-only claims) |
| 9 HLG-reference intervals | wrong 26 → 18 (E3's 8 removed), unmatched 26 → 14, correct unchanged (286), abstained 181 → 197 target frames |
| IMG_5105 0:00–0:30 with B (+D) | 2 → 0 claims |
| Full match B + D vs B | 27 more appearance frames removed. **B's crowded-path change (anchored) remains.** |

**Cost:**

- The 16 unverified frames may include correct #20 claims. They are review items F, G and H.
- No labelled correct claim is lost.
- This is a narrow removal of one evidence class that labelled data shows is never right. It is **not** blanket abstention: 398 claim frames remain.

**Verdict: supported for further validation.** The 16 unverified frames must be reviewed independently before any default change.

### 10.5 Test accounting

**Every suite run now writes JUnit XML**, and `bench/test_accounting.py` lists every skipped, xfailed or xpassed test with its reason (`tests_night/accounting.json`).

**The previously reported "9 skipped"** were exactly the 9 opt-in whole-match tests in `tests/test_full_match_identity.py`. They skip unless `SCOUTX_FULL_MATCH_REPLAY` points to the local whole-match replay, which is about 60 MB and not in git. So in those runs **nothing about the whole match was validated**.

**The 6 expected failures** are strict xfails for the unrepaired known failures P, E3 and E4, each with the exchange flag off and on.

**Tonight's runs** (`tests_night/`, commit `bad5617`, Linux, Python 3.13.17, CPU):

| Run | Result | Not validated in this run |
|---|---|---|
| default flags | 633 passed, **11 skipped**, 6 xfailed, exit code 0 | the 11 skips are all the opt-in whole-match tests; the 6 xfails are P, E3 and E4 (×2 exchange flag) |
| default + `SCOUTX_FULL_MATCH_REPLAY` | **641 passed, 0 skipped, 9 xfailed**, exit code 0 | xfails: P, E3, E4 (×2), F6, F17, cache state. The C and D whole-match tests pass. |
| A only / B only / C only | 633 passed, 11 skipped, 6 xfailed, exit code 0 | as for the default run |
| D only, first attempt | **1 failed** | `test_tracking_v3::test_states_partition_and_competitor_makes_ambiguous` asserts the **default** contract (appearance-only frames can be LIKELY), which D deliberately changes |
| D only, after pinning that test to the default contract | 633 passed, 11 skipped, 6 xfailed, exit code 0 | — |

- D contradicts the documented `LIKELY_VISIBLE` definition in `states.py`. Promoting D would require changing that contract on purpose. The failed log and JUnit file are kept.
- `accounting.json` lists every skipped and xfailed test by name and reason.

## 11. Candidates C and D: separate and combined validation (2026-11-04)

**Status:** validation only. C, D and the new E stay **off by default**. A and B are off throughout this section. The default decoder, every threshold and safeguard, `productionApproval=false` and the pinned GPU baseline `51d41c9…` are unchanged. Nothing was deployed, uploaded or launched. These CPU findings **do not** resolve the original GPU accuracy gap.

**Evidence:** `bench/results/5.3/cd-validation-20261104/`. **Contracts:** [identity-contracts-C-D-2026-11-04.md](identity-contracts-C-D-2026-11-04.md).

**Source:** frozen at `13a5174` for every replay (C and D from `86ec1db`); E and the tests at `ed2b242`.

### 11.1 Contracts (Phase 1)

The contracts doc defines, for each candidate:

- C's selected / consulted / cached / accepted observations;
- which evidence each pass consumes;
- legitimate budget differences;
- D's evidence-to-state table;
- which outputs may attribute in each state.

Every mismatch is recorded as its own defect, DEF-1 to DEF-8. **Neither implementation was broadened.**

**Is an appearance model trained from number evidence enough to qualify a new tracklet?** **Not established.** On labelled data, appearance-only LIKELY claims were 0 correct, 19 wrong, 12 unmatched. With zero positives, the template is built with no target evidence at all (DEF-8).

### 11.2 Whole-match four-way matrix (fresh caches; warm = the baseline's own final cache)

| Config | Cold claims / confirmed | Warm claims / confirmed | Cold = warm? | Timeline |
|---|---|---|---|---|
| baseline | 453 / 42 | 423 / 34 | **no** (124 states differ) | cold `fad444c1` = original |
| C | 453 / 42 | 453 / 42 | **yes, bit-identical** | `fad444c1` |
| D | 398 / 42 | 396 / 34 | **no** | `ebd6231f` / `f036885d` |
| C+D | 398 / 42 | 398 / 42 | **yes** | `ebd6231f` |

**Interaction: none beyond composition.**

- C acts on evidence input (first-pass reads). D acts on the output state of one evidence class.
- C+D cold equals D cold, and C+D warm equals C+D cold.
- **D does not fix cache sensitivity.** D warm still loses 8 confirmed frames. Only C does.

**Downstream (full-match result.json):**

| | baseline | C+D |
|---|---|---|
| Likely-visible seconds | 41.1 | 35.6 |
| Moments | 4 | 4 |
| Events | 2 | 2 |
| Owner review questions | 8 | 8 |

Physical metrics are None in both (uncalibrated).

### 11.3 Reconciling D's 39 removed wrong-player frames with the earlier 42 (from the data, `reconcile_42.json`)

| Group | Frames | Evidence | Baseline state | Under D |
|---|---|---|---|---|
| #6, 706.4–716.4 s (legible "6", unlabelled) | 28 | appearance | LIKELY | AMBIGUOUS |
| #17, 1301.6–1305.7 s (original N labels) | 11 | appearance | LIKELY | AMBIGUOUS |
| P, 244.5–244.7 s | 3 | **anchored** | LIKELY | **LIKELY (unchanged)** |

- 28 + 11 + 3 = 42. D removes 39.
- The 3 P frames are wrong **only under the proposed (unreviewed) label corrections**. D does not touch anchored evidence by contract.
- The #6 group is the author's judgement (legible 6) and is in the independent review packet.

### 11.4 Intervals and clips (cold and warm per config; scores on the verified time basis)

**9 default intervals** (502 target frames; corrected labels in brackets):

| Config | Correct (conf / likely) | Wrong | Unmatched | ? | Abstained |
|---|---|---|---|---|---|
| baseline cold, C, D, C+D (cold and warm) | 301 [298] (24 / 277) | 0 [3] | 4 | 3 | 200 |
| baseline warm, D warm | **267 [264] (16 / 251)** | 0 [3] | 3 | 3 | 234 |

- Warm without C loses 32 correct frames at 225 s, where first-correct delay goes from 0.1 s to 3.4 s, and 2 at 1150 s.
- D has **no effect** on the default intervals: they contain no appearance-only claims.

**9 HLG-reference intervals (experimental diagnostic):**

| Config | Correct | Wrong (confirmed) | Unmatched | ? | Abstained |
|---|---|---|---|---|---|
| baseline / C (cold = warm) | 286 [289] | 26 [22] (18 [14]) | 26 | 66 [67] | 181 |
| D / C+D (cold = warm) | 286 [289] | **18 [14]** (18 [14]) | **14** | 66 [67] | 197 |

- D's effect is all at 225 s: 8 wrong and 12 unmatched claims → abstained (E3). Acquisition delay is unchanged (4.0 s).
- The remaining wrong frames on the reference are all **CONFIRMED** (number evidence), which D does not touch.

**Negative and other clips** (clip windows IMG_5105 p00000 and p00180, IMG_4529 p00960 and p01440): **0 claims in all 8 configs** (with A and B off).

**Replay caveat:**

- Warm interval replays of the baseline and of D needed 46 crops that the original runs never read. They were served as "no text" (cold, C and C+D needed none).
- Those two rows approximate a real warm run. The full-match warm rows needed 25 such crops.

### 11.5 Cache edge cases (Phase 3; `tests/test_ocr_cache_edge_cases.py`, deterministic doubles: fake reader, fake clock)

**Tested:**

- empty vs full cache;
- partial cache and cached "no text";
- interrupted then resumed run (equal to cold);
- work-count budget (deterministic; warm covers more **selected** crops);
- wall-clock exhaustion exactly at a hit/miss boundary;
- pass order and selection;
- colliding ids (DEF-2b);
- stale reads after chunk re-extraction (DEF-2);
- truncated or malformed cache (DEF-3);
- atomic writes.

Real-OCR integration is covered by the replays above (real cached reads) and by `test_ocr_cache_equivalence`.

**Fixed narrowly:** **DEF-3a**, non-atomic cache writes, now temp file + `os.replace`. Outputs are unchanged: every cold replay stays bit-identical.

**Candidate E** (`SCOUTX_OCR_CACHE_PROVENANCE=1`, off; `ed2b242`): per-chunk provenance tags in a sidecar file, and a tolerant load.

| Whole-match check | Result |
|---|---|
| E cold | bit-identical (`fad444c1`) |
| E warm with the legacy baseline cache (no sidecar) | bit-identical. **Every legacy entry is dropped**, so the first E run is a full cold OCR. |
| E alone, warm with its **own** cache | `621ab26d`, **exactly the baseline warm leak**. E is not a substitute for C. |
| C+E, warm with E's cache | bit-identical, 0 image reads |

**Gaps not covered by E:** model-weight provenance, and concurrent writers.

### 11.6 Downstream attribution (Phase 4)

Every consumer was traced (contracts doc, last table).

**Under D, AMBIGUOUS frames never reach** metrics, ball events, moments/highlights, off-ball observations or heatmaps. The functions layer rejects them. The app shows them as unsure.

**Owner review:**

- Review questions are unchanged (candidates stay askable).
- An `anchor` (CONFIRMED) only comes from an explicit owner "yes".
- New test `test_attribution_boundary_under_D_ambiguous_frames_never_reach_attributing_outputs` checks this.

**Pre-existing state-blind consumers** (not in the API): the local CLI renderer and contact sheet (DEF-5), and legacy `stats.compute_stats` (DEF-6).

**Compatibility:**

- No schema change and no migration.
- Stored results keep their states until a job is resolved again.
- No migration or re-resolve was executed.

**App tests were not run:** no app code changed.

### 11.7 Independent review (Phase 5)

**Packet v2:** `identity-review-packet-20261103/items_v2.json`.

- 25 neutral, shuffled items (231 boxes).
- Context frames are shown with nothing drawn on them.
- Controls with known answers are mixed in.
- The rubric is target / other / uncertain + legible number + uncertainty type + notes.
- Stage 2 asks about the proposed corrections only after the stage-1 answers are committed.
- The private mapping is in `identity-review-private-20261104/`, sha256 `ee9004d3…`.

The images were built locally and **not** committed, sent or uploaded.

**Status: PENDING.** No independent reviewer was available. **Still unresolved:**

- the label corrections;
- D's 16 unverified frames;
- the B set-piece paths;
- the anchored continuations;
- the remaining wrong / unmatched / ambiguous cases.

### 11.8 Tests (Phase 6)

**Run details:**

- **Command:** `env $(cat env.txt) <flags> python3 -m pytest -q -p no:cacheprovider --junitxml=<run>.xml tests` (in `workers/football-cv`).
- **Source:** `ed2b242` (the E-pin rerun at `3d22993`, and the proposal runs with the patch below applied).
- **Environment:** Linux, Python 3.13.17, CPU, `cpu-onnx` settings.
- **Evidence:** logs, JUnit and `accounting.json` are in `cd-validation-20261104/tests/`.

| Run | Flags | Result | Exit code |
|---|---|---|---|
| default | none | 646 passed, 11 skipped, 6 xfailed | 0 |
| opt-in | `SCOUTX_FULL_MATCH_REPLAY` | 654 passed, 0 skipped, 9 xfailed | 0 |
| C | `SCOUTX_OCR_CONSULTED_ONLY=1` | 646 / 11 / 6 | 0 |
| D | `SCOUTX_APPEARANCE_ONLY_LIKELY=0` | 646 / 11 / 6 | 0 |
| C+D | both | 646 / 11 / 6 | 0 |
| C+D opt-in | both + replay | 654 / 0 / 9 | 0 |
| E, first attempt | `SCOUTX_OCR_CACHE_PROVENANCE=1` | **3 failed** | 1 |
| E, after pinning E off in three default-contract tests (`3d22993`) | E | 646 / 11 / 6 | 0 |
| default, rerun after the pin | none | 646 / 11 / 6 | 0 |
| C-default proposal applied | none | 647 / 11 / 6 | 0 |
| C-default proposal applied, opt-in | replay | 655 / 0 / 9 | 0 |

**Why E failed on the first attempt:** the 3 tests build caches by hand without a provenance sidecar, and E drops such caches by design. That is the expected E behaviour, not a regression. The failed log is kept as `E_attempt1`.

**Skips and xfails:**

- **Skips (11):** the opt-in whole-match tests. They need the local 60 MB replay, which is not in git.
- **Xfails (6 default, 9 opt-in):** strict, and none was weakened:
  - P, E3 and E4 (×2 exchange flag);
  - in opt-in runs also F6, F17 and the cache-state test. These tests pin today's default flags, so they stay xfail even under C+D.
- **What D and C do in place of those xfails:** the dedicated D whole-match tests (`test_appearance_only_likely`) show D removes F6 and F17, and the C whole-match test shows warm = cold.

**Known-failure replays:**

| Failure | Status under these candidates |
|---|---|
| P (anchored) | unchanged by C and D |
| E3 | removed by D on the HLG reference only |
| E4 | CONFIRMED (number evidence), unchanged |

### 11.9 Verdicts (separate)

| Candidate | Verdict | Basis |
|---|---|---|
| **C** | **ready for a concrete default-change proposal** (11.10) | Fixes DEF-1. Cold runs are bit-identical (full match and 18 intervals). Warm = cold on the full match, the intervals and the polluted-cache test. No labelled frame is lost. All suites pass with the patch. |
| **D** | **supported; not ready to propose** | Removes only appearance-only claims: 39 author-judged wrong + 16 unverified on the full match, 20 wrong/unmatched on the HLG reference. No labelled correct frame is lost. **Before a proposal:** independent review of the 16 unverified frames and of the #6 group, and a deliberate change to the LIKELY contract wording (DEF-4). |
| **C+D** | **no combined proposal** | They compose without interaction (11.2), so each stands on its own evidence. Bundling them would hide D's unresolved review. |
| **E** | **needs revision** | It works as specified, but: the first run after enabling it discards every legacy cache (full OCR cost); model weights are not in the tag; concurrency is untested; and it does not replace C. The atomic-write fix (DEF-3a) is already on unconditionally. |

### 11.10 Proposal: make C the default (not applied; your decision)

**Exact diff:** `cd-validation-20261104/proposal_C_default.patch`. It applies cleanly to `3d22993`. It:

- changes `analyze.py` from `os.environ.get("SCOUTX_OCR_CONSULTED_ONLY", "0")` to `"1"`, and updates the comment;
- adds `test_default_is_consulted_only`.

**Behaviour change:**

- **Cold runs (every first resolve): none.** Bit-identical, `fad444c1`.
- **Warm reruns** (re-resolves, owner-correction resolves, retries on an existing stage-1 store) no longer take earlier runs' refinement reads as first-pass evidence. Instead they behave like a cold run over the same selected crops.
- Budgeted runs still consult extra cached **selected** crops, by design.

**Compatibility:**

- No schema, API, app or functions change.
- Stored results keep their states until the job is resolved again. A re-resolve of an old job can then differ from its last warm result, by moving back to cold-equivalent output.
- No migration is needed.

**Validation done:**

- full match patched-default cold and warm, both `fad444c1`;
- suites 647 / 11 / 6 and opt-in 655 / 0 / 9.

**Not yet validated:** a production-path warm correction resolve on a real job, and GPU runs.

**Rollback:**

- Set `SCOUTX_OCR_CONSULTED_ONLY=0`. Verified with the patch applied: the warm run returns to the old `621ab26d` output.
- Or revert the one-line change.

**Not included:** D, E, deployment, and any change to the pinned GPU baseline.
