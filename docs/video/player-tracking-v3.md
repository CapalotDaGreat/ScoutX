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

## Result on `IMG_4809.MOV` (orange #20, white sleeves)

Automatic only (no answers): number reads excluded 21 look-alike tracklets (#17 ×, #24 ×, …) and
confirmed #20 twice (04:00 shorts number, 32:23); the appearance model was too conservative and
committed to ~1 minute.

After 4 review rounds (39 answers: 11 yes, 28 no, 5–10 seconds each):

| | |
| --- | --- |
| Tracked on camera | 15.8 min of 33:55 (47 %) |
| …confirmed by number / answers | 5.6 min |
| …by appearance + continuity | 10.2 min |
| Distance while visible (estimate) | ~1.2 km, work rate ~74 m/min |
| Top speed (99th pct, estimate) | ~22 km/h; 5 sprints ≥ 20 km/h, 11 runs ≥ 14.4 km/h |
| Ball involvements | 10 (4.7 s on the ball) |

Spot check (developer review of 30 random appearance-only moments): ~18 clearly #20, ~6 too small
to tell, ~6 wrong (3 boxes on an opponent during occlusion — now filtered by a frame-level kit
check — 1 #19, 2 team-mates). Number- and answer-confirmed segments were all correct.
**These are development checks on one video, not an independent accuracy benchmark.**
The existing evaluation protocol (`full-match-validation.md`) still applies before production.

## Run it

Windows, one click: right-click `workers/football-cv/Track-Player.ps1` → *Run with PowerShell*.
It installs the engine once, asks for the video, number and colours, runs, opens the report and
offers the answer loop. Command line:

```powershell
python -m scoutx_tracker track "C:\...\IMG_4809.MOV" --number 20 --kit orange --kit2 white
python -m scoutx_tracker answer "C:\...\IMG_4809_scoutx" 1y 2n 5y      # after looking at the report
python -m scoutx_tracker pick "C:\...\IMG_4809.MOV" --at 4:02            # optional: point at the player
python -m scoutx_tracker track ... --anchor 4:02#3                        # "box 3 at 4:02 is me"
```

Outputs next to the video in `<name>_scoutx/`: `report.html`, `highlights.mp4`,
`who_we_followed.jpg`, `result.json` (all stats, timeline summary, review questions),
`timeline.npz` (per-frame box/speed).

## Limits (stated in the report too)

* Stats cover only the time the player is on camera; nothing is invented off camera.
* Distance/speed come from one uncalibrated moving camera: sideways motion is good, motion
  towards/away from the camera is estimated from player height and damped; treat as ±20–30 %.
* Pass/ball outcomes depend on seeing the ball (small, often missed far away) and are rough.
* Ultralytics YOLO11 is AGPL-3.0: fine for this local tool; check licensing (or swap the detector
  for the existing Apache-2.0 RT-DETR) before shipping it inside a commercial service.

## Next steps

1. App integration: run `scoutx_tracker` in the GPU worker as an async job (stage 1 is ~10× faster
   on an L4), store `result.json`, and render the stats + "Is this you?" cards in the match report
   (swipe yes / not me). The answer loop maps 1:1 to `feedback.json`.
2. Optional vision-model number reader (OpenRouter is already configured in Functions) for
   back-number crops the OCR can't read — every extra number read removes a question.
3. Independent labelled evaluation per `full-match-validation.md` before enabling in production.
