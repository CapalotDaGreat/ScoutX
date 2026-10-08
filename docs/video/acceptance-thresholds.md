# Computer-Vision Acceptance Thresholds — PROPOSAL

**Owner decision required.** These numbers are a proposal, not an approved standard.
Machine-readable copy: `workers/football-cv/eval/thresholds.json` (`"status": "proposed"`). Changing
the file after an approval invalidates that approval (its hash is pinned).

## Identity, availability and reliability (worker approval)

| Metric | Proposed | Rationale |
| --- | --- | --- |
| Videos | ≥ 30 from ≥ 2 annotators | One club or one annotator is not representative; two annotators expose labelling bias |
| Identity accuracy (claimed target keyframes that really are the target, box IoU ≥ 0.5) | ≥ 0.95 | Coaching about the wrong person is the worst failure, so a claim must almost always be right |
| Identity switches per 10 analysed minutes | ≤ 0.5 | A switch silently mixes two players' moments |
| Mean continuous correct run | ≥ 20 s | Very short runs mean the target is lost constantly; reports would be fragmentary |
| Visible-time precision | ≥ 0.90 | "You were visible" must almost never be wrong |
| Visible-time recall | ≥ 0.60 | Missed time is shown as unknown, which is honest, so recall may be lower |
| Likely-off-camera precision | ≥ 0.90 | Must only cover time the player was on the pitch |
| False confirmation rate | ≤ 0.05 | Complement of visible precision, stated explicitly |
| Coverage (analysed / total duration) | ≥ 0.95 | Large unanalysed gaps would be silent omissions |
| Reliability (segments with a complete tracking stage) | ≥ 0.98 | Failures are honest but too many make the feature useless |

## Required difficult-footage slices

Each slice must contain at least the stated number of videos **and** pass identity accuracy, false
confirmation rate and switch rate on its own, so good averages cannot hide a failing condition.

| Slice | Videos |
| --- | --- |
| Occlusion | 5 |
| Camera movement (handheld, pans) | 5 |
| Low light (floodlight, dusk) | 5 |
| Similar kits | 5 |
| Identical numbers on the pitch | 3 |
| Substitution | 3 |
| Off-camera periods | 5 |
| Re-entry after leaving the frame | 5 |

## Events (separate approval)

| Metric | Proposed | Rationale |
| --- | --- | --- |
| Event precision (target only, ±2 s) | ≥ 0.85 | Before `CV_EVENTS_VALIDATED` may be used |
| Event recall | ≥ 0.60 | |
| Mean event timestamp error | ≤ 1.5 s | Evidence must point at the right moment |

The worker has no event stage, so events cannot be evaluated or approved today. No event claim may
be made from the worker.

## Rules

- An unmeasured metric fails. Fewer videos, annotators or slice videos than required fails.
- Passing proposed thresholds is evidence, not approval (`approvable: false` until the owner sets
  `"status": "approved"`).
- Nothing switches on automatically: see `accuracy-report.md` for the approval record that the release
  gate and the runtime verify.

## On-device preflight hints (not thresholds)

`PREFLIGHT_HINTS` in `src/features/match-analysis/services/analysisPreviewService.ts` only decide
when to show a warning; they never block. Short side < 720 px, < 24 fps and < 0.04 bits per pixel per
frame are common points below which jersey numbers become hard to read. They are heuristics, not
measured on PitchProof footage.
