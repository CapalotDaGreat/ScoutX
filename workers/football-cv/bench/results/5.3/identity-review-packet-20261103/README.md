# Independent identity review packet (IMG_4809)

**Status: not reviewed yet.** No independent reviewer was available in this session. The author's own second pass (`label_corrections_i0225.json`, `claim_segment_review.json`) is **not** independent: the author had seen the predictions.

## Who should review

Someone who has **not** read the 2026-11-02/03 PitchProof reports, scores or traces, and who can watch IMG_4809.

## How to build the packet (locally; images never go to git)

```
python bench/review_packet.py --video IMG_4809_proxy_10fps.exact.mp4 \
    --items bench/results/5.3/identity-review-packet-20261103/items.json --out <local folder>
```

This writes, for each item:

- a full-frame context image per frame;
- an enlarged crop per box;
- `answers.csv`, with one row per box to fill in.

## What is shown

**Items of kind `label`** (A, source frames 2441–2464):

- Only the original label boxes are drawn, as neutral `L0`, `L1`… outlines.
- Their T/N/? values are hidden.
- For each box, answer whether it is #20.

**Items of kind `box`** (B–J):

- One neutral box `B` per frame.
- These boxes come from pipeline runs (claims), but no state, score, evidence or run name is shown.
- J1 and J2 are two runs' paths through the same crowded scene, unnamed.

## Answers (`answers.csv`)

- `answer`: `20`, another number (write it in `legibleNumber` if you can read it), `not 20` (no number visible, but clearly a different person), or `unsure`.
- **Do not decide from kit colour alone**, especially in contacts and crowds.
- Write in `notes` what the decision rests on: legible number, continuity from a frame with a legible number, face or hair, or ball possession.

## Returning results

- Commit `answers.csv` to this folder, with the reviewer's initials and the date.
- Only then may the corrections status in `label_corrections_i0225.json` change from "proposed".
- Results are scored with the original labels **and** with the reviewed corrections, reported separately.

## Items

The reasons each item was selected are deliberately **not** listed here, to avoid priming the reviewer. They are in `../full-match-identity-20261103/failure_inventory.json`, which the reviewer should not open until the answers are committed.

| Item | Source frames |
|---|---|
| A | 2441–2464 (label boxes) |
| B | 7064–7114 |
| C | 11611–11630 |
| D | 11802–11903 |
| E | 13016–13057 |
| F | 13786–13872 |
| G | 15844–15851 |
| H | 19439 |
| I | 19549–19629 |
| J1, J2 | 11883–11902, 11883–11914 |

---

# Version 2 (2026-11-04): use this one

Version 1 above is kept for the record. **Version 2 supersedes it.**

## Build

Build it locally. The images never go into git.

```
python bench/review_packet.py --video IMG_4809_proxy_10fps.exact.mp4 \
    --items bench/results/5.3/identity-review-packet-20261103/items_v2.json --out <local folder>
```

The build produces 25 items `R01`–`R25` with one box per listed frame (label items: one per label box), plus `answers.csv` and `RUBRIC.txt`. Boxes from the HLG-reference interval runs are shown on the default-rendered proxy frames: same geometry, different pixel rendering.

## What each item contains

- the box(es) to judge (`<frame>_B0.jpg` enlarged, `<frame>_context.jpg` full frame);
- for most items, **context frames with nothing drawn** (`ctx_<frame>.jpg`, every 0.5 s for 2 s before and after).

Item `L`-boxes are the original label boxes, with their values hidden.

**What is hidden:**

- Item order is shuffled. Ids are neutral.
- Some items are **controls with known answers** (a legible "20", or players labelled as someone else). The reviewer is not told which.
- No state, score, run name, reason or expected answer is shown.

## Rubric (`RUBRIC.txt`; one row per box in `answers.csv`)

| Field | What to enter |
|---|---|
| `answer` | `target` (the player wearing #20), `other` or `uncertain` |
| `legibleNumber` | the number **only if you can read it in that frame** |
| `uncertainty` | `none`, `occlusion`, `crowd/contact`, `small/blurred`, `identity continuity` or `other` |
| `notes` | what the decision rests on |

**Do not force certainty.** If the footage is insufficient, answer `uncertain`.

## Stage 2

**Only after** the stage-1 answers are committed, the coordinator hands over `../identity-review-private-20261104/stage2_corrections.csv`. The reviewer marks each proposed label correction as supported, unsupported or uncertain.

## Reviewer record

Fill this in when submitting:

- name or initials;
- date;
- **independence:** have you read any PitchProof report, score or trace about these frames?
- limitations, for example the display used.

**Not independent:**

- the author of the proposed corrections;
- any agent or person who has seen the predictions.

That includes the AI assistant that built this packet.

## Status

**PENDING.** No independent reviewer is available yet, and nothing has been sent or uploaded. Until review, these stay **unresolved**:

- the proposed corrections;
- D's 16 unverified removed frames;
- the set-piece paths;
- the anchored continuations.
