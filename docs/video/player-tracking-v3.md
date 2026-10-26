# Player tracking v3 — follow one player through a whole match

Date: 2026-10-26. Code: `workers/football-cv/scoutx_tracker/` (new engine, CLI and report),
`workers/football-cv/Track-Player.ps1` (one-click Windows runner),
`workers/football-cv/tests/test_player_tracker.py` (13 synthetic tests).

## Why a rewrite

The v2 worker sampled 2–5 fps, needed three separate shirt-number reads before it would name the
player, and never propagated identity. On the orange #20 recording it confirmed **0 seconds**.
v3 treats the problem the way it actually looks on a sideline phone video:

* the player is a small figure most of the time, the number is readable only in close-ups;
* the phone pans, zooms and walks with the linesman;
* team-mates wear the identical kit (here #17 and #24 were the main look-alikes).

## How it works

| Stage | What it does | Runtime (34-min test video, 2 CPU cores) |
| --- | --- | --- |
| 0 Proxy | 1080p / 10 fps H.264 chunks (keeps numbers sharp, decodes fast) | ~25 min on a laptop (ffmpeg) |
| 1 Extract | YOLO11 people + ball, camera motion (optical flow on background, people masked), body-region colour signature, CNN embedding, close-up crops | ~85 min CPU, run once |
| 2 Tracklets | BoT-SORT-style tracker with camera-motion compensation, proximity matching for fast close-ups, **shirt-colour gate** (no swaps to the other team), post-hoc **purification** (split a tracklet where the shirt colour changes) | 30 s |
| 3 Numbers | Digit localisation (white / dark / contrast maps) + two recognisers (docTR PARSeq, EasyOCR) that must agree; early stop per tracklet | ~10 min first time, cached |
| 4 Identity | Match-wide best chain of tracklets (dynamic programming): number reads (+), other numbers (excluded), user answers, a per-match appearance classifier (positives = proven #20, negatives = proven others or visible at the same moment), physically-runnable gaps only, never two places at once; conservative self-training | 20 s |
| 5 Stats + report | Timeline, speeds (pinhole depth from player height + panned sideways motion), sprints, ball involvements, pass outcome, report.html, highlights.mp4, review questions | 1–3 min |

Re-running with new answers takes ~1 minute because stages 0–3 are cached.

### Human-in-the-loop ("Is this #20?")

Telling apart same-kit team-mates from far away without a readable number is the hard core of the
problem (commercial tools also rely on tagging). v3 asks the user a few yes/no questions about the
segments where one answer changes the most, each with a clear picture. Answers are stored as
time + position (`feedback.json`), so they survive re-tracking, and they train the per-match
appearance model, which improves the rest of the match too.

## Result on `IMG_4809.MOV` (orange #20, white sleeves) — engine 3.1

> Superseded numbers: an earlier draft of this page reported "15.8 min tracked, ~1.2 km".
> Those figures counted appearance-only guesses as tracking and used an inconsistent speed
> estimator. They are withdrawn. The figures below come from the 3.1 engine, and its invariant
> checks pass.

These figures come from the run after 39 review answers (11 yes, 28 no). 33:55 of video was
recorded and treated as match time, because no period corrections were given.

| State (seconds of analysed match time) | |
| --- | --- |
| Analysed (camera on play) | 1864 s; 171 s unobserved (camera pointed away from play) |
| CONFIRMED_VISIBLE: number read or answer within ±4 s | **72.8 s** |
| LIKELY_VISIBLE: appearance plus continuity, not verified | 443.5 s |
| AMBIGUOUS: could be #20 or a team-mate | 988.6 s |
| Not identified | 359.2 s |

Physical figures are **experimental**. They come from an uncalibrated moving camera and are
measured only while the player was validly observed (406 s):

| Metric | Value |
| --- | --- |
| Distance while observed | 373 m |
| Work rate while observed | 55 m/min |
| Peak speed | 24.1 km/h, the highest sprint, consistent with the sprint list |
| Sprints | 1 |

The ball module found 1 contact and 1 pass attempt, with outcome unknown. These figures have not
been validated.

On 47 crops where another player's number is clearly readable (#17, #24 and #19), none are
attributed to #20. Before the number-conflict split and the local-evidence rule, 2 were. Only
3 crops show a certain, readable #20. Of those, the engine catches 1.

**These are development checks on one video. They are not an accuracy benchmark.** The full
audit, performance and cost figures are in `tracking-v3-report-2026-10-26.md`.

## Run it

On Windows, right-click `workers/football-cv/Track-Player.ps1` and choose *Run with PowerShell*.
The script asks for:
- the video;
- the shirt number;
- the kit colours;
- the position (optional);
- the age group (optional; it sets the speed thresholds).

It then runs, opens the report and offers the answer loop. From the command line:

```powershell
python -m scoutx_tracker track "C:\...\IMG_4809.MOV" --number 20 --kit orange --kit2 white --position winger --age-group adult
python -m scoutx_tracker answer "C:\...\IMG_4809_scoutx" 1y 2n 3u 4s   # y=me n=not me u=unsure s=skip
python -m scoutx_tracker undo "C:\...\IMG_4809_scoutx"
python -m scoutx_tracker render "C:\...\IMG_4809_scoutx"                 # refresh highlights after reviewing
python -m scoutx_tracker calibrate "C:\...\IMG_4809_scoutx" --at 14:17   # pitch calibration assistance
python -m scoutx_tracker periods "C:\...\IMG_4809_scoutx" --kickoff 0:45 --halftime 35:10 --second-half 45:00 --fulltime 1:20:30
python -m scoutx_tracker pick "C:\...\IMG_4809.MOV" --at 4:02          # optional: point at the player
```

Results are written next to the video, in a folder named `<name>_scoutx/`:
- `report.html`;
- `highlights.mp4`;
- `who_we_followed.jpg`;
- `result.json` (schema `pitchproof.tracking.v3`);
- `timeline.npz` (per-frame states).

## Limits (stated in the report too)

* No time off camera is ever claimed, and OFF_CAMERA is never emitted automatically.
  Percentages use analysed match time as the denominator, not the player's playing time.
* Only CONFIRMED_VISIBLE time counts as verified. LIKELY_VISIBLE is labelled as unverified.
  On this footage #17 and #20 are often indistinguishable by appearance alone.
* Movement metrics stay experimental until the pitch is calibrated (manual landmarks). Automatic
  calibration is not possible on this footage: fewer than 3 % of frames show two line directions.
* Ball, pass and contact counts are lower bounds and have not been validated.
* Engine 3.2 uses YOLOX (Apache-2.0) and no Ultralytics/AGPL components. See `tracking-v3.2-report-2026-10-27.md`
  for the 3.2 accuracy, speed and calibration findings, which supersede the 3.1 numbers above.

## In the app

The `tracking` tab appears in the analysis report when a tracking document exists. Swipe review
cards answer the questions, and any answer can be undone. Server-side the feature is gated by
`TRACKING_V3_ENABLED` and the existing CV approval gate, and it stays **off** until it is
validated. See the report document for the deployment steps.
