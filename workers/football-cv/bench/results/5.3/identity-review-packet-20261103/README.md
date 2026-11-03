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
