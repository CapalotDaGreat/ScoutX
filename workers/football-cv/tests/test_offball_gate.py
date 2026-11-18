"""Match-level off-ball gate (worker offball.MIN_CONFIRMED_SEC = 60 s since 02f768d, 2026-10-27).

Separate contracts (reconciled 2026-11-18):
- 60 s: CONFIRMED_VISIBLE seconds anywhere in the match before the worker measures off-ball positioning
  (no continuity requirement; also needs >= 30 s with an opponent measurable nearby).
- 120 s: app coach.ts MIN_CONFIRMED_FOR_COACHING_SEC, used only by the "involvement_improve" insight.
- 6 s: one continuous every-frame CONFIRMED sequence for a clip-only observation (server-checked).
"""
import numpy as np

from scoutx_tracker import offball


def _call(n_conf, n_likely=0):
    n = n_conf + n_likely
    t = np.arange(n) / 10.0
    st = np.array(["CONFIRMED_VISIBLE"] * n_conf + ["LIKELY_VISIBLE"] * n_likely)
    boxes = np.tile([100.0, 100.0, 140.0, 220.0], (n, 1))
    rows = np.zeros((0, 7))
    return offball.offball_observations(t, st, boxes, np.ones(n, bool), rows, {})


def test_constant_is_60_seconds():
    assert offball.MIN_CONFIRMED_SEC == 60.0


def test_below_gate_is_insufficient_and_likely_does_not_count():
    r = _call(599, n_likely=5000)
    assert r["status"] == "insufficient" and r["confirmedSec"] == 59.9 and r["minConfirmedSec"] == 60.0


def test_at_gate_still_needs_measurable_opponents():
    r = _call(600)
    assert r["status"] == "insufficient" and r.get("reason") == "opponents rarely visible near the target"
