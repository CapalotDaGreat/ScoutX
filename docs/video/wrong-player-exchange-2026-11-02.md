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
