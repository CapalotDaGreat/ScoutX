# Coach review packet, 2026-11-19: owner notes (do not share this file)

Share with the reviewer only: `01_REVIEWER_INSTRUCTIONS.md`, `02_PART_A_answer_sheet.md`,
`04_reviewer_record.md`, `clips/`, and **after Part A is returned** `03_PART_B_SEALED.md`.
Keep this file and `_owner_only/` to yourself. Nothing has been sent to anyone. Claude did not contact a
reviewer and will not fill in or invent any answers.

## Before sharing

- **Answer Q1 in `owner-review-2026-11-18/README.txt` first.** The software's "confirmed" subject in
  IMG_4529 is an orange #20; you have not yet confirmed that this is your player. If the answer is no or
  not sure, do not use this packet: tell Claude, and the text and clip choice will be re-derived.
- Tell the reviewer who the subject is (kit/number/description). Do not say what the software concluded.
- The clips show identifiable people (players, possibly minors). Share only with the person
  reviewing, by a private channel you choose. Ask them to delete the clips afterwards.
- Hand over Part B only after you have received the completed Part A, and keep Part A as received (e.g.
  photo/scan with timestamp) so it cannot be revised after Part B.

## Source and clips

Source: `IMG_4529.MOV` (iCloud Photos, local copy), SHA-256
`cd1f362dbc68ca27e6f689942029cf6b10691544a4fba6d101139961efe15202` (matches
`docs/video/footage-library/inventory-2026-11-17.json`). Original not modified.
Classification: development material (used in designing candidate I); not an evaluation match.

Clips cut with `ffmpeg -ss <start> -t <dur> -i IMG_4529.MOV -an -map_metadata -1 -c:v libx264 -preset
veryfast -crf 22 -pix_fmt yuv420p`. No overlays, audio and metadata stripped. Source time = clip start + clip time.

| Clip | Source start (s) | Duration (s) | Why chosen | SHA-256 (first 16) |
|---|---|---|---|---|
| 01 | 266.0 | 23.8 | confirmed run 274.0–281.8 ±8 s (off-ball sequence, "unmeasured") | 37a6f0924d66598f |
| 02 | 964.7 | 18.6 | confirmed run 972.7–975.3 | c9127099460d7f17 |
| 03 | 1138.3 | 29.7 | confirmed runs 1146.3–1160.0 | 24b1c1dbf63a3147 |
| 04 | 1162.8 | 24.0 | 6-s clip example 1170.8–1178.8 ±8 s (earlier development report e6/all_t4, automatic identity; **not** a confirmed run in the T+D+C+I report) | 6f424716a981ccb9 |
| 05 | 1300.3 | 40.7 | confirmed runs 1308.3–1341.5 (sequences 1308.3–1320.7, 1326.6–1334.6, "mixed") | d967e7857e3aee0e |
| 06 | 1341.0 | 40.6 | confirmed runs 1351.4–1373.6 (sequence 1365.6–1373.6, "mixed") | 983f397289f66f96 |
| 07 | 1426.8 | 21.4 | confirmed runs 1434.8–1440.2 | 845ebc78d74edfaf |
| 08 | 1459.3 | 20.7 | confirmed run 1467.3–1472.0 | 6ef582b771f46e5a |

Clips 01–03 and 05–08 cover all 15 CONFIRMED_VISIBLE runs of the T+D+C+I report (65 s confirmed) with
8 s context each side; overlapping windows were merged (05/06 split at 1341.0 only for the cutting time
limit). Selection bias: every clip was chosen because the software confirmed the subject there, so the
review tests whether the text is justified *by the footage it rests on*. It does not test what the
software missed elsewhere in the match.

## Coaching text provenance

Rendered by the product path (`parseTrackingReport` → `buildCoachInsights` → en locale) at commit 28607fa,
from the IMG_4529 report with `SCOUTX_TELEPORT_SPLIT=1 SCOUTX_APPEARANCE_ONLY_LIKELY=0
SCOUTX_OCR_VARIANT=combined SCOUTX_INTERP_NO_UPGRADE=1` (default `SCOUTX_OCR_CONSULTED_ONLY=1`), no profile
position. Insights produced: positioning_observation, identity_limit, ball_limit, physical_limit
(physical_limit left out of Part B: not a coaching claim). Output: `_owner_only/coach_out_IMG_4529.json`.

- Drill: with no position, `pickDrill('positioning', 'unknown', …)` returns null. A drill appears only when
  a position is set (midfielder/winger/forward → show_for_ball; defender/goalkeeper → build_up_angles).
- Involvement note: not produced. Its guard needs ≥ 120 s confirmed (65 s here) and ≥ 1 confirmed-identity
  ball contact (0 here). Shown in Part B as wording only, labelled as not shown.
- Six-second clip notes: not produced for this report. The whole-match note is used once ≥ 60 s is
  confirmed, and none of the four T+D+C+I sequences is "free" or "tight". The worked example in B6 is from an
  earlier development report and is labelled as such.

## Gates checked against source at 28607fa (kept in force; not changed)

| Gate | Value | Where |
|---|---|---|
| Whole-match off-ball note | ≥ 60 s confirmed (plus opponent measurable) | `workers/football-cv/scoutx_tracker/offball.py:26 MIN_CONFIRMED_SEC = 60.0` |
| Involvement / coaching improvement | ≥ 120 s confirmed | `src/features/match-review/services/coach.ts:117 MIN_CONFIRMED_FOR_COACHING_SEC = 120` |
| Clip note | ≥ 6 s continuous confirmed | `offball.py:29 MIN_SEQUENCE_SEC = 6.0`; server `functions/src/analysis/trackingV3.ts:147 MIN_SEQUENCE_SEC = 6` |

## What to send back to Claude

The completed `02`, `03` and `04` exactly as returned (or photos). Claude will tabulate them verbatim and
record them in the ledger as one reviewer's opinion, with the independence answers from `04`.
