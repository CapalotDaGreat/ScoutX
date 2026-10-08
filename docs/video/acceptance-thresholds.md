# Computer-Vision Acceptance Thresholds — PROPOSAL

**Owner decision required.** These numbers are a starting proposal, not an approved standard.
Machine-readable copy: `workers/football-cv/eval/thresholds.json` (`"status": "proposed"`).

| Metric | Proposed | Why |
| --- | --- | --- |
| Videos evaluated | ≥ 20, covering camera types (tripod wide, handheld, phone sideline), light (day, floodlight) and levels (youth, amateur) | One club's footage is not representative |
| Visible-time precision | ≥ 0.90 | "You were visible" must almost never be wrong |
| Visible-time recall | ≥ 0.60 | Missing time is shown as unknown, which is honest |
| Likely-off-camera precision | ≥ 0.90 | Must only cover time the player was on the pitch |
| False identity confirmation rate | ≤ 0.05 | Coaching about the wrong person is the worst failure |
| Event precision (target only, ±2 s) | ≥ 0.85 | Before `CV_EVENTS_VALIDATED` may be set |
| Event recall | ≥ 0.60 | |
| Mean event timestamp error | ≤ 1.5 s | Evidence must point at the right moment |

Rules: an unmeasured metric fails; fewer videos than the minimum fails. Passing does not enable
anything automatically — the operator sets `CV_WORKER_APPROVED` / `CV_EVENTS_VALIDATED` after
recording the result in `accuracy-report.md`.
